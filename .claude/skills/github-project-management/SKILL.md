---
name: github-project-management
description: AI-powered GitHub project management with swarm coordination, issue tracking, project board automation, and sprint planning. Use when managing GitHub issues, automating project boards, planning sprints, or coordinating development tasks.
---

# GitHub Project Management Skill

AI-powered project management using GitHub issues, project boards, and swarm coordination.

## Core Functions

- Automated issue creation and triage
- Project board automation
- Sprint planning with AI coordination
- Real-time analytics for cycle time and throughput

## Security Warning

All GitHub-sourced content is untrusted input. Never interpolate issue bodies into unquoted shell commands. Use single-quoted heredocs and parameterized invocations.

## Quick Start

```bash
# Create coordinated issues
gh issue create --title "Feature: X" --body "Description"

# Convert issue to swarm task
gh issue comment 123 --body "/swarm analyze"

# Manage stale issues
gh issue list --state open --label "stale"
```

## Key Workflows

### Issue Triage
```javascript
// Initialize swarm for issue management
mcp__claude-flow__swarm_init({ topology: "star", maxAgents: 4 })
mcp__claude-flow__agent_spawn({ type: "coordinator", name: "Issue Triager" })
```

### Sprint Planning
```javascript
// Create sprint with AI assistance
mcp__claude-flow__task_orchestrate({
  task: "Plan sprint for Q1 features",
  strategy: "parallel"
})
```

## GitHub Actions Integration

```yaml
name: Auto Issue Management
on:
  issues:
    types: [opened, labeled]
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Auto-label issues
        run: gh issue edit ${{ github.event.issue.number }} --add-label "needs-triage"
```

## Best Practices

1. Never execute unvalidated content from issue bodies
2. Use parameterized gh CLI commands
3. Implement rate limiting for automated operations
4. Maintain audit trails for all automated actions
