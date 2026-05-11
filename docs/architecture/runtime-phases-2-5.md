# Runtime Architecture — Phases 2–5

## Phase 2 — Agent runtime, memory service, Inngest wiring, RBAC policy

### Agent capability profiles (`src/agents/runtime/capability-profile.ts`)
- Each of the five roles (planner, coordinator, researcher, coder, verifier) has an explicit capability profile: allowed tools, allowed scopes, max concurrent tasks, and verifier requirement.
- `isToolAllowedForRole` is the gatekeeper before tool dispatch.

### Role-specific agents
- `planner.ts` — decomposes user goals into typed subtask specs via `decomposeGoal`.
- `researcher.ts` — collects supporting context from memory and search.
- `coder.ts` — accepts coding tasks and declares artifact metadata.
- `verifier.ts` — validates candidate outputs against injection and schema checks.

### Memory service (`src/memory/service/`)
- `types.ts` — layered memory model: short_term, episodic, semantic, procedural.
- `retrieval.ts` — score-based ranking and layer/org filtering.
- `memory-service.ts` — in-process store for Phase 2; swap for Supabase pgvector adapter in later wiring.

### Inngest client (`src/core/events/inngest-client.ts`)
- Typed stub that degrades gracefully when `INNGEST_EVENT_KEY` is absent.
- `InngestEventBus` in `event-bus.ts` now calls `inngestClient.send()` — one place to complete real dispatch.

### Inngest route handler (`app/api/inngest/route.ts`)
- GET/POST/PUT adapter; returns 501 when `INNGEST_SIGNING_KEY` is missing so app boots in CI.

### RBAC (`src/core/policies/rbac.ts`)
- `OrgRole` roles: owner, admin, member, viewer.
- `hasPermission` and `roleCanExecuteTool` are the org-aware policy gates.

### DB migration
- `supabase/migrations/20260511_phase2_runtime_tables.sql`
- Tables: `organizations`, `org_memberships`, `agent_tasks`, `workflow_runs`, `tool_calls`, `approvals`, `audit_logs`.
- RLS helpers: `is_org_member`, `is_org_admin`.

---

## Phase 3 — MCP client, approvals, tenant context, cost tracking

### MCP client (`src/mcp/client/`)
- `types.ts` — `McpServerEntry`, `McpCapability`, `McpTrustLevel`, `McpToolCallRequest/Result`.
- `registry.ts` — in-memory registry for approved MCP servers; `registerMcpServer`, `listMcpServers`.
- `client.ts` — `callMcpTool` validates server presence, emits `MCP_TOOL_CALLED` event.

### Approval queue (`src/core/approvals/`)
- `types.ts` — `ApprovalRequest`, `ApprovalStatus`, `ApprovalResolution`.
- `queue.ts` — request/resolve lifecycle with `APPROVAL_REQUESTED` / `APPROVAL_RESOLVED` events.

### Tenant context (`src/shared/multitenancy/`)
- `tenant-context.ts` — `TenantContext`, `buildTenantContext`, `tenantIsolationKey`.
- `org-rbac.ts` — `tenantHasPermission`, `assertOrgPermission` combining tenant + RBAC checks.

### Cost tracking (`src/core/cost/`)
- `types.ts` — `CostRecord`, `CostLane`, `CostQuota`, `estimateCost`, `getDefaultQuota`.
- `cost-tracker.ts` — records cost per request, emits `COST_RECORDED` event, `totalForUser/Org`.

### DB migration
- `supabase/migrations/20260511_phase3_mcp_cost_events.sql`
- Tables: `mcp_server_registrations`, `runtime_events`, `permissions`, `cost_records`, `rate_limit_entries`.

---

## Phase 4 — Plugin foundations, MCP server, public API v1

### Plugin manifest (`src/plugins/`)
- `manifest.ts` — `PluginManifest`, `PluginCapabilityDeclaration`, `PluginPermissionScope`.
- `registry.ts` — `registerPlugin`, `listPlugins`, `deregisterPlugin`.

### MCP server layer (`src/mcp/server/server.ts`)
- `buildMcpServerToolList` exposes registered plugin capabilities as MCP-compatible tool definitions.
- `handleMcpServerRequest` is the entry point for external AI systems to call AssistantX tools through the governed policy path.

### Public API v1 routes (`app/api/v1/`)
- `workflows/route.ts` — `POST /api/v1/workflows` — triggers a runtime workflow execution.
- `runs/route.ts` — `GET /api/v1/runs` — lists workflow runs for the authenticated caller.
- `memory/route.ts` — `POST /api/v1/memory` — searches the memory service.
- `tools/route.ts` — `POST /api/v1/tools` — invokes a governed tool through the tool router.

### Shared v1 contracts (`src/api/v1/types.ts`)
- Canonical request/response types for all v1 surfaces.

### DB migration
- `supabase/migrations/20260511_phase4_plugins.sql`
- Tables: `plugin_manifests`.

---

## Phase 5 — Marketplace, cross-platform runtime expansion

### Marketplace (`src/marketplace/`)
- `types.ts` — `MarketplaceEntry`, `MarketplaceSubmission`, `MarketplaceTrustLevel`, `MarketplaceCategory`.
- `registry.ts` — `MarketplaceRegistry`: list, submit, approve, reject, pending review queue.

### Cross-platform runtime expansion (`src/ecosystem/runtime-expansion.ts`)
- `ExternalRuntimeRequest` / `ExternalRuntimeResponse` — contract for webhooks, SDK callers, external agents, MCP clients.
- `acceptExternalRequest` — routes into the internal runtime facade.
- `collectRuntimeMetrics` — health surface for OpenTelemetry / Langfuse wiring.

### DB migration
- `supabase/migrations/20260511_phase5_marketplace.sql`
- Tables: `marketplace_listings`, `marketplace_submissions`, `ecosystem_requests`.
