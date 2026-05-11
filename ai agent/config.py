"""
Centralised configuration for the AssistantX FastAPI backend.
All environment variables are read here. No other module should
call os.getenv() directly.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# OpenAI-compatible API key (used by LangChain OpenAI adapters)
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

# Supabase
SUPABASE_URL: str = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""))
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Anthropic
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

# CORS (comma-separated origins)
CORS_ORIGINS_RAW: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")
CORS_ORIGINS: list[str] = [o.strip() for o in CORS_ORIGINS_RAW.split(",") if o.strip()]
