# Runtime Foundation (Phase 1)

This document captures the implemented architecture foundation for the AssistantX migration toward an enterprise runtime model.

## Finalized platform choices

- Primary workflow/event orchestration: **Inngest**
- Upstash role: **caching + lightweight Redis concerns + rate limiting**
- Long-term identity: **Supabase Auth**
- FastAPI backend: **compatibility bridge only** (frozen for new features)
- Vector layer (v1): **Supabase pgvector**
- Backend host target: **Railway**
- Ruflo integration mode: **external adapter only** (never replaces Inngest)
- Ruflo production path: **full MCP registration (Path B) only** (`claude mcp add ruflo -- npx ruflo@latest mcp start`)

## Implemented foundation modules

- `src/core/config/platform.ts`
  - Centralized platform decisions for runtime architecture.
- `src/core/events/*`
  - Runtime event contracts and event bus boundary.
- `src/core/policies/tool-policy.ts`
  - Zero-trust policy gate for tool execution authorization.
- `src/tools/router/*`
  - Governed tool-router skeleton with registry, policy checks, and event hooks.
- `src/agents/runtime/*`
  - Agent-role task types and coordinator task runner skeleton.
- `src/backend/runtime/*`
  - Runtime execution facade and FastAPI legacy bridge status marker.
- `app/api/runtime/execute/route.ts`
  - Thin API adapter over runtime facade (anti-corruption entrypoint).

## Immediate migration intent

1. Keep existing route handlers operational while moving new runtime features behind `src/backend/runtime`.
2. Route future integration execution through the tool router boundary instead of direct route-local calls.
3. Keep FastAPI alive only for Jarvis compatibility while preventing new architecture work from landing there.

## Ruflo local repo coupling runbook (Path B only)

1. In local clone, initialize Ruflo workspace:
   - `npx ruvflo init`
2. Register Ruflo MCP server in host CLI:
   - `claude mcp add ruflo -- npx ruflo@latest mcp start`
3. Configure AssistantX runtime env:
   - `RUFLO_ENABLED=true`
   - `RUFLO_MEMORY_NAMESPACE=<tenant namespace>`
   - `RUFLO_MCP_SERVER_URL=<optional health URL>`
4. Verify health from AssistantX:
   - call `GET /api/mcp/ruflo/health`
5. Shutdown / disable safely:
   - disable server in MCP host and set `RUFLO_ENABLED=false`

> Plugin-lite installation path is explicitly non-production and unsupported for governed runtime execution.
