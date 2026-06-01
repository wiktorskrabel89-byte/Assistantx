---
name: "V3 Memory Unification"
description: "Unify 6+ memory systems into AgentDB with HNSW indexing for 150x-12,500x search improvements and 50-75% memory overhead reduction. Use when consolidating multiple memory backends, implementing cross-agent memory sharing, or migrating legacy memory systems to AgentDB."
---

# V3 Memory Unification

## What This Skill Does

Unifies multiple memory backends into a single AgentDB platform while maintaining backward compatibility.

## Core Objective

Consolidate seven distinct memory systems including MemoryManager, DistributedMemorySystem, SwarmMemory, AdvancedMemoryManager, SQLite, Markdown, and Hybrid backends into AgentDB.

## Technical Architecture

```typescript
// UnifiedMemoryService routes queries
class UnifiedMemoryService {
  private agentDB: AgentDBAdapter;
  private hnswIndexer: HNSWIndexer; // dimensions: 1536

  async query(input: MemoryQuery): Promise<MemoryResult[]> {
    if (input.type === 'semantic') {
      return this.agentDB.hnswSearch(input.embedding, input.k);
    }
    return this.agentDB.dbQuery(input.filters);
  }
}
```

## Migration from Legacy Systems

```typescript
// Migrate SQLite backend
await migrateToAgentDB({
  source: '.swarm/memory.db',
  destination: '.agentdb/unified.db',
  format: 'sqlite'
});

// Migrate Markdown backend
await migrateMarkdownMemory({
  source: '.claude/memory/',
  destination: '.agentdb/unified.db'
});
```

## SONA Learning Integration

The system incorporates SONA learning pattern storage, enabling adaptive behavior patterns to be indexed and retrieved semantically.

## Success Criteria

- 150x-12,500x performance improvements via HNSW
- 50-75% memory overhead reduction
- Sub-100ms query latency for massive datasets
- Real-time cross-agent memory synchronization
