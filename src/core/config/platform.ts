/**
 * Platform Architecture Decisions
 *
 * These are LOCKED strategic choices that apply to all runtime development.
 * They are not configuration toggles — changing them requires an explicit
 * architectural decision with migration plan.
 *
 * Decision summary:
 * 1. Inngest  = locked-in orchestration backbone (not provisional)
 * 2. Org-first multitenancy = must precede all public APIs and SDK surfaces
 * 3. High-risk tools = deny-until-approved on ALL paid tiers
 * 4. FastAPI = Jarvis compatibility bridge only (no new shared runtime logic)
 */

export type WorkflowOrchestrator = "inngest";
export type IdentityProvider = "supabase-auth";
export type VectorProvider = "supabase-pgvector" | "pinecone" | "weaviate";
export type BackendHost = "railway" | "render" | "fly-io";
export type HighRiskToolPolicy = "deny_until_approved";
export type FastApiMode = "compatibility_only";
export type OrgMultitenancyPolicy = "org_first_before_public_apis";

export type PlatformDecisions = {
  /**
   * Inngest is the LOCKED orchestration backbone for AssistantX.
   * All durable workflows, agent tasks, approvals, and event-driven execution
   * must go through Inngest. This is not a provisional choice.
   */
  workflowOrchestrator: WorkflowOrchestrator;

  /**
   * Upstash Redis is used ONLY for caching, rate limiting, and lightweight
   * key-value operations. It is NOT used for workflow orchestration.
   */
  cacheProvider: "upstash-redis";

  identityProvider: IdentityProvider;

  /**
   * FastAPI remains a compatibility bridge for Jarvis ONLY.
   * No new shared runtime logic should be added to FastAPI.
   * All new capabilities must land in Node.js / TypeScript.
   */
  fastApiMode: FastApiMode;

  vectorProviderV1: VectorProvider;
  backendHost: BackendHost;

  /**
   * Org-first multitenancy must be complete before public APIs, SDKs, or
   * marketplace surfaces are added. Correct order:
   *   organizations → permissions → tenant isolation → billing → public APIs → SDK
   */
  multitenancyPolicy: OrgMultitenancyPolicy;

  /**
   * All high-risk and critical-risk tools default to "deny until explicitly
   * approved" for ALL paid tiers (free, pro, enterprise).
   * Org admins may customize approval policies after this baseline is in place.
   *
   * High-risk categories:
   * - terminal execution, filesystem write, deployments
   * - GitHub mutations, browser automation, MCP/plugin execution
   * - external integrations with write access
   */
  highRiskToolPolicy: HighRiskToolPolicy;

  /**
   * Whether org membership has been wired to all runtime paths.
   * Flip to true when every workflow, memory item, tool call, and plugin
   * registration is fully tenant-attributed.
   * Until then, missing org context is allowed (personal workspace mode).
   */
  orgEnforcementComplete: boolean;
};

export const PLATFORM_DECISIONS: PlatformDecisions = {
  workflowOrchestrator: "inngest",
  cacheProvider: "upstash-redis",
  identityProvider: "supabase-auth",
  fastApiMode: "compatibility_only",
  vectorProviderV1: "supabase-pgvector",
  backendHost: "railway",
  multitenancyPolicy: "org_first_before_public_apis",
  highRiskToolPolicy: "deny_until_approved",
  orgEnforcementComplete: false,
};

