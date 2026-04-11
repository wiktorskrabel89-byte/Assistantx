import os
from dotenv import load_dotenv

# Load from github folder
load_dotenv("github/.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")

print("=== Supabase Setup Instructions ===\n")
print("Your Supabase credentials are loaded:")
print(f"URL: {SUPABASE_URL}\n")

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

print("To create the table, follow these steps:")
print("1. Go to https://app.supabase.com/")
print("2. Select your project")
print("3. Go to SQL Editor (left sidebar)")
print("4. Click 'New Query'")
print("5. Paste the following SQL:\n")
print(sql)
print("\n6. Click 'Run'")
print("\nAfter the table is created, your agent will be ready to use!")

