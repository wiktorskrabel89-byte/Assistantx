import { FEATURE_FLAGS } from "@/src/core/config/feature-flags";

type RufloConsensusMode = "raft" | "gossip" | "bft";
type RufloTrustBoundary = "local" | "federated" | "zero_trust";

export type RufloMcpCapabilityMetadata = {
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  requiresActorAttribution: boolean;
};

export type RufloInstallableProfile = {
  serverId: "ruflo";
  pluginId: "mcp-ruflo";
  name: string;
  description: string;
  mcpCommand: string;
  productionPath: "mcp_registration_only";
  nonProductionPath: "plugin_lite";
  capabilities: RufloMcpCapabilityMetadata[];
};

export type RufloRuntimeConfig = {
  enabled: boolean;
  trainingEnabled: boolean;
  binary: string;
  workspacePath: string;
  memoryNamespace: string;
  healthTimeoutMs: number;
  mcpServerUrl: string | null;
  trustBoundary: RufloTrustBoundary;
};

export type RufloHealthSnapshot = {
  enabled: boolean;
  mode: "disabled" | "adapter";
  productionPath: "mcp_registration_only";
  workspaceReady: boolean;
  mcpConfigured: boolean;
  memoryNamespace: string;
  trainingEnabled: boolean;
  trustBoundary: RufloTrustBoundary;
  consensusMode: RufloConsensusMode;
};

export type RufloWorkspaceLifecycle = {
  initCommand: string;
  registerMcpCommand: string;
  healthCommand: string;
  shutdownInstructions: string;
};

function parseBool(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseTrustBoundary(value: string | undefined): RufloTrustBoundary {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "federated") return "federated";
  if (normalized === "zero_trust") return "zero_trust";
  return "local";
}

function resolveConsensusMode(boundary: RufloTrustBoundary): RufloConsensusMode {
  if (boundary === "zero_trust") return "bft";
  if (boundary === "federated") return "gossip";
  return "raft";
}

export const RUFLO_INSTALLABLE_PROFILE: RufloInstallableProfile = {
  serverId: "ruflo",
  pluginId: "mcp-ruflo",
  name: "Ruflo Swarm Orchestrator",
  description:
    "External multi-agent swarm orchestration adapter (Queen/Worker) integrated through AssistantX MCP governance.",
  mcpCommand: "claude mcp add ruflo -- npx ruflo@latest mcp start",
  productionPath: "mcp_registration_only",
  nonProductionPath: "plugin_lite",
  capabilities: [
    {
      name: "ruflo/swarm_init",
      description: "Initialize a Ruflo swarm session in the local repository workspace.",
      riskLevel: "medium",
      requiresApproval: false,
      requiresActorAttribution: true,
    },
    {
      name: "ruflo/agent_spawn",
      description: "Spawn specialized Ruflo worker agents under Queen orchestration.",
      riskLevel: "high",
      requiresApproval: true,
      requiresActorAttribution: true,
    },
    {
      name: "ruflo/memory_store",
      description: "Write persistent shared swarm memory entries to Ruflo namespace.",
      riskLevel: "high",
      requiresApproval: true,
      requiresActorAttribution: true,
    },
    {
      name: "ruflo/train_pipeline",
      description: "Execute Ruflo local self-learning training pipeline.",
      riskLevel: "critical",
      requiresApproval: true,
      requiresActorAttribution: true,
    },
    {
      name: "ruflo/health",
      description: "Check local Ruflo daemon and workspace coupling health.",
      riskLevel: "low",
      requiresApproval: false,
      requiresActorAttribution: false,
    },
  ],
};

export function getRufloRuntimeConfig(): RufloRuntimeConfig {
  const enabled = FEATURE_FLAGS.rufloEnabled;
  const trainingEnabled = FEATURE_FLAGS.rufloTrainingEnabled
    && parseBool(process.env.RUFLO_TRAINING_ENABLED, false);
  return {
    enabled,
    trainingEnabled,
    binary: process.env.RUFLO_BINARY?.trim() || "npx ruflo@latest",
    workspacePath: process.env.RUFLO_WORKSPACE_PATH?.trim() || process.cwd(),
    memoryNamespace: process.env.RUFLO_MEMORY_NAMESPACE?.trim() || "assistantx/default",
    healthTimeoutMs: Math.max(1000, Number(process.env.RUFLO_HEALTH_TIMEOUT_MS ?? 5000)),
    mcpServerUrl: process.env.RUFLO_MCP_SERVER_URL?.trim() || null,
    trustBoundary: parseTrustBoundary(process.env.RUFLO_TRUST_BOUNDARY),
  };
}

export function getRufloHealthSnapshot(): RufloHealthSnapshot {
  const config = getRufloRuntimeConfig();
  const workspaceReady = Boolean(config.workspacePath);
  const mcpConfigured = Boolean(config.mcpServerUrl);
  return {
    enabled: config.enabled,
    mode: config.enabled ? "adapter" : "disabled",
    productionPath: "mcp_registration_only",
    workspaceReady,
    mcpConfigured,
    memoryNamespace: config.memoryNamespace,
    trainingEnabled: config.trainingEnabled,
    trustBoundary: config.trustBoundary,
    consensusMode: resolveConsensusMode(config.trustBoundary),
  };
}

export function getRufloWorkspaceLifecycle(): RufloWorkspaceLifecycle {
  const config = getRufloRuntimeConfig();
  return {
    initCommand: `cd ${JSON.stringify(config.workspacePath)} && npx ruvflo init`,
    registerMcpCommand: RUFLO_INSTALLABLE_PROFILE.mcpCommand,
    healthCommand: "GET /api/mcp/ruflo/health",
    shutdownInstructions: "Disable MCP registration for ruflo in host CLI and set RUFLO_ENABLED=false.",
  };
}
