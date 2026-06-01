---
name: stream-chain
description: Stream-JSON chaining for multi-agent pipelines, data transformation, and sequential workflows
---

# Stream-Chain Skill

Execute sophisticated multi-step workflows where each agent's output flows into the next, enabling complex data transformations and sequential processing pipelines.

## Overview

Stream-Chain provides two powerful modes for orchestrating multi-agent workflows:

1. **Custom Chains** (`run`): Execute custom prompt sequences with full control
2. **Predefined Pipelines** (`pipeline`): Use battle-tested workflows for common tasks

Each step in a chain receives the complete output from the previous step, enabling sophisticated multi-agent coordination through streaming data flow.

---

## Quick Start

### Run a Custom Chain

```bash
claude-flow stream-chain run \
  "Analyze codebase structure" \
  "Identify improvement areas" \
  "Generate action plan"
```

### Execute a Pipeline

```bash
claude-flow stream-chain pipeline analysis
```

---

## Custom Chains (`run`)

Execute custom stream chains with your own prompts for maximum flexibility.

### Syntax

```bash
claude-flow stream-chain run <prompt1> <prompt2> [...] [options]
```

**Requirements:**
- Minimum 2 prompts required
- Each prompt becomes a step in the chain
- Output flows sequentially through all steps

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--verbose` | Show detailed execution information | `false` |
| `--timeout <seconds>` | Timeout per step | `30` |
| `--debug` | Enable debug mode with full logging | `false` |

### Examples

#### Basic Development Chain

```bash
claude-flow stream-chain run \
  "Write a user authentication function" \
  "Add input validation and error handling" \
  "Create unit tests with edge cases"
```

#### Security Audit Workflow

```bash
claude-flow stream-chain run \
  "Analyze authentication system for vulnerabilities" \
  "Identify and categorize security issues by severity" \
  "Propose fixes with implementation priority" \
  "Generate security test cases" \
  --timeout 45 \
  --verbose
```

---

## Predefined Pipelines (`pipeline`)

### Available Pipelines

#### 1. Analysis Pipeline
```bash
claude-flow stream-chain pipeline analysis
```
**Steps:** Structure Analysis → Issue Detection → Recommendations

#### 2. Refactor Pipeline
```bash
claude-flow stream-chain pipeline refactor
```
**Steps:** Candidate Identification → Prioritization → Implementation

#### 3. Test Pipeline
```bash
claude-flow stream-chain pipeline test
```
**Steps:** Coverage Analysis → Test Design → Implementation

#### 4. Optimize Pipeline
```bash
claude-flow stream-chain pipeline optimize
```
**Steps:** Profiling → Strategy → Implementation

---

## Best Practices

1. **Clear and Specific Prompts** - Be specific about tasks
2. **Logical Progression** - Order prompts to build on previous outputs
3. **Appropriate Timeouts** - Analysis: 45-60s, Implementation: 60-90s
4. **Verification Steps** - Include validation in chains

---

## Integration with Claude Flow

### Memory Integration
Stream chains automatically store context in memory for cross-session persistence.

### Neural Pattern Training
Successful chains train neural patterns for improved performance.

---

## Related Skills

- **SPARC Methodology**: Systematic development workflow
- **Swarm Coordination**: Multi-agent orchestration
- **Memory Management**: Persistent context storage
