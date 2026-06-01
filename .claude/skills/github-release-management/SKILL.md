---
name: github-release-management
description: Comprehensive GitHub release orchestration with AI swarm coordination for automated versioning, testing, deployment, and rollback management. Use when creating releases, managing version bumps, generating changelogs, or coordinating multi-package deployments.
---

# GitHub Release Management Skill

Intelligent release automation built on AI swarm coordination for versioning, testing, deployment, and rollback.

## Core Capabilities

- Semantic version analysis and breaking change detection
- Multi-stage test orchestration
- Automated changelog generation
- Progressive deployment strategies
- Automated rollback mechanisms

## Quick Start

```bash
# Create a new release
npm version patch && git push --follow-tags

# Generate changelog
npx conventional-changelog -p angular -i CHANGELOG.md -s

# Create GitHub release
gh release create v1.0.0 --title "Release v1.0.0" --notes-file CHANGELOG.md
```

## Swarm Coordination

```javascript
// Initialize release swarm
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 6 })

// Spawn release agents
mcp__claude-flow__agent_spawn({ type: "coordinator", name: "Release Manager" })
mcp__claude-flow__agent_spawn({ type: "tester", name: "Release Validator" })
mcp__claude-flow__agent_spawn({ type: "analyst", name: "Change Analyzer" })
```

## Automation Features

- GitHub Actions integration
- Hotfix workflows
- Real-time monitoring
- Performance regression detection
- Staged rollouts with health checks

## Best Practices

1. Regular release cadences (weekly patches, quarterly major)
2. Feature freeze before major releases
3. Comprehensive CI/CD pipelines
4. Progressive deployment with staged rollouts
5. Automated rollback on health check failures
