---
name: "AgentDB Advanced Features"
description: "Master advanced AgentDB features including QUIC synchronization, multi-database management, custom distance metrics, hybrid search, and distributed systems integration. Use when building distributed AI systems, multi-agent coordination, or advanced vector search applications."
---

# AgentDB Advanced Features

## What This Skill Does

Covers advanced AgentDB capabilities for distributed systems, multi-database coordination, custom distance metrics, hybrid search (vector + metadata), QUIC synchronization, and production deployment patterns.

**Performance**: <1ms QUIC sync, hybrid search with filters, custom distance metrics.

## Prerequisites

- Node.js 18+
- AgentDB v1.0.7+ (via agentic-flow)
- Understanding of distributed systems (for QUIC sync)

---

## QUIC Synchronization

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/distributed.db',
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: ['192.168.1.10:4433', '192.168.1.11:4433'],
});
```

### Multi-Node Deployment

```bash
AGENTDB_QUIC_SYNC=true \
AGENTDB_QUIC_PORT=4433 \
AGENTDB_QUIC_PEERS=192.168.1.11:4433 \
node server.js
```

---

## Distance Metrics

```bash
# Cosine similarity (default)
npx agentdb@latest query ./vectors.db "[0.1,0.2,...]" -m cosine

# Euclidean distance
npx agentdb@latest query ./vectors.db "[0.1,0.2,...]" -m euclidean

# Dot product
npx agentdb@latest query ./vectors.db "[0.1,0.2,...]" -m dot
```

---

## Hybrid Search (Vector + Metadata)

```typescript
const result = await adapter.retrieveWithReasoning(queryEmbedding, {
  domain: 'research-papers',
  k: 20,
  filters: {
    year: { $gte: 2023 },
    category: 'machine-learning',
    citations: { $gte: 50 },
  },
});
```

---

## Multi-Database Management

```typescript
const knowledgeDB = await createAgentDBAdapter({ dbPath: '.agentdb/knowledge.db' });
const conversationDB = await createAgentDBAdapter({ dbPath: '.agentdb/conversations.db' });
const codeDB = await createAgentDBAdapter({ dbPath: '.agentdb/code.db' });
```

---

## MMR (Maximal Marginal Relevance)

```typescript
const diverseResults = await adapter.retrieveWithReasoning(queryEmbedding, {
  k: 10,
  useMMR: true,
  mmrLambda: 0.5,  // 0 = max relevance, 1 = max diversity
});
```

---

## Environment Variables

```bash
AGENTDB_PATH=.agentdb/reasoningbank.db
AGENTDB_QUANTIZATION=binary
AGENTDB_CACHE_SIZE=2000
AGENTDB_QUIC_SYNC=true
AGENTDB_QUIC_PORT=4433
AGENTDB_QUIC_PEERS=host1:4433,host2:4433
```

---

**Category**: Advanced / Distributed Systems
**Difficulty**: Advanced
