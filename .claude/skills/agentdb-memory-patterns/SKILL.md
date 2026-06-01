---
name: "AgentDB Memory Patterns"
description: "Implement persistent memory patterns for AI agents using AgentDB. Includes session memory, long-term storage, pattern learning, and context management. Use when building stateful agents, chat systems, or intelligent assistants."
---

# AgentDB Memory Patterns

## What This Skill Does

Provides memory management patterns for AI agents using AgentDB's persistent storage and ReasoningBank integration. Enables agents to remember conversations, learn from interactions, and maintain context across sessions.

**Performance**: 150x-12,500x faster than traditional solutions with 100% backward compatibility.

## Prerequisites

- Node.js 18+
- AgentDB v1.0.7+ (via agentic-flow or standalone)

## Quick Start with CLI

```bash
# Initialize vector database
npx agentdb@latest init ./agents.db

# Start MCP server for Claude Code integration
npx agentdb@latest mcp

# Add to Claude Code (one-time setup)
claude mcp add agentdb npx agentdb@latest mcp
```

## Quick Start with API

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/reasoningbank.db',
  enableLearning: true,
  enableReasoning: true,
  quantizationType: 'scalar',
  cacheSize: 1000,
});

// Store interaction memory
await adapter.insertPattern({
  id: '',
  type: 'pattern',
  domain: 'conversation',
  pattern_data: JSON.stringify({
    embedding: await computeEmbedding('What is the capital of France?'),
    pattern: {
      user: 'What is the capital of France?',
      assistant: 'The capital of France is Paris.',
      timestamp: Date.now()
    }
  }),
  confidence: 0.95,
  usage_count: 1,
  success_count: 1,
  created_at: Date.now(),
  last_used: Date.now(),
});

// Retrieve context with reasoning
const context = await adapter.retrieveWithReasoning(queryEmbedding, {
  domain: 'conversation',
  k: 10,
  useMMR: true,
  synthesizeContext: true,
});
```

## Memory Patterns

### 1. Session Memory
```typescript
class SessionMemory {
  async storeMessage(role: string, content: string) {
    return await db.storeMemory({ sessionId: this.sessionId, role, content, timestamp: Date.now() });
  }

  async getSessionHistory(limit = 20) {
    return await db.query({ filters: { sessionId: this.sessionId }, orderBy: 'timestamp', limit });
  }
}
```

### 2. Long-Term Memory
```typescript
await db.storeFact({ category: 'user_preference', key: 'language', value: 'English', confidence: 1.0 });
const prefs = await db.getFacts({ category: 'user_preference' });
```

### 3. Pattern Learning
```typescript
await db.storePattern({ trigger: 'user_asks_time', response: 'provide_formatted_time', success: true });
const pattern = await db.matchPattern(currentContext);
```

## Reasoning Agents (4 Modules)

1. **PatternMatcher** - Find similar patterns with HNSW indexing
2. **ContextSynthesizer** - Generate rich context from multiple sources
3. **MemoryOptimizer** - Consolidate similar patterns, prune low-quality
4. **ExperienceCurator** - Quality-based experience filtering

## Best Practices

1. Enable quantization for 4-32x memory reduction
2. Use caching for <1ms retrieval
3. Batch operations (500x faster)
4. Train learning models regularly
5. Monitor metrics with `npx agentdb@latest stats ./agents.db`
