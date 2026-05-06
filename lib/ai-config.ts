export type CostTier = "free" | "cheap" | "standard" | "premium";
export type CostMode = "thrifty" | "balanced" | "performance";
export type UserPlan = "free" | "pro" | "pro+";

export type PremiumPlanInfo = {
  priceUsd: number;
  unlimitedChats: boolean;
  premiumRequestsPerMonth: number;
  description: string;
};

/** Pro plan — $10/month, 300 premium requests, all models except Pro+-exclusive. */
export const PRO_PLAN: PremiumPlanInfo = {
  priceUsd: 10,
  unlimitedChats: true,
  premiumRequestsPerMonth: 300,
  description: "Unlimited chats, 300 premium requests/month, access to all models.",
};

/** Pro+ plan — $30/month, 1500 premium requests (5× Pro), all models including Claude Opus 4.7. */
export const PRO_PLUS_PLAN: PremiumPlanInfo = {
  priceUsd: 30,
  unlimitedChats: true,
  premiumRequestsPerMonth: 1500,
  description: "Unlimited chats, 1500 premium requests/month, all models including Claude Opus 4.7.",
};

/** Models that require Pro+ and are not accessible on the free or Pro plans. */
export const PRO_PLUS_ONLY_MODELS: string[] = [
  "anthropic/claude-opus-4.7",
];

// Legacy aliases for backward compatibility during migration
/** @deprecated Use PRO_PLAN */
export const STARTER_PLAN = PRO_PLAN;
/** @deprecated Use PRO_PLUS_PLAN */
export const PREMIUM_PLAN = PRO_PLUS_PLAN;

export type ModelOption = {
  id: string;
  label: string;
  description: string;
};

export type ModelPreset = {
  id: string;
  label: string;
  modelId: string;
  costTier: CostTier;
};

export type LanguageOption = {
  code: string;
  label: string;
};

export const CHAT_MODELS: ModelOption[] = [
  // Only include models referenced in RECOMMENDED_CHAT_MODELS or as free fallbacks
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (Free)",
    description: "Best free open model for chat and reasoning.",
  },
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B (Free)",
    description: "Free OpenAI open-source 120B model.",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    label: "GLM 4.5 Air (Free)",
    description: "Free lightweight GLM chat model.",
  },
  {
    id: "minimax/minimax-m2.5:free",
    label: "MiniMax M2.5 (Free)",
    description: "Free MiniMax general-purpose model.",
  },
  {
    id: "openai/gpt-5.2",
    label: "GPT-5.2",
    description: "Premium OpenAI chat model.",
  },
  {
    id: "openai/gpt-5.3",
    label: "GPT-5.3",
    description: "Advanced OpenAI chat model.",
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    description: "Latest frontier chat and coding model.",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    description: "Strong reasoning and writing.",
  },
  {
    id: "anthropic/claude-opus-4.6",
    label: "Claude Opus 4.6",
    description: "Premium Claude model for chat and analysis.",
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    description: "Latest premium Claude model for chat and code.",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    description: "Fast general-purpose chat.",
  },
];

export const CODE_MODELS: ModelOption[] = [
  // Only include models referenced in RECOMMENDED_CODING_MODELS or as free fallbacks
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B (Free)",
    description: "Free OpenAI open-source 120B coding model.",
  },
  {
    id: "minimax/minimax-m2.5:free",
    label: "MiniMax M2.5 (Free)",
    description: "Free MiniMax model for code tasks.",
  },
  {
    id: "anthropic/claude-opus-4.6",
    label: "Claude Opus 4.6",
    description: "Premium code and analysis model.",
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    description: "Latest premium Claude model for code and analysis.",
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    description: "Latest frontier coding model.",
  },
  {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    description: "Latest premium OpenAI coding model.",
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    description: "Reasoning-heavy coding model.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super (Free)",
    description: "NVIDIA's free code model (alternative free option).",
  },
];

export const SEARCH_MODELS: ModelOption[] = [
  {
    id: "perplexity/sonar",
    label: "Perplexity Sonar",
    description: "Web-aware research answers.",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    description: "Long-context research model.",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Fallback search summarizer.",
  },
];

/**
 * Deduplicated list of all locally curated models (chat + code + search).
 * Used by the ModelSelector and other UI components instead of fetching from OpenRouter.
 */
export const ALL_MODELS: ModelOption[] = (() => {
  const seen = new Set<string>();
  return [...CHAT_MODELS, ...CODE_MODELS, ...SEARCH_MODELS].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }).map((m) => ({ id: m.id, label: m.label, description: m.description }));
})();

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "auto", label: "Auto detect" },
  { code: "ar", label: "Arabic" },
  { code: "bn", label: "Bengali" },
  { code: "bg", label: "Bulgarian" },
  { code: "ca", label: "Catalan" },
  { code: "zh", label: "Chinese" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "ms", label: "Malay" },
  { code: "no", label: "Norwegian" },
  { code: "fa", label: "Persian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sr", label: "Serbian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "vi", label: "Vietnamese" },
];

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;
export const DEFAULT_CODE_MODEL = "openai/gpt-5.4";
export const DEFAULT_SEARCH_MODEL = SEARCH_MODELS[0].id;

export const RECOMMENDED_CODING_MODELS: ModelPreset[] = [
  { id: "coding-gpt-oss-120b-free", label: "GPT OSS 120B (Free)", modelId: "openai/gpt-oss-120b:free", costTier: "free" },
  { id: "coding-minimax-m2.5-free", label: "MiniMax M2.5 (Free)", modelId: "minimax/minimax-m2.5:free", costTier: "free" },
  { id: "coding-nemotron-super-free", label: "Nemotron 3 Super (Free)", modelId: "nvidia/nemotron-3-super-120b-a12b:free", costTier: "free" },
  // Locked/paid models below
  { id: "coding-claude-opus", label: "Claude Opus 4.6", modelId: "anthropic/claude-opus-4.6", costTier: "premium" },
  { id: "coding-claude-opus-4.7", label: "Claude Opus 4.7", modelId: "anthropic/claude-opus-4.7", costTier: "premium" },
  { id: "coding-gpt-5.4", label: "GPT-5.4", modelId: "openai/gpt-5.4", costTier: "premium" },
  { id: "coding-gpt-5.5", label: "GPT-5.5", modelId: "openai/gpt-5.5", costTier: "premium" },
  { id: "coding-deepseek-r1", label: "DeepSeek R1", modelId: "deepseek/deepseek-r1", costTier: "standard" },
];

export const RECOMMENDED_CHAT_MODELS: ModelPreset[] = [
  { id: "chat-llama-3.3-free", label: "Llama 3.3 70B (Free)", modelId: "meta-llama/llama-3.3-70b-instruct:free", costTier: "free" },
  { id: "chat-gpt-oss-120b-free", label: "GPT OSS 120B (Free)", modelId: "openai/gpt-oss-120b:free", costTier: "free" },
  { id: "chat-minimax-m2.5-free", label: "MiniMax M2.5 (Free)", modelId: "minimax/minimax-m2.5:free", costTier: "free" },
  // Locked/paid models below
  { id: "chat-gpt-5.2", label: "GPT-5.2", modelId: "openai/gpt-5.2", costTier: "premium" },
  { id: "chat-gpt-5.3", label: "GPT-5.3", modelId: "openai/gpt-5.3", costTier: "premium" },
  { id: "chat-claude-sonnet", label: "Claude Sonnet 4.5", modelId: "anthropic/claude-sonnet-4.5", costTier: "standard" },
  { id: "chat-gemini-3", label: "Gemini 3 Flash", modelId: "google/gemini-3-flash-preview", costTier: "cheap" },
];

export const AUTO_PREFERRED_CODING_MODEL = "anthropic/claude-opus-4.6";
export const AUTO_PREFERRED_CHAT_MODEL = "openai/gpt-5.2";

export const FREE_CODING_MODEL = "openai/gpt-oss-120b:free";
export const FREE_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/**
 * Maps model IDs to cost tiers for the cost control system.
 * Models not listed here default to "standard".
 */
export const MODEL_COST_TIERS: Record<string, CostTier> = {
  // Free-tier models
  "meta-llama/llama-3.3-70b-instruct:free": "free",
  "openai/gpt-oss-120b:free": "free",
  "minimax/minimax-m2.5:free": "free",
  "z-ai/glm-4.5-air:free": "free",
  "nvidia/nemotron-3-super-120b-a12b:free": "free",
  // Cheap models — fast, low cost per token
  "google/gemini-2.5-flash-lite": "cheap",
  "google/gemini-3-flash-preview": "cheap",
  "openai/gpt-5-mini": "cheap",
  "openai/gpt-5-nano": "cheap",
  "x-ai/grok-3-mini": "cheap",
  "meta-llama/llama-3.3-70b-instruct": "cheap",
  // Standard models — good quality, moderate cost
  "deepseek/deepseek-r1": "standard",
  "deepseek/deepseek-v3.2": "standard",
  "anthropic/claude-sonnet-4.5": "standard",
  "openai/gpt-5": "standard",
  "qwen/qwen3-235b-a22b": "standard",
  "perplexity/sonar": "standard",
  "moonshotai/kimi-k2-thinking": "standard",
  "minimax/minimax-m2.5": "standard",
  // Premium models — frontier, high cost per token
  "openai/gpt-5.3": "premium",
  "anthropic/claude-opus-4.5": "premium",
  "anthropic/claude-opus-4.6": "premium",
  "anthropic/claude-opus-4.7": "premium",
  "openai/gpt-5.4": "premium",
  "openai/gpt-5.5": "premium",
  "openai/gpt-5.2": "premium",
  "openai/gpt-5.2-pro": "premium",
  "x-ai/grok-4": "premium",
  "google/gemini-3-pro-preview": "premium",
};

/** Returns the cost tier for a model ID. Unknown models default to "standard". */
export function getModelCostTier(modelId: string): CostTier {
  return MODEL_COST_TIERS[modelId] ?? "standard";
}

/** Maximum cost tier allowed for each cost mode. */
const COST_MODE_CAPS: Record<CostMode, CostTier> = {
  thrifty: "cheap",
  balanced: "standard",
  performance: "premium",
};

const TIER_ORDER: Record<CostTier, number> = {
  free: 0,
  cheap: 1,
  standard: 2,
  premium: 3,
};

/** Checks whether a model is within the allowed cost tier for the given cost mode. */
export function isModelAllowedByCostMode(modelId: string, costMode: CostMode): boolean {
  const tier = getModelCostTier(modelId);
  const cap = COST_MODE_CAPS[costMode];
  return TIER_ORDER[tier] <= TIER_ORDER[cap];
}

/** Filters a list of model IDs to only those allowed by the cost mode. Returns at least the original list if nothing passes. */
export function filterModelsByCostMode(modelIds: string[], costMode: CostMode): string[] {
  const filtered = modelIds.filter((id) => isModelAllowedByCostMode(id, costMode));
  return filtered.length > 0 ? filtered : modelIds;
}

/** Returns a cheaper alternative for a model when cost mode restricts it. Falls back to the cheapest available model or the original. */
export function getCheaperAlternative(modelId: string, costMode: CostMode, isCodeRequest: boolean): { modelId: string; downgraded: boolean } {
  if (isModelAllowedByCostMode(modelId, costMode)) {
    return { modelId, downgraded: false };
  }

  // Pick the best model within budget for the request type
  const candidates = isCodeRequest
    ? ["deepseek/deepseek-r1", "deepseek/deepseek-v3.2"]
    : ["google/gemini-3-flash-preview", "openai/gpt-5-mini", "meta-llama/llama-3.3-70b-instruct:free"];

  for (const candidate of candidates) {
    if (isModelAllowedByCostMode(candidate, costMode)) {
      return { modelId: candidate, downgraded: true };
    }
  }

  // Final fallback: free model
  return {
    modelId: isCodeRequest ? FREE_CODING_MODEL : FREE_CHAT_MODEL,
    downgraded: true,
  };
}

/** Human-readable labels for cost tiers */
export const COST_TIER_LABELS: Record<CostTier, string> = {
  free: "Free",
  cheap: "$",
  standard: "$$",
  premium: "$$$",
};

/**
 * Models available to free-plan users (only the :free variants on OpenRouter).
 */
export const FREE_PLAN_MODELS: string[] = Object.entries(MODEL_COST_TIERS)
  .filter(([, tier]) => tier === "free")
  .map(([id]) => id);

/** Returns true if the given model requires a paid plan (not free). */
export function isModelPremiumOnly(modelId: string): boolean {
  return !FREE_PLAN_MODELS.includes(modelId);
}

/** Returns true if the given model requires Pro+ (not available on free or Pro). */
export function isModelProPlusOnly(modelId: string): boolean {
  return PRO_PLUS_ONLY_MODELS.includes(modelId);
}

/**
 * Filters a list of model IDs to only those accessible to the user's plan.
 * Pro+ users get all models; Pro users get all except Pro+-only; free users only get :free models.
 * Falls back to the best paid models for the plan when no suitable model remains.
 */
export function filterModelsByPlan(modelIds: string[], userPlan: UserPlan): string[] {
  if (userPlan === "pro+") {
    // Pro+ can use every model; fall back to best Pro+ models if the list is empty.
    return modelIds.length > 0 ? modelIds : TOP_PRO_PLUS_FALLBACK_MODELS;
  }
  if (userPlan === "pro") {
    const filtered = modelIds.filter((id) => !isModelProPlusOnly(id));
    // Fall back to best Pro-accessible premium models rather than free-tier models.
    return filtered.length > 0 ? filtered : TOP_PRO_FALLBACK_MODELS;
  }
  const filtered = modelIds.filter((id) => !isModelPremiumOnly(id));
  return filtered.length > 0 ? filtered : [FREE_CHAT_MODEL];
}

/**
 * Returns the appropriate fallback model for a free-plan user.
 */
// Top free models for chat and coding
export const TOP_FREE_CHAT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-120b:free",
  "minimax/minimax-m2.5:free",
];
export const TOP_FREE_CODE_MODELS = [
  "openai/gpt-oss-120b:free",
  "minimax/minimax-m2.5:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

/**
 * Best premium models accessible to Pro-plan users (no Pro+-exclusive models).
 * Used as a fallback when the filtered model list is empty for a Pro user.
 */
export const TOP_PRO_FALLBACK_MODELS: string[] = [
  "openai/gpt-5.4",           // best frontier coding + chat model on Pro
  "anthropic/claude-opus-4.6", // best Claude model accessible to Pro
];

/**
 * Best premium models accessible to Pro+-plan users (includes Pro+-exclusive models).
 * Used as a fallback when the model list is empty for a Pro+ user.
 */
export const TOP_PRO_PLUS_FALLBACK_MODELS: string[] = [
  "anthropic/claude-opus-4.7", // Pro+-exclusive flagship model
  "openai/gpt-5.4",            // best frontier model available on Pro+
];

/**
 * Model IDs that support configurable reasoning depth / thinking effort.
 * Used by the composer UI to show the "Thinking Effort" selector and by the
 * chat route to decide whether to send the `reasoning_level` parameter.
 */
export const REASONING_MODEL_IDS: string[] = [
  "openai/gpt-5.4",
  "openai/gpt-5.2",
  "openai/gpt-5.2-pro",
  "openai/gpt-5.3",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-120b:free",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
  "google/gemini-2.5-flash-lite",
  "deepseek/deepseek-r1",
  "deepseek/deepseek-v3.2",
  "moonshotai/kimi-k2-thinking",
  "minimax/minimax-m2.5:free",
  "perplexity/sonar",
];

/**
 * Per-model max_tokens overrides.
 * Models not listed fall back to the DEFAULT_MAX_TOKENS value.
 */
export const DEFAULT_MAX_TOKENS = 4096;

export const MODEL_MAX_TOKENS: Record<string, number> = {
  // Frontier models support very long outputs
  "anthropic/claude-opus-4.7": 8192,
  "anthropic/claude-opus-4.6": 8192,
  "anthropic/claude-opus-4.5": 8192,
  "anthropic/claude-sonnet-4.5": 8192,
  "openai/gpt-5.4": 8192,
  "openai/gpt-5.5": 8192,
  "openai/gpt-5.2": 8192,
  "openai/gpt-5.2-pro": 8192,
  "openai/gpt-5.3": 8192,
  "openai/gpt-5": 8192,
  "google/gemini-3-pro-preview": 8192,
  "google/gemini-3-flash-preview": 8192,
  // Standard models
  "deepseek/deepseek-r1": 8192,
  "deepseek/deepseek-v3.2": 8192,
  "moonshotai/kimi-k2-thinking": 8192,
};

/** Returns the max_tokens value for a given model ID. */
export function getModelMaxTokens(modelId: string): number {
  return MODEL_MAX_TOKENS[modelId] ?? DEFAULT_MAX_TOKENS;
}

/**
 * Returns a random model from the list if available, otherwise falls back to the best single model.
 */
export function getFreePlanFallback(isCodeRequest: boolean): string {
  const candidates = isCodeRequest ? TOP_FREE_CODE_MODELS : TOP_FREE_CHAT_MODELS;
  // Filter to only those present in FREE_PLAN_MODELS (in case some are not available)
  const available = candidates.filter((id) => FREE_PLAN_MODELS.includes(id));
  if (available.length > 0) {
    // Pick one at random
    return available[Math.floor(Math.random() * available.length)];
  }
  // Fallback to the original best single model
  return isCodeRequest ? FREE_CODING_MODEL : FREE_CHAT_MODEL;
}
