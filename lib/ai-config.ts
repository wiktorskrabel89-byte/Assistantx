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

export type ModelBehaviorProfile = {
  defaultTemperature: number;
  codeTemperature?: number;
  longContextTemperature?: number;
  visionTemperature?: number;
  promptText: string;
  codePromptText?: string;
};

export type LanguageOption = {
  code: string;
  label: string;
};

export const CHAT_MODELS: ModelOption[] = [
  // Free-plan models — only those in the routing plan
  {
    id: "qwen/qwen3-32b:free",
    label: "Qwen3 32B (Free)",
    description: "Main conversational AI — natural chat, fast replies.",
  },
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B (Free)",
    description: "Free GPT OSS 120B — coding, reasoning, and heavy tasks.",
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT OSS 120B",
    description: "GPT OSS 120B — coding, reasoning, and heavy tasks.",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Fallback AI — balanced chat, long context, and vision.",
  },
  {
    id: "meta-llama/llama-4-scout",
    label: "Llama 4 Scout",
    description: "Vision analysis — screenshots, OCR, and UI analysis.",
  },
  // Premium models (Pro / Pro+ plans)
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
];

export const CODE_MODELS: ModelOption[] = [
  // Free-plan models — only those in the routing plan
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B (Free)",
    description: "Free GPT OSS 120B — coding and reasoning.",
  },
  // openai/gpt-oss-120b (non-free) is already in CHAT_MODELS; it is deduplicated in ALL_MODELS.
  // Premium models (Pro / Pro+ plans)
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
export const DEFAULT_CODE_MODEL = "openai/gpt-oss-120b:free";
export const DEFAULT_SEARCH_MODEL = SEARCH_MODELS[0].id;

// ─── Smart-routing model IDs ──────────────────────────────────────────────────
/** Main conversational AI (Groq – Qwen3 32B). Temperature: 0.8 */
export const ROUTING_MAIN_MODEL = "qwen/qwen3-32b";
/** Coding assistant – senior software engineer profile. Temperature: 0.15 */
export const ROUTING_CODE_MODEL = "openai/gpt-oss-120b";
/** Heavy reasoning / planning / agent design. Temperature: 0.3 */
export const ROUTING_REASONING_MODEL = "openai/gpt-oss-120b";
/** Vision analysis – screenshots, OCR, UI analysis. Temperature: 0.3 */
export const ROUTING_VISION_MODEL = "meta-llama/llama-4-scout";
/** Fallback / long-context – Gemini 2.5 Flash. Temperature: 0.7 (fallback) / 0.4 (long-ctx) */
export const ROUTING_GEMINI_MODEL = "google/gemini-2.5-flash";

// Free-tier variants for cost-constrained routing
export const ROUTING_MAIN_MODEL_FREE = "qwen/qwen3-32b:free";
export const ROUTING_CODE_MODEL_FREE = "openai/gpt-oss-120b:free";

export const RECOMMENDED_CODING_MODELS: ModelPreset[] = [
  { id: "coding-gpt-oss-120b-profile", label: "GPT OSS 120B (Code Profile)", modelId: "openai/gpt-oss-120b", costTier: "standard" },
  { id: "coding-gpt-oss-120b-free", label: "GPT OSS 120B (Free)", modelId: "openai/gpt-oss-120b:free", costTier: "free" },
  // Locked/paid models below
  { id: "coding-claude-opus", label: "Claude Opus 4.6", modelId: "anthropic/claude-opus-4.6", costTier: "premium" },
  { id: "coding-claude-opus-4.7", label: "Claude Opus 4.7", modelId: "anthropic/claude-opus-4.7", costTier: "premium" },
  { id: "coding-gpt-5.4", label: "GPT-5.4", modelId: "openai/gpt-5.4", costTier: "premium" },
  { id: "coding-gpt-5.5", label: "GPT-5.5", modelId: "openai/gpt-5.5", costTier: "premium" },
  { id: "coding-deepseek-r1", label: "DeepSeek R1", modelId: "deepseek/deepseek-r1", costTier: "standard" },
];

export const RECOMMENDED_CHAT_MODELS: ModelPreset[] = [
  { id: "chat-gpt-oss-120b-profile", label: "GPT OSS 120B (Chat Profile)", modelId: "openai/gpt-oss-120b", costTier: "standard" },
  { id: "chat-qwen3-32b-free", label: "Qwen3 32B (Free)", modelId: "qwen/qwen3-32b:free", costTier: "free" },
  { id: "chat-gpt-oss-120b-free", label: "GPT OSS 120B (Free)", modelId: "openai/gpt-oss-120b:free", costTier: "free" },
  { id: "chat-gemini-2.5-flash", label: "Gemini 2.5 Flash", modelId: "google/gemini-2.5-flash", costTier: "cheap" },
  // Locked/paid models below
  { id: "chat-gpt-5.2", label: "GPT-5.2", modelId: "openai/gpt-5.2", costTier: "premium" },
  { id: "chat-gpt-5.3", label: "GPT-5.3", modelId: "openai/gpt-5.3", costTier: "premium" },
  { id: "chat-claude-sonnet", label: "Claude Sonnet 4.5", modelId: "anthropic/claude-sonnet-4.5", costTier: "standard" },
];

export const AUTO_PREFERRED_CODING_MODEL = "openai/gpt-oss-120b";
export const AUTO_PREFERRED_CHAT_MODEL = "qwen/qwen3-32b";

export const FREE_CODING_MODEL = "openai/gpt-oss-120b:free";
export const FREE_CHAT_MODEL = "qwen/qwen3-32b:free";
export const APP_FORCED_MODEL_ID = "openai/gpt-oss-120b:free";
/** 1=low, 2=medium, 3=high, 4=xhigh */
export const APP_FORCED_THINKING_EFFORT = 4;

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
  "qwen/qwen3-32b:free": "free",
  // Cheap models — fast, low cost per token
  "google/gemini-2.5-flash-lite": "cheap",
  "google/gemini-3-flash-preview": "cheap",
  "google/gemini-2.5-flash": "cheap",
  "openai/gpt-5-mini": "cheap",
  "openai/gpt-5-nano": "cheap",
  "x-ai/grok-3-mini": "cheap",
  "meta-llama/llama-3.3-70b-instruct": "cheap",
  // Standard models — good quality, moderate cost
  "deepseek/deepseek-r1": "standard",
  "openai/gpt-oss-120b": "standard",
  "deepseek/deepseek-v3.2": "standard",
  "anthropic/claude-sonnet-4.5": "standard",
  "openai/gpt-5": "standard",
  "qwen/qwen3-32b": "standard",
  "qwen/qwen3-235b-a22b": "standard",
  "perplexity/sonar": "standard",
  "moonshotai/kimi-k2-thinking": "standard",
  "minimax/minimax-m2.5": "standard",
  "meta-llama/llama-4-scout": "standard",
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

/**
 * Per-model behavior defaults used by the chat route.
 * Every configured model gets explicit temperature and prompt guidance.
 */
export const MODEL_BEHAVIOR_PROFILES: Record<string, ModelBehaviorProfile> = {
  "meta-llama/llama-3.3-70b-instruct:free": {
    defaultTemperature: 0.7,
    codeTemperature: 0.2,
    promptText: "Provide practical, concise answers with clear structure.",
    codePromptText: "Generate correct, minimal, production-ready code and explain briefly.",
  },
  "openai/gpt-oss-120b:free": {
    defaultTemperature: 0.3,
    codeTemperature: 0.15,
    promptText: "You are an analytical reasoning model.\n\nFocus on:\n- logic\n- planning\n- accuracy\n- structured thinking\n- step-by-step reasoning",
    codePromptText: "You are a senior software engineer.\n\nRules:\n- prioritize correctness\n- preserve architecture\n- minimal diffs\n- production-ready code\n- avoid hallucinations\n- complete implementations\n- explain briefly",
  },
  "minimax/minimax-m2.5:free": {
    defaultTemperature: 0.7,
    codeTemperature: 0.2,
    promptText: "Focus on clear and useful responses.",
    codePromptText: "Return maintainable code with pragmatic implementation details.",
  },
  "z-ai/glm-4.5-air:free": {
    defaultTemperature: 0.7,
    codeTemperature: 0.2,
    promptText: "Keep responses concise, factual, and actionable.",
    codePromptText: "Deliver clean code and call out key assumptions.",
  },
  "nvidia/nemotron-3-super-120b-a12b:free": {
    defaultTemperature: 0.65,
    codeTemperature: 0.2,
    promptText: "Answer directly and keep structure easy to scan.",
    codePromptText: "Focus on robust code and practical debugging guidance.",
  },
  "qwen/qwen3-32b:free": {
    defaultTemperature: 0.8,
    codeTemperature: 0.15,
    promptText: "You are a helpful AI assistant.\n\nRules:\n- natural conversation\n- concise responses\n- fast replies\n- good formatting\n- helpful explanations",
    codePromptText: "You are a senior software engineer.\n\nRules:\n- prioritize correctness\n- preserve architecture\n- minimal diffs\n- production-ready code\n- avoid hallucinations\n- complete implementations\n- explain briefly",
  },
  "google/gemini-2.5-flash-lite": {
    defaultTemperature: 0.6,
    codeTemperature: 0.2,
    longContextTemperature: 0.4,
    promptText: "Summarize and explain efficiently with clear takeaways.",
    codePromptText: "Produce compact, correct code and quick implementation notes.",
  },
  "google/gemini-3-flash-preview": {
    defaultTemperature: 0.6,
    codeTemperature: 0.2,
    longContextTemperature: 0.4,
    promptText: "Respond quickly with clear and practical guidance.",
    codePromptText: "Optimize for correct, concise coding assistance.",
  },
  "google/gemini-2.5-flash": {
    defaultTemperature: 0.7,
    longContextTemperature: 0.4,
    visionTemperature: 0.3,
    promptText: "You are a balanced assistant.\n\nRules:\n- natural conversation\n- concise responses\n- accurate answers\n- practical structure",
    codePromptText: "Analyze long documents and large context efficiently.\n\nFocus on:\n- summarization\n- context retention\n- accurate extraction",
  },
  "openai/gpt-5-mini": {
    defaultTemperature: 0.6,
    codeTemperature: 0.2,
    promptText: "Provide concise, high-signal responses.",
    codePromptText: "Return correct code and concise technical guidance.",
  },
  "openai/gpt-5-nano": {
    defaultTemperature: 0.6,
    codeTemperature: 0.2,
    promptText: "Prefer brief, direct, utility-focused answers.",
    codePromptText: "Keep code short, correct, and easy to apply.",
  },
  "x-ai/grok-3-mini": {
    defaultTemperature: 0.65,
    codeTemperature: 0.2,
    promptText: "Use practical and straightforward language.",
    codePromptText: "Prioritize functional code and explicit assumptions.",
  },
  "meta-llama/llama-3.3-70b-instruct": {
    defaultTemperature: 0.7,
    codeTemperature: 0.2,
    promptText: "Provide concise, grounded, and clear responses.",
    codePromptText: "Generate maintainable code with minimal unnecessary complexity.",
  },
  "deepseek/deepseek-r1": {
    defaultTemperature: 0.3,
    codeTemperature: 0.2,
    promptText: "Use structured, logical reasoning and high factual accuracy.",
    codePromptText: "Prioritize rigorous reasoning, correctness, and clear code decisions.",
  },
  "openai/gpt-oss-120b": {
    defaultTemperature: 0.3,
    codeTemperature: 0.15,
    promptText: "You are an analytical reasoning model.\n\nFocus on:\n- logic\n- planning\n- accuracy\n- structured thinking\n- step-by-step reasoning",
    codePromptText: "You are a senior software engineer.\n\nRules:\n- prioritize correctness\n- preserve architecture\n- minimal diffs\n- production-ready code\n- avoid hallucinations\n- complete implementations\n- explain briefly",
  },
  "deepseek/deepseek-v3.2": {
    defaultTemperature: 0.55,
    codeTemperature: 0.2,
    promptText: "Respond clearly with practical and well-structured outputs.",
    codePromptText: "Provide reliable implementation details and test-aware code suggestions.",
  },
  "anthropic/claude-sonnet-4.5": {
    defaultTemperature: 0.55,
    codeTemperature: 0.2,
    promptText: "Write with strong clarity, reasoning, and polished structure.",
    codePromptText: "Focus on robust implementation quality and concise explanations.",
  },
  "openai/gpt-5": {
    defaultTemperature: 0.5,
    codeTemperature: 0.2,
    promptText: "Provide high-quality, precise, and practical answers.",
    codePromptText: "Optimize for correctness, architecture fit, and production quality.",
  },
  "qwen/qwen3-32b": {
    defaultTemperature: 0.8,
    codeTemperature: 0.15,
    promptText: "You are a helpful AI assistant.\n\nRules:\n- natural conversation\n- concise responses\n- fast replies\n- good formatting\n- helpful explanations",
    codePromptText: "You are a senior software engineer.\n\nRules:\n- prioritize correctness\n- preserve architecture\n- minimal diffs\n- production-ready code\n- avoid hallucinations\n- complete implementations\n- explain briefly",
  },
  "qwen/qwen3-235b-a22b": {
    defaultTemperature: 0.7,
    codeTemperature: 0.2,
    promptText: "Provide balanced depth with concise actionable outcomes.",
    codePromptText: "Return complete, accurate code and clear implementation notes.",
  },
  "perplexity/sonar": {
    defaultTemperature: 0.4,
    promptText: "Prioritize current, source-aware, factual research responses.",
  },
  "moonshotai/kimi-k2-thinking": {
    defaultTemperature: 0.35,
    codeTemperature: 0.2,
    longContextTemperature: 0.3,
    promptText: "Handle long-context reasoning with structured, accurate synthesis.",
    codePromptText: "Use deliberate reasoning for complex engineering tasks.",
  },
  "minimax/minimax-m2.5": {
    defaultTemperature: 0.65,
    codeTemperature: 0.2,
    promptText: "Keep responses practical and easy to execute.",
    codePromptText: "Prioritize usable code with concise implementation guidance.",
  },
  "meta-llama/llama-4-scout": {
    defaultTemperature: 0.3,
    visionTemperature: 0.3,
    promptText: "Analyze images accurately.\n\nFocus on:\n- screenshots\n- OCR\n- UI analysis\n- visual understanding",
    codePromptText: "Use careful analysis before proposing code changes.",
  },
  "openai/gpt-5.3": {
    defaultTemperature: 0.45,
    codeTemperature: 0.2,
    promptText: "Deliver premium-quality reasoning with concise, reliable outputs.",
    codePromptText: "Provide production-ready, accurate code and brief rationale.",
  },
  "anthropic/claude-opus-4.5": {
    defaultTemperature: 0.45,
    codeTemperature: 0.2,
    promptText: "Provide deep, careful analysis with clear communication.",
    codePromptText: "Emphasize robust design, correctness, and maintainable code.",
  },
  "anthropic/claude-opus-4.6": {
    defaultTemperature: 0.45,
    codeTemperature: 0.2,
    promptText: "Provide premium analysis with high clarity and precision.",
    codePromptText: "Optimize for correctness, architecture preservation, and minimal-diff implementation.",
  },
  "anthropic/claude-opus-4.7": {
    defaultTemperature: 0.45,
    codeTemperature: 0.2,
    promptText: "Deliver flagship-quality reasoning and polished responses.",
    codePromptText: "Produce production-ready solutions with strong correctness guarantees.",
  },
  "openai/gpt-5.4": {
    defaultTemperature: 0.4,
    codeTemperature: 0.2,
    promptText: "Provide high-precision frontier quality with concise structure.",
    codePromptText: "Focus on complete, correct, and production-grade code outputs.",
  },
  "openai/gpt-5.5": {
    defaultTemperature: 0.4,
    codeTemperature: 0.2,
    promptText: "Provide state-of-the-art quality with clear and direct communication.",
    codePromptText: "Deliver rigorous, high-confidence coding guidance and implementation.",
  },
  "openai/gpt-5.2": {
    defaultTemperature: 0.45,
    codeTemperature: 0.2,
    promptText: "Give clear, reliable premium responses with practical focus.",
    codePromptText: "Provide accurate implementation details and concise engineering tradeoffs.",
  },
  "openai/gpt-5.2-pro": {
    defaultTemperature: 0.4,
    codeTemperature: 0.2,
    promptText: "Prioritize precision and high-confidence technical outputs.",
    codePromptText: "Produce robust code and explicit reasoning about edge cases.",
  },
  "x-ai/grok-4": {
    defaultTemperature: 0.5,
    codeTemperature: 0.2,
    promptText: "Provide high-capability, practical, and direct responses.",
    codePromptText: "Focus on effective implementation and correctness.",
  },
  "google/gemini-3-pro-preview": {
    defaultTemperature: 0.45,
    codeTemperature: 0.2,
    longContextTemperature: 0.35,
    promptText: "Deliver detailed but concise premium reasoning.",
    codePromptText: "Provide production-aware coding guidance with strong clarity.",
  },
};

/** Returns the model temperature with explicit per-model defaults and mode overrides. */
export function getModelTemperature(
  modelId: string,
  {
    isCodeRequest = false,
    isLongContext = false,
    isVisionRequest = false,
  }: { isCodeRequest?: boolean; isLongContext?: boolean; isVisionRequest?: boolean } = {},
): number {
  const profile = MODEL_BEHAVIOR_PROFILES[modelId];
  if (!profile) return isCodeRequest ? 0.2 : 0.7;
  if (isVisionRequest && typeof profile.visionTemperature === "number") return profile.visionTemperature;
  if (isLongContext && typeof profile.longContextTemperature === "number") return profile.longContextTemperature;
  if (isCodeRequest && typeof profile.codeTemperature === "number") return profile.codeTemperature;
  return profile.defaultTemperature;
}

/** Returns model-specific prompt guidance for chat or coding mode. */
export function getModelPromptText(modelId: string, isCodeRequest = false): string {
  const profile = MODEL_BEHAVIOR_PROFILES[modelId];
  if (!profile) return "";
  if (isCodeRequest && typeof profile.codePromptText === "string") return profile.codePromptText;
  return profile.promptText;
}

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
    ? ["openai/gpt-oss-120b:free"]
    : ["google/gemini-2.5-flash", "qwen/qwen3-32b:free"];

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
  "qwen/qwen3-32b:free",
  "openai/gpt-oss-120b:free",
];
export const TOP_FREE_CODE_MODELS = [
  "openai/gpt-oss-120b:free",
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
  "qwen/qwen3-32b",
  "qwen/qwen3-32b:free",
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
 * GPT OSS 120B has separate chat/code ceilings; all other models use DEFAULT_MAX_TOKENS.
 */
export const DEFAULT_MAX_TOKENS = 4096;

export const MODEL_MAX_TOKENS_CHAT: Record<string, number> = {
  "openai/gpt-oss-120b": 1024,
  "openai/gpt-oss-120b:free": 1024,
};

export const MODEL_MAX_TOKENS_CODE: Record<string, number> = {
  "openai/gpt-oss-120b": 8000,
  "openai/gpt-oss-120b:free": 8000,
};

/** Returns the max_tokens value for a given model ID. */
export function getModelMaxTokens(modelId: string, isCodeRequest = false): number {
  if (isCodeRequest) {
    return MODEL_MAX_TOKENS_CODE[modelId] ?? DEFAULT_MAX_TOKENS;
  }
  return MODEL_MAX_TOKENS_CHAT[modelId] ?? DEFAULT_MAX_TOKENS;
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
