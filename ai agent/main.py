import warnings
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality")

import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
import base64

# Load .env from the current working directory (or nearest parent that contains one)
load_dotenv()

logger = logging.getLogger("jarvis-backend")

app = FastAPI()

_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["POST", "GET", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# ── Lazy service registry ──────────────────────────────────────────────────────
# Services that require optional env vars are initialised once on first use.
# Missing config is reported at runtime (HTTP 503) instead of crashing at startup.

_services: dict = {}


def _get_supabase_client():
    if "supabase" not in _services:
        from supabase import create_client as _create_supabase
        url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        key = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
        if not url or not key:
            return None
        try:
            _services["supabase"] = _create_supabase(url, key)
        except Exception as exc:
            logger.warning("Supabase client init failed: %s", exc)
            return None
    return _services["supabase"]


def _get_llm_chat():
    if "llm_chat" not in _services:
        from langchain_openai import ChatOpenAI
        if not os.getenv("OPENAI_API_KEY"):
            return None
        try:
            _services["llm_chat"] = ChatOpenAI(model="gpt-4.5-preview", temperature=0)
        except Exception as exc:
            logger.warning("ChatOpenAI init failed: %s", exc)
            return None
    return _services["llm_chat"]


def _get_llm_code():
    if "llm_code" not in _services:
        from langchain_anthropic import ChatAnthropic
        if not os.getenv("ANTHROPIC_API_KEY"):
            return None
        try:
            _services["llm_code"] = ChatAnthropic(model="claude-sonnet-4-6", temperature=0)
        except Exception as exc:
            logger.warning("ChatAnthropic init failed: %s", exc)
            return None
    return _services["llm_code"]


def _get_openai_client():
    if "openai" not in _services:
        from openai import AsyncOpenAI
        if not os.getenv("OPENAI_API_KEY"):
            return None
        try:
            _services["openai"] = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        except Exception as exc:
            logger.warning("AsyncOpenAI init failed: %s", exc)
            return None
    return _services["openai"]


def _get_retriever():
    if "retriever" not in _services:
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import SupabaseVectorStore
        from langchain_core.tools import create_retriever_tool
        supabase = _get_supabase_client()
        if not supabase or not os.getenv("OPENAI_API_KEY"):
            return None, None
        try:
            embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
            vstore = SupabaseVectorStore(
                client=supabase,
                embedding=embeddings,
                table_name="github",
            )
            retriever = vstore.as_retriever(search_kwargs={"k": 2})
            tool = create_retriever_tool(retriever, "github_search", "Search for github issues")
            _services["retriever"] = (retriever, tool)
        except Exception as exc:
            logger.warning("Retriever init failed: %s", exc)
            return None, None
    return _services["retriever"]


def _get_agent():
    if "agent" not in _services:
        from langchain_community.tools import DuckDuckGoSearchRun
        from langchain.agents import create_agent
        from note import note_tool
        llm = _get_llm_chat()
        _, retriever_tool = _get_retriever()
        if not llm:
            return None
        try:
            tools = [t for t in [retriever_tool, note_tool, DuckDuckGoSearchRun()] if t is not None]
            _services["agent"] = create_agent(llm, tools)
        except Exception as exc:
            logger.warning("Agent init failed: %s", exc)
            return None
    return _services["agent"]


def _unavailable(feature: str):
    return JSONResponse(
        status_code=503,
        content={"error": f"{feature} is not available. Check that the required environment variables (API keys) are set and restart the backend."},
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
                await socket_manager.send_json(
                    websocket,
                    {
                        "type": "presence_snapshot",
                        **socket_manager.summary(),
                    },
                )
                await socket_manager.broadcast(
                    {
                        "type": "peer_registered",
                        "role": role or "unknown",
                        "token": token,
                        **socket_manager.summary(),
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

            if message_type in {"task_update", "command_result", "device_status"}:
                forwarded_payload = dict(payload)
                forwarded_payload["from_role"] = sender_role
                forwarded_payload["token"] = sender_token
                await socket_manager.broadcast(
                    forwarded_payload,
                    exclude=websocket,
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
        disconnected_meta = socket_manager.connections.get(websocket, {"role": "unknown", "token": None})
        socket_manager.disconnect(websocket)
        await socket_manager.broadcast(
            {
                "type": "peer_disconnected",
                "role": disconnected_meta.get("role") or "unknown",
                "token": disconnected_meta.get("token"),
                **socket_manager.summary(),
            },
        )


@app.get("/jarvis/status")
async def jarvis_status():
    config_ok = bool(
        os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        and os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        and os.getenv("OPENAI_API_KEY")
        and os.getenv("ANTHROPIC_API_KEY")
    )
    return {
        "ok": True,
        "config_ok": config_ok,
        "websocket_path": "/ws",
        **socket_manager.summary(),
    }


# --- Streaming, System Prompt, History Limit, RAG ---
@app.post("/chat")
async def chat(msg: Message):
    from langchain_core.messages import HumanMessage, SystemMessage

    llm_chat = _get_llm_chat()
    llm_code = _get_llm_code()
    retriever, _ = _get_retriever()

    mode = msg.mode
    if mode == "auto":
        mode = "code" if is_code_request(msg.message) else "chat"

    if mode == "code" and not llm_code:
        return _unavailable("Code AI (ANTHROPIC_API_KEY missing)")
    if mode != "code" and not llm_chat:
        return _unavailable("Chat AI (OPENAI_API_KEY missing)")

    history = []

    rag_context = ""
    if retriever:
        try:
            docs = retriever.get_relevant_documents(msg.message)
            if docs:
                rag_context = "\n\n".join([d.page_content for d in docs if hasattr(d, "page_content")])
        except Exception:
            rag_context = ""

    system_prompt = SystemMessage(content="You are a powerful AI assistant that writes clear and complete answers.")

    if mode == "code":
        messages = [system_prompt, SystemMessage(content="You are an expert programmer. Detect the language of the user's message and always respond in that same language. When generating code, always use proper formatting with markdown code blocks. Be concise and practical.")]
        if rag_context:
            messages.append(SystemMessage(content=f"Relevant context:\n{rag_context}"))
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
        if rag_context:
            chat_messages.append(SystemMessage(content=f"Relevant context:\n{rag_context}"))
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
    openai_client = _get_openai_client()
    if not openai_client:
        return _unavailable("Image generation (OPENAI_API_KEY missing)")
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
    from langchain_core.messages import HumanMessage, SystemMessage

    llm_chat = _get_llm_chat()
    if not llm_chat:
        return _unavailable("Vision upload (OPENAI_API_KEY missing)")

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
