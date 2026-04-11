import warnings
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality")

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_anthropic import ChatAnthropic
from langchain_community.vectorstores import SupabaseVectorStore
from langchain.agents import create_agent
from langchain_core.tools import create_retriever_tool
from langchain_core.messages import HumanMessage, SystemMessage
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
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

class Message(BaseModel):
    message: str
    mode: str = "auto"  # "chat", "code", "auto"

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

# gpt-4o-mini: faster & cheaper than gpt-4
llm_chat = ChatOpenAI(model="gpt-4o-mini", temperature=0)
tools = [retriever_tool, note_tool]
agent = create_agent(llm_chat, tools)

# claude-haiku: much faster than claude-opus for code generation
llm_code = ChatAnthropic(model="claude-haiku-4-5", temperature=0)

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
            SystemMessage(content="You are an expert programmer. When generating code, always use proper formatting with markdown code blocks. Be concise and practical."),
            HumanMessage(content=msg.message),
        ]

        async def stream_code():
            yield f"data: {json.dumps({'model': 'Claude'})}\n\n"
            async for chunk in llm_code.astream(messages):
                if chunk.content:
                    yield f"data: {json.dumps({'token': chunk.content})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_code(), media_type="text/event-stream")

    else:
        async def stream_chat():
            yield f"data: {json.dumps({'model': 'OpenAI'})}\n\n"
            async for chunk in llm_chat.astream([HumanMessage(content=msg.message)]):
                if chunk.content:
                    yield f"data: {json.dumps({'token': chunk.content})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_chat(), media_type="text/event-stream")
