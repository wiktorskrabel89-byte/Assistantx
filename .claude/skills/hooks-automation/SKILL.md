---
name: hooks-automation
description: Intelligent automation system for Claude Code operations using coordinated hooks, MCP integration, and neural pattern training. Use when automating pre/post-operation workflows, setting up intelligent code validation, or implementing cross-session memory and learning in Claude Code.
---

# Hooks Automation Skill

Automated coordination, formatting, and learning from Claude Code operations through pre/post-operation hooks.

## Core Functionality

- Pre-operation validation (syntax checking, conflict detection, agent assignment)
- Post-operation analysis (auto-formatting, neural training, performance tracking)
- Session state management and Git integration
- Continuous pattern learning

## Hook Types

### Pre-operation Hooks
```bash
# Validate before file edit
npx claude-flow hook pre-edit --file src/app.ts

# Auto-spawn agents before complex task
npx claude-flow hook pre-task --auto-spawn-agents --description "Implement auth"
```

### Post-operation Hooks
```bash
# Format and train after edit
npx claude-flow hook post-edit --file src/app.ts --train-patterns

# Export session metrics
npx claude-flow hook session-end --export-metrics
```

### MCP Integration Hooks
```bash
# Register agent in swarm
npx claude-flow hook mcp-register --agent-type coder

# Orchestrate swarm task
npx claude-flow hook mcp-orchestrate --task "Build API endpoints"
```

## Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{"type": "command", "command": "npx claude-flow hook pre-edit --file $FILE"}]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{"type": "command", "command": "npx claude-flow hook post-edit --file $FILE --train-patterns"}]
      }
    ]
  }
}
```

## Practical Benefits

- Eliminates manual agent assignment decisions
- Enforces consistent code formatting
- Enables knowledge sharing between sessions
- Validates operations before execution
- Tracks comprehensive performance metrics
