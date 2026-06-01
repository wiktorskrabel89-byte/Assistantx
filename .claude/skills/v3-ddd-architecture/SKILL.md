---
name: "V3 DDD Architecture"
description: "Domain-Driven Design refactoring for claude-flow v3. Decomposes monolithic orchestrator into five bounded contexts using microkernel pattern, clean architecture, and event-driven integration. Use when redesigning large TypeScript orchestration systems, implementing DDD patterns, or eliminating god objects."
---

# V3 DDD Architecture

## What This Skill Does

Implements Domain-Driven Design architecture for claude-flow v3, decomposing a 1,440-line monolithic orchestrator into five bounded contexts.

## Core Problem & Solution

**Problem**: Oversized orchestrator file combining multiple responsibilities (god object).

**Solution**: Decompose into five bounded contexts:
- Task Management Domain
- Session Management Domain
- Health Monitoring Domain
- Lifecycle Management Domain
- Event Coordination Domain

## Key Architectural Patterns

### Microkernel Pattern
```typescript
// Central kernel loads and manages domains as plugins
class ClaudeFlowKernel {
  private domains = new Map<string, Domain>();

  async loadDomain(name: string): Promise<void> {
    const domain = await this.domainLoader.load(name);
    this.domains.set(name, domain);
  }
}
```

### Clean Architecture Layers
```
Presentation → Application → Domain → Infrastructure
```
Dependencies flow inward - domain layer is independent of external concerns.

### Event-Driven Integration
Domains communicate through domain events rather than direct coupling:
```typescript
// Domain events for loose integration
class TaskAssignedEvent implements DomainEvent {
  constructor(
    public readonly taskId: string,
    public readonly agentId: string,
    public readonly timestamp: Date
  ) {}
}
```

## Implementation Phases

1. **Phase 1**: Extract domain services from orchestrator
2. **Phase 2**: Implement clean interfaces and bounded contexts
3. **Phase 3**: Establish plugin system for optional domain loading

## Success Metrics

- Zero god objects (orchestrator decomposed)
- 100% bounded context isolation
- >90% test coverage
- Optional plugin loading enabled
