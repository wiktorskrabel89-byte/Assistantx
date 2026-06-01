---
name: dual-mode
description: Dual-mode operation for Claude Code agents supporting both interactive and automated execution modes. Use when you need to switch between human-in-the-loop and fully autonomous agent workflows.
---

# Dual-Mode Skill

Enables Claude Code agents to operate in two distinct modes: interactive (human-guided) and automated (fully autonomous), with seamless switching between them.

## Modes

### Interactive Mode
- Human reviews and approves each step
- Step-by-step confirmation before actions
- Suitable for sensitive operations

### Automated Mode
- Fully autonomous execution
- No human intervention required
- Suitable for repetitive, well-defined tasks

## Quick Start

```bash
# Start in interactive mode
npx claude-flow agent start --mode interactive

# Start in automated mode
npx claude-flow agent start --mode automated

# Switch modes at runtime
npx claude-flow agent switch-mode automated
```

## Use Cases

- Development workflows requiring occasional human review
- CI/CD pipelines that need selective human gates
- Multi-agent systems with mixed autonomy levels

## Best Practices

1. Start with interactive mode for new workflows
2. Transition to automated once patterns are established
3. Keep human gates for irreversible operations
