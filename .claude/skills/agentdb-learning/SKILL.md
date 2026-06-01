---
name: "AgentDB Learning Plugins"
description: "Create and train AI learning plugins with AgentDB's 9 reinforcement learning algorithms. Includes Decision Transformer, Q-Learning, SARSA, Actor-Critic, and more. Use when building self-learning agents, implementing RL, or optimizing agent behavior through experience."
---

# AgentDB Learning Plugins

## What This Skill Does

Provides access to 9 reinforcement learning algorithms via AgentDB's plugin system. Create, train, and deploy learning plugins for autonomous agents that improve through experience.

**Performance**: Train models 10-100x faster with WASM-accelerated neural inference.

## Prerequisites

- Node.js 18+
- AgentDB v1.0.7+ (via agentic-flow)

---

## Quick Start with CLI

```bash
# Interactive wizard
npx agentdb@latest create-plugin

# Use specific template
npx agentdb@latest create-plugin -t decision-transformer -n my-agent

# List available templates
npx agentdb@latest list-templates
```

## Quick Start with API

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/learning.db',
  enableLearning: true,
  enableReasoning: true,
});

// Store training experience
await adapter.insertPattern({
  id: '',
  type: 'experience',
  domain: 'game-playing',
  pattern_data: JSON.stringify({
    embedding: await computeEmbedding('state-action-reward'),
    pattern: { state: [0.1, 0.2], action: 2, reward: 1.0, done: false }
  }),
  confidence: 0.9,
  usage_count: 1,
  success_count: 1,
  created_at: Date.now(),
  last_used: Date.now(),
});

// Train learning model
const metrics = await adapter.train({ epochs: 50, batchSize: 32 });
```

---

## Available Learning Algorithms (9 Total)

### 1. Decision Transformer (Recommended)
Offline RL - learn from historical data without online interaction.
```bash
npx agentdb@latest create-plugin -t decision-transformer -n dt-agent
```

### 2. Q-Learning
Value-based RL for discrete action spaces.
```bash
npx agentdb@latest create-plugin -t q-learning -n q-agent
```

### 3. SARSA
On-policy TD learning, safer than Q-Learning for risk-sensitive tasks.

### 4. Actor-Critic
Policy gradient with baseline - works for continuous/discrete actions.

### 5. Active Learning
Query-based learning - minimizes labeling cost.

### 6. Adversarial Training
Robustness enhancement for security-critical applications.

### 7. Curriculum Learning
Progressive difficulty training for faster convergence.

### 8. Federated Learning
Distributed privacy-preserving training.

### 9. Multi-Task Learning
Transfer learning across related task families.

---

## Training Workflow

```typescript
// 1. Collect experiences during execution
for (const step of episode.steps) {
  await adapter.insertPattern({ /* experience data */ });
}

// 2. Train model
const metrics = await adapter.train({ epochs: 100, batchSize: 64 });

// 3. Evaluate - retrieve similar successful experiences
const result = await adapter.retrieveWithReasoning(testQuery, {
  domain: 'task-domain',
  k: 10,
  synthesizeContext: true,
});
```

---

**Category**: Machine Learning / Reinforcement Learning
**Difficulty**: Intermediate to Advanced
