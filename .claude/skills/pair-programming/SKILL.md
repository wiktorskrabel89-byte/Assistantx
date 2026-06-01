---
name: pair-programming
description: AI-assisted pair programming with multiple collaboration modes including driver/navigator, TDD, review, and debug modes. Use when you want real-time coding collaboration, test-driven development assistance, continuous code review, or guided debugging sessions.
---

# Pair Programming Skill

Collaborative development through multiple modes and real-time quality verification.

## Seven Programming Modes

1. **Driver** - You code, AI guides with suggestions
2. **Navigator** - AI codes, you direct the approach
3. **Switch** - Automatic role rotation
4. **TDD** - Test-first development cycle
5. **Review** - Continuous quality assessment
6. **Mentor** - Learning-focused with explanations
7. **Debug** - Systematic problem-solving

## Quick Start

```bash
# Start pair programming session
npx claude-flow pair --mode tdd

# Switch modes
/switch navigator

# Code operations
/explain    # Explain current code
/refactor   # Refactor selection
/test       # Generate tests
/review     # Code review
```

## Verification System

Sessions include automated quality scoring with rollback on failures:

- 0.98+: Excellent (production-ready)
- 0.95-0.97: Good
- 0.90-0.94: Acceptable
- <0.90: Needs improvement (triggers rollback)

## Configuration

```json
{
  "pair": {
    "mode": "tdd",
    "verification": true,
    "autoSave": true,
    "saveInterval": 300,
    "testingEnabled": true,
    "coverageTarget": 80
  }
}
```

## Best Practices

1. Define clear session objectives
2. Select appropriate mode for task type
3. Enable verification for critical code
4. Take breaks every 45-60 minutes
5. Use TDD mode for new feature development
