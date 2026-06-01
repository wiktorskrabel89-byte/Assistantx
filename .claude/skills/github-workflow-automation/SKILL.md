---
name: github-workflow-automation
description: Advanced GitHub Actions automation with AI swarm coordination for CI/CD pipelines, PR management, issue tracking, and repository optimization. Use when automating GitHub workflows, creating CI/CD pipelines, managing pull requests programmatically, or implementing DevOps automation.
---

# GitHub Workflow Automation Skill

Advanced GitHub Actions automation with AI swarm coordination for comprehensive DevOps workflows.

## Eight Specialized Integration Modes

1. **gh-coordinator** - Hierarchical workflow orchestration (10 parallel ops)
2. **pr-manager** - Automated PR review and conflict resolution
3. **issue-tracker** - Smart label management with progress tracking
4. **release-manager** - Semantic versioning and multi-stage deployment
5. **repo-architect** - Multi-repository optimization
6. **code-reviewer** - Deep analysis including security and performance
7. **ci-orchestrator** - Advanced pipeline with parallel test execution
8. **security-guardian** - Continuous compliance and vulnerability management

## Quick Start

```bash
# Create intelligent CI pipeline
gh workflow run ci.yml

# Auto-label PRs
gh pr edit 123 --add-label "needs-review"

# Trigger release workflow
gh workflow run release.yml -f version=minor
```

## Workflow Templates

### Intelligent CI
```yaml
name: Intelligent CI
on: [push, pull_request]
jobs:
  smart-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Smart test selection
        run: npx claude-flow test --smart-select
```

### Adaptive Security Scan
```yaml
name: Security Scan
on: [push]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run security scan
        run: npm audit && npx snyk test
```

## Best Practices

1. OIDC authentication for secure deployments
2. Least-privilege permissions
3. Caching strategies for faster builds
4. Parallel test execution for speed
5. Automated rollback on failures
