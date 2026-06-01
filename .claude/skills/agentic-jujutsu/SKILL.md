---
name: agentic-jujutsu
description: |
  Quantum-resistant, self-learning version control for AI agents with ReasoningBank intelligence and multi-agent coordination
---

# Agentic Jujutsu - AI Agent Version Control

> Quantum-ready, self-learning version control designed for multiple AI agents working simultaneously without conflicts.

## When to Use This Skill

- Multiple AI agents modifying code simultaneously
- Lock-free version control (23x faster than Git)
- Self-learning AI that improves from experience
- Quantum-resistant security
- Automatic conflict resolution (87% success rate)
- Multi-agent coordination without blocking

## Quick Start

```javascript
const { JjWrapper } = require('agentic-jujutsu');

const jj = new JjWrapper();

// Basic operations
await jj.status();
await jj.newCommit('Add feature');

// Self-learning trajectory
const id = jj.startTrajectory('Implement authentication');
await jj.branchCreate('feature/auth');
await jj.newCommit('Add auth');
jj.addToTrajectory();
jj.finalizeTrajectory(0.9, 'Clean implementation');

// Get AI suggestions
const suggestion = JSON.parse(jj.getSuggestion('Add logout feature'));
console.log(`Confidence: ${suggestion.confidence}`);
```

## Core Capabilities

### Self-Learning with ReasoningBank

```javascript
jj.startTrajectory('Deploy to production');
await jj.execute(['git', 'push', 'origin', 'main']);
jj.addToTrajectory();
jj.finalizeTrajectory(0.95, 'Deployment successful');

// Get AI-powered suggestions
const suggestion = JSON.parse(jj.getSuggestion('Deploy to staging'));
console.log('Confidence:', (suggestion.confidence * 100).toFixed(1) + '%');
```

### Multi-Agent Coordination

```javascript
// Multiple agents work concurrently (no conflicts!)
await Promise.all(agents.map(async (agent) => {
  const jj = new JjWrapper();
  jj.startTrajectory(`Task for ${agent.name}`);
  await jj.newCommit(`Changes by ${agent.name}`);
  jj.addToTrajectory();
  jj.finalizeTrajectory(0.9);
}));
```

### Quantum-Resistant Security

```javascript
const { generateQuantumFingerprint, verifyQuantumFingerprint } = require('agentic-jujutsu');

const fingerprint = generateQuantumFingerprint(Buffer.from('commit-data'));
const isValid = verifyQuantumFingerprint(data, fingerprint);
```

## Performance vs Git

| Metric | Git | Agentic Jujutsu |
|--------|-----|-----------------|
| Concurrent commits | 15 ops/s | 350 ops/s (23x) |
| Context switching | 500-1000ms | 50-100ms (10x) |
| Conflict resolution | 30-40% auto | 87% auto |
| Lock waiting | 50 min/day | 0 min |

## Validation Rules

- Task descriptions: non-empty, max 10,000 bytes
- Success scores: 0.0-1.0 (finite)
- Must have operations before finalizing

## Best Practices

1. Use meaningful task descriptions
2. Record honest success scores (not always 1.0)
3. Use concurrent operations, not sequential with locks
4. Record failures with detailed critiques for learning
