---
name: "ReasoningBank with AgentDB"
description: "Implement adaptive learning for AI agents using AgentDB's vector database backend for trajectory tracking, verdict judgment, memory distillation, and pattern recognition. Use when building self-learning agents, implementing reinforcement learning patterns, or migrating from legacy ReasoningBank to AgentDB."
---

# ReasoningBank with AgentDB

Implement adaptive learning for AI agents with 150x faster pattern retrieval, 500x faster batch operations, and <1ms memory access.

## Prerequisites

- Node.js 18+
- AgentDB v1.0.7+
- agentic-flow installed

## Quick Start

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/reasoningbank.db',
  enableLearning: true,
  enableReasoning: true,
});

// Start trajectory tracking
await adapter.startTrajectory({
  task: 'Implement user authentication',
  context: { language: 'typescript' }
});

// Record action and outcome
await adapter.recordAction({
  action: 'create_jwt_middleware',
  result: 'success',
  reward: 0.9
});

// Finalize trajectory
await adapter.finalizeTrajectory({ success: true, score: 0.92 });
```

## Four Reasoning Modules

1. **PatternMatcher** - Find similar successful patterns using diversity-aware HNSW retrieval
2. **ContextSynthesizer** - Generate coherent narratives from multiple memory sources
3. **MemoryOptimizer** - Automatically consolidate and remove low-quality patterns
4. **ExperienceCurator** - Filter memories by quality thresholds

## Backward Compatibility

Full compatibility with legacy ReasoningBank APIs - AgentDB backend used automatically.

## Migration from Legacy

```bash
# Migrate existing ReasoningBank data
npx agentdb@latest migrate --source .swarm/memory.db --dest .agentdb/reasoningbank.db
```

## Performance

- Pattern retrieval: 150x faster
- Batch operations: 500x faster
- Memory access: <1ms
