export type CostTier = "free" | "cheap" | "standard" | "premium";
export type CostMode = "thrifty" | "balanced" | "performance";
export type UserPlan = "free" | "premium";

export type PremiumPlanInfo = {
  priceUsd: number;
  pricePln: number;
  unlimitedChats: boolean;
  premiumRequestsPerMonth: number;
  description: string;
};

export const PREMIUM_PLAN: PremiumPlanInfo = {
  priceUsd: 10,
  pricePln: 30,
  unlimitedChats: true,
  premiumRequestsPerMonth: 300,
  description: "Unlimited chats, 300 premium requests/month, access to all models.",
};

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
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    description: "Balanced everyday chat model.",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    description: "Fast general-purpose chat.",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    description: "Strong reasoning and writing.",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Fast compact OpenAI model.",
  },
  {
    id: "x-ai/grok-3-mini",
    label: "Grok 3 Mini",
    description: "Quick conversational answers.",
  },
];

export const CODE_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    description: "Latest frontier coding model.",
  },
  {
    id: "deepseek/deepseek-v3.2",
    label: "DeepSeek V3.2",
    description: "Fast coding model.",
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    description: "Reasoning-heavy coding model.",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    description: "High-quality code generation.",
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    description: "Premium code and analysis model.",
  },
  {
    id: "qwen/qwen3-235b-a22b",
    label: "Qwen 3 235B",
    description: "Large open model for code tasks.",
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
  // Removed DeepSeek R1 (Free) as it is unavailable
  { id: "coding-qwen3-235b-free", label: "Qwen 3 235B (Free)", modelId: "qwen/qwen3-235b-a22b:free", costTier: "free" },
  { id: "coding-mistral-small-3.1-free", label: "Mistral Small 3.1 (Free)", modelId: "mistralai/mistral-small-3.1-24b-instruct:free", costTier: "free" },
  { id: "coding-llama-4-scout-free", label: "Llama 4 Scout (Free)", modelId: "meta-llama/llama-4-scout:free", costTier: "free" },
  { id: "coding-claude-opus", label: "Claude Opus 4.6", modelId: "anthropic/claude-opus-4.6", costTier: "premium" },
  { id: "coding-gpt-5.4", label: "GPT-5.4", modelId: "openai/gpt-5.4", costTier: "premium" },
  { id: "coding-deepseek-r1", label: "DeepSeek R1", modelId: "deepseek/deepseek-r1", costTier: "standard" },
];

export const RECOMMENDED_CHAT_MODELS: ModelPreset[] = [
  { id: "chat-llama-3.3-free", label: "Llama 3.3 70B (Free)", modelId: "meta-llama/llama-3.3-70b-instruct:free", costTier: "free" },
  { id: "chat-gemini-2-flash-free", label: "Gemini 2.0 Flash (Free)", modelId: "google/gemini-2.0-flash-exp:free", costTier: "free" },
  { id: "chat-gpt-5.1", label: "GPT-5.1", modelId: "openai/gpt-5.1", costTier: "standard" },
  { id: "chat-claude-sonnet", label: "Claude Sonnet 4.5", modelId: "anthropic/claude-sonnet-4.5", costTier: "standard" },
  { id: "chat-gemini-3", label: "Gemini 3 Flash", modelId: "google/gemini-3-flash-preview", costTier: "cheap" },
];

export const AUTO_PREFERRED_CODING_MODEL = "anthropic/claude-opus-4.6";
export const AUTO_PREFERRED_CHAT_MODEL = "openai/gpt-5.1";

export const FREE_CODING_MODEL = "openrouter/elephant-alpha";
export const FREE_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/**
 * Maps model IDs to cost tiers for the cost control system.
 * Models not listed here default to "standard".
 */
export const MODEL_COST_TIERS: Record<string, CostTier> = {
  // Free-tier models
  // "deepseek/deepseek-r1:free": "free", // removed unavailable model
  "meta-llama/llama-3.3-70b-instruct:free": "free",
  "meta-llama/llama-4-scout:free": "free",
  "google/gemini-2.0-flash-exp:free": "free",
  "mistralai/mistral-small-3.1-24b-instruct:free": "free",
  "qwen/qwen3-235b-a22b:free": "free",
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
  "openai/gpt-5.1": "standard",
  "qwen/qwen3-235b-a22b": "standard",
  "perplexity/sonar": "standard",
  "moonshotai/kimi-k2-thinking": "standard",
  "minimax/minimax-m2.5": "standard",
  // Premium models — frontier, high cost per token
  "anthropic/claude-opus-4.5": "premium",
  "anthropic/claude-opus-4.6": "premium",
  "openai/gpt-5.4": "premium",
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
    : ["google/gemini-3-flash-preview", "openai/gpt-5-mini", "meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.3-70b-instruct:free"];

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

/** Returns true if the given model requires a premium plan. */
export function isModelPremiumOnly(modelId: string): boolean {
  return !FREE_PLAN_MODELS.includes(modelId);
}

/**
 * Filters a list of model IDs to only those accessible to the user's plan.
 * Premium users get all models; free users only get :free models.
 */
export function filterModelsByPlan(modelIds: string[], userPlan: UserPlan): string[] {
  if (userPlan === "premium") return modelIds;
  const filtered = modelIds.filter((id) => !isModelPremiumOnly(id));
  return filtered.length > 0 ? filtered : [FREE_CHAT_MODEL];
}

/**
 * Returns the appropriate fallback model for a free-plan user.
 */
export function getFreePlanFallback(isCodeRequest: boolean): string {
  return isCodeRequest ? FREE_CODING_MODEL : FREE_CHAT_MODEL;
}
