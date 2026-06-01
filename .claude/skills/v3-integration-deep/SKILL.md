---
name: "V3 Deep Integration"
description: "Deep integration strategy for claude-flow v3 as a specialized extension of agentic-flow@alpha. Eliminates 10,000+ duplicate lines, integrates SONA learning, Flash Attention, and AgentDB coordination. Use when consolidating parallel implementations or building on top of agentic-flow@alpha."
---

# V3 Deep Integration

## What This Skill Does

Transforms claude-flow from a parallel implementation into a specialized extension of agentic-flow@alpha, following ADR-001.

## Core Objective

Eliminate 10,000+ duplicate lines by building claude-flow as a specialized extension rather than a parallel implementation, reducing codebase to under 5,000 lines while maintaining full feature compatibility.

## Key Integration Components

### SONA Learning Modes
Five operational modes supporting diverse deployment scenarios, from real-time adaptation (~0.05ms) to batch processing.

### Flash Attention
Expected performance gains of 2.49x-7.47x improvement with 50-75% memory reduction through optimized attention mechanisms.

### AgentDB Coordination
Cross-agent memory sharing via HNSW indexing targeting 150x-12,500x search performance improvements.

### MCP Tools
Integration of 213 pre-built tools and 19 hook types from agentic-flow@alpha.

## Migration Strategy

```typescript
// Adapter layer for backward compatibility
import { AgenticFlowAdapter } from 'agentic-flow/adapters';

// Replace duplicate SwarmCoordinator
const coordinator = new AgenticFlowAdapter.SwarmCoordinator(config);

// Replace duplicate AgentManager
const manager = new AgenticFlowAdapter.AgentManager(config);
```

## Implementation Phases

1. **Phase 1**: Adapter layer development for backward compatibility
2. **Phase 2**: Systematic replacement of duplicate components
3. **Phase 3**: Deprecation and cleanup of redundant code

Gradual approach enables parallel operation during transition with feature-by-feature validation.
