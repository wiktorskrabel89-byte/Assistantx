from dotenv import load_dotenv
import os
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from langchain.agents import create_agent
from langchain_core.tools import create_retriever_tool
from github.github import fetch_github_issues
from note import note_tool

# Load .env from the github subdirectory using absolute path
script_dir = Path(__file__).parent
env_path = script_dir / "github" / ".env"
load_dotenv(env_path)


def connect_to_vstore():
    from supabase import create_client
    embeddings = OpenAIEmbeddings()
    SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")

    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)

    vstore = SupabaseVectorStore(
        client=supabase_client,
        embedding=embeddings,
        table_name="github",
    )
    return vstore


vstore = connect_to_vstore()
add_to_vectorstore = input("Do you want to update the issues? (y/N): ").lower() in [
    "yes",
    "y",
]

if add_to_vectorstore:
    owner = "wiktorskrabel89-byte"
    repo = "nextjs-boilerplate"
    issues = fetch_github_issues(owner, repo)

    vstore.add_documents(issues)

    # results = vstore.similarity_search("flash messages", k=3)
    # for res in results:
    #     print(f"* {res.page_content} {res.metadata}")

retriever = vstore.as_retriever(search_kwargs={"k": 3})
retriever_tool = create_retriever_tool(
    retriever,
    "github_search",
    "Search for information about github issues. For any questions about github issues, you must use this tool!",
)

llm = ChatOpenAI(temperature=0)

tools = [retriever_tool, note_tool]
agent = create_agent(llm, tools)

while (question := input("Ask a question about github issues (q to quit): ")) != "q":
    try:
        result = agent.invoke({"input": question})
        if "output" in result:
            print(result["output"])
        else:
            print(result)
    except Exception as e:
        print(f"Error: {e}")