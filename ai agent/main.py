import warnings
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality")

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
import base64
from pathlib import Path

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

# Load .env from github subdirectory
script_dir = Path(__file__).parent
env_path = script_dir / "github" / ".env"
load_dotenv(env_path)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST", "GET", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

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

@app.post("/chat")
async def chat(msg: Message):
    mode = msg.mode
    if mode == "auto":
        mode = "code" if is_code_request(msg.message) else "chat"

    if mode == "code":
        messages = [
            SystemMessage(content="You are an expert programmer. Detect the language of the user's message and always respond in that same language. When generating code, always use proper formatting with markdown code blocks. Be concise and practical."),
            HumanMessage(content=msg.message),
        ]

        async def stream_code():
            yield f"data: {json.dumps({'model': 'Claude Sonnet 4.6'})}\n\n"
            async for chunk in llm_code.astream(messages):
                if chunk.content:
                    yield f"data: {json.dumps({'token': chunk.content})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_code(), media_type="text/event-stream")

    else:
        chat_messages = [
            SystemMessage(content="Detect the language of the user's message and always respond in that same language. Be helpful, friendly and conversational."),
            HumanMessage(content=msg.message),
        ]

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
