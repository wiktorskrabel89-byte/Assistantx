export type WorkflowOrchestrator = "inngest" | "upstash-redis";
export type IdentityProvider = "supabase-auth" | "clerk";
export type VectorProvider = "supabase-pgvector" | "pinecone" | "weaviate";
export type BackendHost = "railway" | "render" | "fly-io";

export type PlatformDecisions = {
  workflowOrchestrator: WorkflowOrchestrator;
  cacheProvider: "upstash-redis";
  identityProvider: IdentityProvider;
  keepFastApiCompatibilityBridge: boolean;
  vectorProviderV1: VectorProvider;
  backendHost: BackendHost;
};

export const PLATFORM_DECISIONS: PlatformDecisions = {
  workflowOrchestrator: "inngest",
  cacheProvider: "upstash-redis",
  identityProvider: "supabase-auth",
  keepFastApiCompatibilityBridge: true,
  vectorProviderV1: "supabase-pgvector",
  backendHost: "railway",
};

