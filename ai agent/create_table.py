import os
from pathlib import Path
from dotenv import load_dotenv
import subprocess

# Load environment variables
script_dir = Path(__file__).parent
env_path = script_dir / "github" / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")

# The SQL to create the table
sql = """
CREATE TABLE IF NOT EXISTS github (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS github_embedding_idx ON github 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
"""

print("=" * 60)
print("SUPABASE TABLE CREATION")
print("=" * 60)
print(f"\nYour Supabase URL: {SUPABASE_URL}")
print(f"API Key is configured: {'✓' if SUPABASE_KEY else '✗'}")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("\n❌ Error: Supabase credentials not found!")
    exit(1)

print("\n" + "=" * 60)
print("TO CREATE THE TABLE MANUALLY:")
print("=" * 60)
print("1. Go to https://app.supabase.com/")
print("2. Sign in with your account")
print("3. Select your project")
print("4. Click 'SQL Editor' in the left sidebar")
print("5. Click '+ New Query'")
print("6. Copy and paste this SQL:\n")
print(sql)
print("\n7. Click 'Run'")
print("\n" + "=" * 60)
print("After table creation, your agent will work!")
print("=" * 60)
