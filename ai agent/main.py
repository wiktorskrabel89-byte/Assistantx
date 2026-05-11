import warnings
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality")

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
import base64

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_anthropic import ChatAnthropic
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_community.tools import DuckDuckGoSearchRun
from langchain.agents import create_agent
from langchain_core.tools import create_retriever_tool
from langchain_core.messages import HumanMessage, SystemMessage
from openai import AsyncOpenAI
from github.github import fetch_github_issues
from note import note_tool

from supabase import create_client

# Auto-discover .env file(s) up the directory tree
load_dotenv()

app = FastAPI()

_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["POST", "GET", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class JarvisSocketManager:
    def __init__(self):
        self.connections: dict[WebSocket, dict[str, str | None]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections[websocket] = {"role": None, "token": None}

    def disconnect(self, websocket: WebSocket):
        self.connections.pop(websocket, None)

    def register(self, websocket: WebSocket, role: str | None, token: str | None):
        self.connections[websocket] = {
            "role": role or "unknown",
            "token": token,
        }

    def peers(self, *, exclude: WebSocket | None = None, role: str | None = None):
        for websocket, meta in self.connections.items():
            if exclude is not None and websocket is exclude:
                continue
            if role is not None and meta.get("role") != role:
                continue
            yield websocket, meta

    def summary(self):
        entries = []
        for _websocket, meta in self.connections.items():
            entries.append(
                {
                    "role": meta.get("role") or "unknown",
                    "token": meta.get("token"),
                }
            )

        role_counts = {}
        for entry in entries:
            role = entry["role"]
            role_counts[role] = role_counts.get(role, 0) + 1

        return {
            "active_connections": len(entries),
            "role_counts": role_counts,
            "clients": entries,
        }

    async def send_json(self, websocket: WebSocket, payload: dict):
        await websocket.send_text(json.dumps(payload))

    async def broadcast(self, payload: dict, *, exclude: WebSocket | None = None, role: str | None = None):
        stale_connections = []
        for websocket, _meta in self.peers(exclude=exclude, role=role):
            try:
                await self.send_json(websocket, payload)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(websocket)


socket_manager = JarvisSocketManager()

class Message(BaseModel):
    message: str
    mode: str = "auto"  # "chat", "code", "auto", "image"

class ImageRequest(BaseModel):
    prompt: str

class UploadRequest(BaseModel):
    file_base64: str
    mime_type: str
    message: str = ""

# setup
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
if not SUPABASE_URL:
    raise ValueError("NEXT_PUBLIC_SUPABASE_URL env var missing")

SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
if not SUPABASE_KEY:
    raise ValueError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY env var missing")

supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vstore = SupabaseVectorStore(
    client=supabase_client,
    embedding=embeddings,
    table_name="github",
)

retriever = vstore.as_retriever(search_kwargs={"k": 2})
retriever_tool = create_retriever_tool(
    retriever,
    "github_search",
    "Search for github issues",
)

# gpt-4.5-preview: best OpenAI model for chat (fast, multimodal, highly capable)
llm_chat = ChatOpenAI(model="gpt-4.5-preview", temperature=0)
search_tool = DuckDuckGoSearchRun()
tools = [retriever_tool, note_tool, search_tool]
agent = create_agent(llm_chat, tools)

# claude-sonnet-4-6: best Claude model for coding (top benchmark scores, fast)
llm_code = ChatAnthropic(model="claude-sonnet-4-6", temperature=0)

# OpenAI async client for image generation
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

CODE_KEYWORDS = [
    "kod", "code", "funkcja", "function", "skrypt", "script",
    "napisz", "wygeneruj", "implement", "stwórz", "fix", "napraw",
    "class", "klasa", "def ", "const ", "let ", "var ", "import ",
    "snippet", "przykład kodu",
]

def is_code_request(message: str) -> bool:
    msg_lower = message.lower()
    return any(keyword in msg_lower for keyword in CODE_KEYWORDS)


@app.websocket("/ws")
async def jarvis_websocket(websocket: WebSocket):
    await socket_manager.connect(websocket)
    await socket_manager.send_json(
        websocket,
        {
            "type": "status",
            "status": "connected",
            "message": "Jarvis WebSocket connected.",
        },
    )

    try:
        while True:
            raw_message = await websocket.receive_text()

            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                await socket_manager.send_json(
                    websocket,
                    {
                        "type": "error",
                        "message": "Invalid JSON payload.",
                    },
                )
                continue

            message_type = payload.get("type")
            role = payload.get("role")
            token = payload.get("token")

            if message_type == "register":
                socket_manager.register(websocket, role, token)
                await socket_manager.send_json(
                    websocket,
                    {
                        "type": "registered",
                        "role": role or "unknown",
                        "token": token,
                    },
                )
                await socket_manager.broadcast(
                    {
                        "type": "peer_registered",
                        "role": role or "unknown",
                        "token": token,
                    },
                    exclude=websocket,
                )
                continue

            sender = socket_manager.connections.get(websocket, {"role": role, "token": token})
            sender_role = sender.get("role") or role or "unknown"
            sender_token = sender.get("token") or token

            if message_type == "desktop_prompt":
                text = payload.get("text", "")
                await socket_manager.send_json(
                    websocket,
                    {
                        "type": "ack",
                        "message": "Prompt received by Jarvis backend.",
                        "text": text,
                    },
                )
                await socket_manager.broadcast(
                    {
                        "type": "desktop_prompt",
                        "text": text,
                        "from_role": sender_role,
                        "token": sender_token,
                    },
                    exclude=websocket,
                )
                continue

            if message_type == "response":
                await socket_manager.broadcast(
                    {
                        "type": "response",
                        "text": payload.get("text", ""),
                        "from_role": sender_role,
                        "token": sender_token,
                    },
                    exclude=websocket,
                )
                continue

            if message_type == "command":
                command = payload.get("command")
                app_name = payload.get("app")
                await socket_manager.broadcast(
                    {
                        "type": "command",
                        "command": command,
                        "app": app_name,
                        "from_role": sender_role,
                        "token": sender_token,
                    },
                    exclude=websocket,
                )
                await socket_manager.send_json(
                    websocket,
                    {
                        "type": "ack",
                        "message": f"Command queued: {command}",
                    },
                )
                continue

            await socket_manager.send_json(
                websocket,
                {
                    "type": "warning",
                    "message": f"Unsupported message type: {message_type}",
                },
            )
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)


@app.get("/jarvis/status")
async def jarvis_status():
    return {
        "ok": True,
        "websocket_path": "/ws",
        **socket_manager.summary(),
    }


# --- Streaming, System Prompt, History Limit, RAG ---
@app.post("/chat")
async def chat(msg: Message):
    mode = msg.mode
    if mode == "auto":
        mode = "code" if is_code_request(msg.message) else "chat"


    # --- Limit history to 20 (Supabase) ---
    # Example: fetch last 20 messages from Supabase (pseudo, adapt to your schema)
    # history = supabase_client.table("chat_history").select("*").order("created_at", desc=True).limit(20).execute().data[::-1]
    history = []  # Replace with actual Supabase fetch if needed

    # --- RAG: retrieve context from SupabaseVectorStore ---
    # Use retriever to get relevant context for the user message
    rag_context = ""
    try:
        docs = retriever.get_relevant_documents(msg.message)
        if docs:
            rag_context = "\n\n".join([d.page_content for d in docs if hasattr(d, "page_content")])
    except Exception as e:
        rag_context = ""  # fallback if retrieval fails

    # --- System prompt ---
    system_prompt = SystemMessage(content="You are a powerful AI assistant that writes clear and complete answers.")

    if mode == "code":
        messages = [system_prompt, SystemMessage(content="You are an expert programmer. Detect the language of the user's message and always respond in that same language. When generating code, always use proper formatting with markdown code blocks. Be concise and practical.")]
        # Add RAG context if available
        if rag_context:
            messages.append(SystemMessage(content=f"Relevant context:\n{rag_context}"))
        # Add history if available
        messages += history
        messages.append(HumanMessage(content=msg.message))

        async def stream_code():
            yield f"data: {json.dumps({'model': 'Claude Sonnet 4.6'})}\n\n"
            async for chunk in llm_code.astream(messages):
                if chunk.content:
                    yield f"data: {json.dumps({'token': chunk.content})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_code(), media_type="text/event-stream")

    else:
        chat_messages = [system_prompt, SystemMessage(content="Detect the language of the user's message and always respond in that same language. Be helpful, friendly and conversational.")]
        # Add RAG context if available
        if rag_context:
            chat_messages.append(SystemMessage(content=f"Relevant context:\n{rag_context}"))
        # Add history if available
        chat_messages += history
        chat_messages.append(HumanMessage(content=msg.message))

        async def stream_chat():
            yield f"data: {json.dumps({'model': 'GPT-4.5 Preview'})}\n\n"
            async for chunk in llm_chat.astream(chat_messages):
                if chunk.content:
                    yield f"data: {json.dumps({'token': chunk.content})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_chat(), media_type="text/event-stream")

@app.post("/image")
async def generate_image(req: ImageRequest):
    response = await openai_client.images.generate(
        model="dall-e-3",
        prompt=req.prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )
    image_url = response.data[0].url
    return {"url": image_url, "model": "DALL-E 3"}

@app.post("/upload")
async def upload_file(req: UploadRequest):
    image_data = base64.b64decode(req.file_base64)
    base64_str = base64.b64encode(image_data).decode("utf-8")

    messages = [
        SystemMessage(content="You are a helpful assistant with vision capabilities. Detect the language of the user's message and always respond in that same language."),
        HumanMessage(content=[
            {"type": "image_url", "image_url": {"url": f"data:{req.mime_type};base64,{base64_str}"}},
            {"type": "text", "text": req.message or "What do you see in this image?"},
        ]),
    ]

    async def stream_upload():
        yield f"data: {json.dumps({'model': 'GPT-4.5 Preview'})}\n\n"
        async for chunk in llm_chat.astream(messages):
            if chunk.content:
                yield f"data: {json.dumps({'token': chunk.content})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_upload(), media_type="text/event-stream")
