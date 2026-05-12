export type CostLane =
  | "classification"
  | "chat"
  | "reasoning"
  | "premium"
  | "embedding"
  | "web_search"
  | "plugin"
  | "mcp";

export type CostRecord = {
  id: string;
  userId: string;
  organizationId: string | null;
  executionId?: string;
  workflowId?: string;
  toolId?: string;
  lane: CostLane;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  createdAt: string;
};

export type CostQuota = {
  dailyUsdLimit: number;
  monthlyUsdLimit: number;
  perRequestUsdLimit: number;
};

const DEFAULT_QUOTAS: Record<"free" | "pro" | "enterprise", CostQuota> = {
  free: { dailyUsdLimit: 0.5, monthlyUsdLimit: 5, perRequestUsdLimit: 0.1 },
  pro: { dailyUsdLimit: 10, monthlyUsdLimit: 100, perRequestUsdLimit: 1 },
  enterprise: { dailyUsdLimit: 100, monthlyUsdLimit: 1000, perRequestUsdLimit: 10 },
};

export function getDefaultQuota(plan: "free" | "pro" | "enterprise"): CostQuota {
  return DEFAULT_QUOTAS[plan];
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Approximate rates per 1M tokens — updated during model routing implementation.
  const rates: Record<string, { input: number; output: number }> = {
    "default": { input: 0.15, output: 0.6 },
    "gemini": { input: 0.075, output: 0.3 },
    "gpt-oss": { input: 2.5, output: 10 },
    // Costed as flat per-call — tokens are minimal for these lanes.
    "embedding": { input: 0.02, output: 0 },
    "web_search": { input: 0, output: 0 },  // costed separately as per-call fee
  };
  const key = Object.keys(rates).find((k) => model.includes(k)) ?? "default";
  const rate = rates[key];
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
