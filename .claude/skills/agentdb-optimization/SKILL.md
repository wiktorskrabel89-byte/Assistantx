---
name: "AgentDB Performance Optimization"
description: "Optimize AgentDB performance with quantization (4-32x memory reduction), HNSW indexing (150x faster search), caching, and batch operations. Use when optimizing memory usage, improving search speed, or scaling to millions of vectors."
---

# AgentDB Performance Optimization

## What This Skill Does

Provides comprehensive performance optimization techniques for AgentDB vector databases. Achieve 150x-12,500x performance improvements through quantization, HNSW indexing, caching strategies, and batch operations. Reduce memory usage by 4-32x while maintaining accuracy.

**Performance**: <100µs vector search, <1ms pattern retrieval, 2ms batch insert for 100 vectors.

## Quick Start

```bash
npx agentdb@latest benchmark
```

## Quantization Strategies

### Binary Quantization (32x Reduction)
```typescript
const adapter = await createAgentDBAdapter({
  quantizationType: 'binary',  // 768-dim → 96 bytes
  cacheSize: 1000,
});
```

### Scalar Quantization (4x Reduction)
```typescript
const adapter = await createAgentDBAdapter({
  quantizationType: 'scalar',  // 768-dim → 768 bytes (uint8)
});
```

### Product Quantization (8-16x Reduction)
```typescript
const adapter = await createAgentDBAdapter({
  quantizationType: 'product',  // 768-dim → 48-96 bytes
});
```

## HNSW Indexing

```typescript
const adapter = await createAgentDBAdapter({
  hnswM: 16,               // Connections per layer
  hnswEfConstruction: 200, // Build quality
  hnswEfSearch: 100,       // Search quality
});
```

## Optimization Recipes

### Maximum Speed
```typescript
{ quantizationType: 'binary', cacheSize: 5000, hnswM: 8, hnswEfSearch: 50 }
// Expected: <50µs search, 90-95% accuracy
```

### Balanced Performance
```typescript
{ quantizationType: 'scalar', cacheSize: 1000, hnswM: 16, hnswEfSearch: 100 }
// Expected: <100µs search, 98-99% accuracy
```

### Maximum Accuracy
```typescript
{ quantizationType: 'none', cacheSize: 2000, hnswM: 32, hnswEfSearch: 200 }
// Expected: <200µs search, 100% accuracy
```

## Performance Benchmarks

| Operation | Vector Count | No Optimization | Optimized | Improvement |
|-----------|-------------|-----------------|-----------|-------------|
| Search | 10K | 15ms | 100µs | 150x |
| Search | 1M | 100s | 8ms | 12,500x |
| Batch Insert (100) | - | 1s | 2ms | 500x |
| Memory Usage | 1M | 3GB | 96MB | 32x (binary) |

**Category**: Performance / Optimization
**Difficulty**: Intermediate
