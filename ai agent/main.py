from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
import os
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from langchain.agents import create_agent
from langchain_core.tools import create_retriever_tool
from github.github import fetch_github_issues
from note import note_tool

from supabase import create_client

# Load .env from github subdirectory
script_dir = Path(__file__).parent
env_path = script_dir / "github" / ".env"
load_dotenv(env_path)

app = FastAPI()

class Message(BaseModel):
    message: str

# setup
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
if not SUPABASE_URL:
    raise ValueError("NEXT_PUBLIC_SUPABASE_URL env var missing")

SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
if not SUPABASE_KEY:
    raise ValueError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY env var missing")

supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
embeddings = OpenAIEmbeddings()

vstore = SupabaseVectorStore(
    client=supabase_client,
    embedding=embeddings,
    table_name="github",
)

retriever = vstore.as_retriever(search_kwargs={"k": 3})
retriever_tool = create_retriever_tool(
    retriever,
    "github_search",
    "Search for github issues",
)

llm = ChatOpenAI(model_kwargs={"temperature": 0})  # type: ignore
tools = [retriever_tool, note_tool]
agent = create_agent(llm, tools)

@app.post("/chat")
def chat(msg: Message):
    result = agent.invoke({"input": msg.message})  # type: ignore
    return {"reply": result.get("output", str(result))}
