---
name: "AgentDB Vector Search"
description: "Implement semantic vector search with AgentDB for intelligent document retrieval, similarity matching, and context-aware querying. Use when building RAG systems, semantic search engines, or intelligent knowledge bases."
---

# AgentDB Vector Search

## What This Skill Does

Implements vector-based semantic search using AgentDB's high-performance vector database with 150x-12,500x faster operations than traditional solutions. Features HNSW indexing, quantization, and sub-millisecond search (<100µs).

## Quick Start with CLI

```bash
# Initialize vector database
npx agentdb@latest init ./vectors.db

# Query with similarity search
npx agentdb@latest query ./vectors.db "[0.1,0.2,0.3,...]"

# Top-k results with threshold
npx agentdb@latest query ./vectors.db "[0.1,0.2,0.3]" -k 10 -t 0.75

# JSON output
npx agentdb@latest query ./vectors.db "[...]" -f json -k 5
```

## Quick Start with API

```typescript
import { createAgentDBAdapter, computeEmbedding } from 'agentic-flow/reasoningbank';

const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/vectors.db',
  enableReasoning: true,
  quantizationType: 'binary',
  cacheSize: 1000,
});

// Store document with embedding
const text = "The quantum computer achieved 100 qubits";
const embedding = await computeEmbedding(text);

await adapter.insertPattern({
  id: '',
  type: 'document',
  domain: 'technology',
  pattern_data: JSON.stringify({ embedding, text }),
  confidence: 1.0,
  usage_count: 0,
  success_count: 0,
  created_at: Date.now(),
  last_used: Date.now(),
});

// Semantic search
const queryEmbedding = await computeEmbedding("quantum computing advances");
const results = await adapter.retrieveWithReasoning(queryEmbedding, {
  domain: 'technology',
  k: 10,
  useMMR: true,
  synthesizeContext: true,
});
```

## RAG (Retrieval Augmented Generation)

```typescript
async function ragQuery(question: string) {
  const context = await db.searchSimilar(await embed(question), { limit: 5, threshold: 0.7 });
  const prompt = `Context: ${context.map(c => c.text).join('\n')}\nQuestion: ${question}`;
  return await llm.generate(prompt);
}
```

## MCP Server Integration

```bash
npx agentdb@latest mcp
claude mcp add agentdb npx agentdb@latest mcp
```

## Performance Tips

1. Enable HNSW indexing (automatic)
2. Use binary quantization for 32x memory reduction
3. Batch operations for 500x faster inserts
4. Match dimensions to your embedding model (1536 for OpenAI, 768 for sentence-transformers)
5. Enable caching for frequent queries
