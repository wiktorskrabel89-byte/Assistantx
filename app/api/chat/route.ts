
import { createClient } from "@/lib/server";
function getSupabase() {
  // This assumes createClient returns a promise, so you may need to adjust usage to await getSupabase()
  // If createClient is synchronous, remove await in usages.
  // For now, return createClient() directly for compatibility.
  return createClient();
}
import {
  CHAT_MODELS,
  CODE_MODELS,
  CostMode,
  UserPlan,
  filterModelsByPlan,
  isModelPremiumOnly,
  isModelProPlusOnly,
  getFreePlanFallback,
  filterModelsByCostMode,
  getCheaperAlternative,
  AUTO_PREFERRED_CODING_MODEL,
  AUTO_PREFERRED_CHAT_MODEL,
  REASONING_MODEL_IDS,
  getModelMaxTokens,
  getModelPromptText,
  getModelTemperature,
  ROUTING_MAIN_MODEL,
  ROUTING_CODE_MODEL,
  ROUTING_REASONING_MODEL,
  ROUTING_VISION_MODEL,
  ROUTING_GEMINI_MODEL,
  ROUTING_MAIN_MODEL_FREE,
  ROUTING_CODE_MODEL_FREE,
  MAIN_AI_SYSTEM_PROMPT,
  HEAVY_REASONING_SYSTEM_PROMPT,
  VISION_SYSTEM_PROMPT,
} from "@/lib/ai-config";
import { isCodeRequest, isImageRequest, isHeavyReasoningRequest, isVeryLongContext, isComplexCodingRequest } from "@/lib/detect";
import {
  createOpenRouterEmbedding,
  formatKnowledgeContext,
  extractUserProfileFacts,
  toPgVectorLiteral,
} from "@/app/lib/knowledge";
import {
  formatWebSearchContext,
  getCachedWebSearch,
  logUsageEvent,
  runTavilySearch,
  saveWebSearchCache,
  shouldUseLiveWebSearch,
  type WebSearchResponsePayload,
} from "@/app/lib/ai-platform";

async function getAuthUserId(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads the user's plan from their workspace_states record in Supabase.
 * Falls back to the client-supplied plan if the server lookup fails.
 */
async function getServerSideUserPlan(userId: string | null, clientPlan: UserPlan): Promise<UserPlan> {
  if (!userId) return clientPlan;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("workspace_states")
      .select("state_json")
      .eq("user_id", userId)
      .single();
    if (!data?.state_json) return clientPlan;
    const VALID_USER_PLANS: UserPlan[] = ["free", "pro", "pro+"];
    const rawPlan = (data.state_json as Record<string, unknown>).userPlan;
    if (typeof rawPlan === "string" && VALID_USER_PLANS.includes(rawPlan as UserPlan)) {
      return rawPlan as UserPlan;
    }
    return clientPlan;
  } catch {
    return clientPlan;
  }
}

async function getMemoryHistory(conversationId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc("get_memory_limited_messages", {
    p_conversation_id: conversationId,
    p_max_tokens: 4000,
    p_max_messages: 20,
  });
  return data ?? [];
}

async function getMemorySummaries(conversationId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("memory_summaries")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function saveMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const supabase = await getSupabase();
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    token_count: Math.ceil(content.length / 4),
  });
}

async function ensureConversation(conversationId: string, userId: string | null) {
  if (!userId) return; // do not create conversation records without an authenticated owner
  const supabase = await getSupabase();

  // Guard against a user injecting another user's conversationId.
  // Check whether the conversation already exists and belongs to someone else.
  const { data: existing } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (existing && existing.user_id && existing.user_id !== userId) {
    const err = new Error("Unauthorized: conversation belongs to another user") as Error & { status: number };
    err.status = 403;
    throw err;
  }

  await supabase.from("conversations").upsert(
    { id: conversationId, user_id: userId },
    { onConflict: "id" }
  );
}

async function findKnowledgeContext(userId: string, queryEmbedding: number[]) {
  try {
    const supabase = await getSupabase();
    const vector = toPgVectorLiteral(queryEmbedding);
    const [chunkResult, profileResult] = await Promise.all([
      supabase.rpc("match_documents", {
        p_user_id: userId,
        p_query_embedding: vector,
        match_count: KNOWLEDGE_MATCH_COUNT,
        max_total_tokens: KNOWLEDGE_MAX_TOTAL_TOKENS,
      }),
      supabase.rpc("match_user_profile_memories", {
        p_user_id: userId,
        p_query_embedding: vector,
        p_match_count: 4,
      }),
    ]);

    const chunks = Array.isArray(chunkResult.data) ? chunkResult.data as Array<{ file_name: string; content: string; similarity: number }> : [];
    const profileMemories = Array.isArray(profileResult.data) ? profileResult.data as Array<{ memory_key: string; memory_value: string }> : [];
    return formatKnowledgeContext(chunks, profileMemories);
  } catch {
    return "";
  }
}

async function findCachedAnswer(userId: string, queryEmbedding: number[]) {
  try {
    const supabase = await getSupabase();
    const vector = toPgVectorLiteral(queryEmbedding);
    const { data } = await supabase.rpc("match_cached_answers", {
      p_user_id: userId,
      p_query_embedding: vector,
      p_match_count: 1,
      p_min_similarity: CACHED_ANSWER_SIMILARITY_THRESHOLD,
    });
    const first = Array.isArray(data) ? data[0] as { answer?: string; similarity?: number; answer_id?: string } : null;
    if (!first?.answer || typeof first.similarity !== "number") return null;
    return { answer: first.answer, similarity: first.similarity, answerId: first.answer_id };
  } catch {
    return null;
  }
}

async function saveCachedAnswer(userId: string, question: string, answer: string, queryEmbedding: number[]) {
  try {
    const supabase = await getSupabase();
    await supabase.from("knowledge_qa_cache").insert({
      user_id: userId,
      question,
      answer,
      question_embedding: toPgVectorLiteral(queryEmbedding),
      similarity_hint: null,
      usage_count: 0,
    });
  } catch {
    // best effort
  }
}

async function incrementCachedAnswerUsage(answerId: string, userId: string) {
  try {
    const supabase = await getSupabase();
    // Atomic increment: a single UPDATE avoids the read-then-write race.
    await supabase.rpc("increment_qa_cache_usage", { answer_id: answerId, answer_user_id: userId });
  } catch {
    // best effort
  }
}

async function saveUserProfileFacts(userId: string, message: string, queryEmbedding: number[]) {
  const facts = extractUserProfileFacts(message);
  if (facts.length === 0) return;
  try {
    const supabase = await getSupabase();
    for (const fact of facts) {
      const existing = await supabase
        .from("user_profile_memories")
        .select("id")
        .eq("user_id", userId)
        .eq("memory_key", fact.key)
        .maybeSingle();

      if ((existing.data as { id?: string } | null)?.id) {
        await supabase
          .from("user_profile_memories")
          .update({
            memory_value: fact.value,
            source_message: message.slice(0, 1000),
            embedding: toPgVectorLiteral(queryEmbedding),
          })
          .eq("id", (existing.data as { id: string }).id)
          .eq("user_id", userId);
      } else {
        await supabase.from("user_profile_memories").insert({
          user_id: userId,
          memory_key: fact.key,
          memory_value: fact.value,
          source_message: message.slice(0, 1000),
          embedding: toPgVectorLiteral(queryEmbedding),
        });
      }
    }
  } catch {
    // best effort
  }
}


/**
 * Returns true when a 429 response is a provider-side upstream rate limit
 * (e.g. "meta-llama/llama-3.3-70b-instruct:free is temporarily rate-limited
 * upstream") rather than an OpenRouter credits / quota exhaustion.
 * These should be treated like 5xx errors: mark the model as down and retry
 * with the next model in the fallback chain.
 */
function isProviderRateLimit(status: number, body: string): boolean {
  if (status !== 429) return false;
  return (
    /rate.?limited upstream/i.test(body) ||
    /temporarily rate.?limited/i.test(body)
  );
}

function isCreditsError(status: number, body: string): boolean {
  // Upstream provider rate limits are not credits errors — handle them separately.
  if (isProviderRateLimit(status, body)) return false;
  return (
    status === 402
    || status === 429
    || /\binsufficient\b.*\bcredits\b/i.test(body)
    || /\bpayment\b.*\brequired\b/i.test(body)
    || /\brate\b.*\blimit\b.*\bexceeded\b/i.test(body)
    || /\bout of credits\b/i.test(body)
  );
}

function usingAutoRouter(allowedModels: unknown, modelId: unknown, inferredImageRequest: boolean): boolean {
  return !modelId && Array.isArray(allowedModels) && allowedModels.length > 0 && !inferredImageRequest;
}

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) return error.name === "AbortError" || /aborted/i.test(error.message);
  return false;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  pl: "Polish",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  tr: "Turkish",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
};


const LANG_PATTERNS: Array<{ lang: string; name: string; patterns: RegExp[] }> = [
  {
    lang: "pl", name: "Polish",
    patterns: [
      /\b(elo|siema|hej|cześć|dzień dobry|dobra|spoko|git|okej|okej|co tam|co słychać|dziękuję|proszę|przepraszam|tak|nie|ile|gdzie|kiedy|jak|co|dlaczego|który|która|które)\b/i,
      /[ąćęłńóśźż]/,
      /\b(jest|są|były|będzie|mam|masz|ma|mamy|macie|mają|idę|idziesz|idzie|chcę|chcesz|mogę|możesz|można|trzeba|wiem|widzę|rozumiem|powiedz|napisz|zrób|pomóż|sprawdź)\b/i,
    ],
  },
  {
    lang: "de", name: "German",
    patterns: [
      /\b(hallo|guten|tag|morgen|abend|bitte|danke|ja|nein|wie|was|wo|wann|warum|wer|ich|du|er|sie|wir|ihr|sie|ein|eine|der|die|das|und|oder|aber|mit|für|von)\b/i,
      /[äöüß]/,
    ],
  },
  {
    lang: "fr", name: "French",
    patterns: [
      /\b(bonjour|salut|merci|oui|non|comment|quoi|où|quand|pourquoi|qui|je|tu|il|elle|nous|vous|ils|elles|un|une|le|la|les|et|ou|mais|avec|pour|de|du|des)\b/i,
      /[àâæçéèêëîïôœùûüÿ]/,
    ],
  },
  {
    lang: "es", name: "Spanish",
    patterns: [
      /\b(hola|buenos|días|gracias|sí|no|cómo|qué|dónde|cuándo|por qué|quién|yo|tú|él|ella|nosotros|vosotros|ellos|un|una|el|la|los|las|y|o|pero|con|para|de)\b/i,
      /[áéíóúüñ¿¡]/,
    ],
  },
  {
    lang: "pt", name: "Portuguese",
    patterns: [
      /\b(olá|oi|obrigado|obrigada|sim|não|como|o que|onde|quando|por que|quem|eu|tu|ele|ela|nós|vocês|eles|um|uma|o|a|os|as|e|ou|mas|com|para|de|do|da)\b/i,
      /[ãõâêôàáéíóúç]/,
    ],
  },
  { lang: "ru", name: "Russian", patterns: [/[\u0400-\u04FF]/] },
  { lang: "zh", name: "Chinese", patterns: [/[\u4E00-\u9FFF\u3400-\u4DBF]/] },
  { lang: "ja", name: "Japanese", patterns: [/[\u3040-\u309F\u30A0-\u30FF]/] },
  { lang: "ko", name: "Korean", patterns: [/[\uAC00-\uD7AF\u1100-\u11FF]/] },
  { lang: "ar", name: "Arabic", patterns: [/[\u0600-\u06FF]/] },
  {
    lang: "tr", name: "Turkish",
    patterns: [
      /\b(merhaba|selam|teşekkür|evet|hayır|nasıl|ne|nerede|ne zaman|neden|kim|ben|sen|o|biz|siz|onlar|bir|ve|veya|ama|ile|için|bu|şu|o)\b/i,
      /[çğışöü]/,
    ],
  },
  {
    lang: "it", name: "Italian",
    patterns: [
      /\b(ciao|buongiorno|grazie|sì|no|come|cosa|dove|quando|perché|chi|io|tu|lui|lei|noi|voi|loro|un|una|il|la|i|le|e|o|ma|con|per|di|del|della)\b/i,
      /[àèéìíîòóùú]/,
    ],
  },
  {
    lang: "nl", name: "Dutch",
    patterns: [/\b(hallo|hoi|dank|ja|nee|hoe|wat|waar|wanneer|waarom|wie|ik|jij|hij|zij|wij|jullie|zij|een|de|het|en|of|maar|met|voor|van)\b/i],
  },
  {
    lang: "en", name: "English",
    patterns: [/\b(hello|hi|hey|thanks|thank you|yes|no|how|what|where|when|why|who|i|you|he|she|we|they|the|a|an|and|or|but|with|for|is|are|was|were|have|has|do|does|can|will|please|help)\b/i],
  },
];

export function detectLanguage(text: string): { lang: string; name: string } | null {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;

  const scores: Record<string, { name: string; score: number }> = {};
  for (const { lang, name, patterns } of LANG_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = trimmed.match(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g")));
      if (matches) score += matches.length;
    }
    if (score > 0) scores[lang] = { name, score };
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  if (ranked.length === 0) return null;

  const [topLang, topData] = ranked[0];
  const secondScore = ranked[1]?.[1].score ?? 0;
  if (topData.score <= secondScore && topLang !== "en") return { lang: "en", name: "English" };
  return { lang: topLang, name: topData.name };
}

const MODEL_LABELS: Record<string, string> = {
  "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super 120B (Free)",
  "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3 70B",
  "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
  "deepseek/deepseek-v3.2": "DeepSeek V3.2",
  "google/gemini-2.0-flash-exp:free": "Gemini 2.0 Flash",
  "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "google/gemini-3-flash-preview": "Gemini 3 Flash",
  "google/gemini-3-pro-preview": "Gemini 3 Pro",
  "mistralai/mistral-small-3.1-24b-instruct:free": "Mistral Small 3.1",
  "qwen/qwen3-235b-a22b:free": "Qwen 3 235B",
  "qwen/qwen3-235b-a22b": "Qwen 3 235B",
  "anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
  "anthropic/claude-opus-4.5": "Claude Opus 4.5",
  "anthropic/claude-opus-4.6": "Claude Opus 4.6",
  "anthropic/claude-opus-4.7": "Claude Opus 4.7",
  "anthropic/claude-haiku-4.5": "Claude Haiku 4.5",
  "openai/gpt-5.4": "GPT-5.4",
  "openai/gpt-5": "GPT-5",
  "openai/gpt-5-mini": "GPT-5 Mini",
  "openai/gpt-5-nano": "GPT-5 Nano",
  "openai/gpt-5.2": "GPT-5.2",
  "openai/gpt-5.2-pro": "GPT-5.2 Pro",
  "openai/gpt-5.3": "GPT-5.3",
  "openai/gpt-5.5": "GPT-5.5",
  "openai/gpt-oss-120b": "GPT OSS 120B",
  "openai/gpt-oss-120b:free": "GPT OSS 120B (Free)",
  "minimax/minimax-m2.5:free": "MiniMax M2.5 (Free)",
  "z-ai/glm-4.5-air:free": "GLM 4.5 Air (Free)",
  "x-ai/grok-4": "Grok 4",
  "x-ai/grok-3": "Grok 3",
  "x-ai/grok-3-mini": "Grok 3 Mini",
  "minimax/minimax-m2.5": "MiniMax M2.5",
  "moonshotai/kimi-k2-thinking": "Kimi K2 Thinking",
  "perplexity/sonar": "Perplexity Sonar",
  "qwen/qwen3-32b": "Qwen3 32B",
  "qwen/qwen3-32b:free": "Qwen3 32B (Free)",
  "meta-llama/llama-4-scout": "Llama 4 Scout",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
};

// ─── Moderation: blocked input patterns ──────────────────────────────────────
const BLOCKED_PATTERNS: RegExp[] = [
  /ignore previous instructions/i,
  /system prompt/i,
  /bypass restrictions/i,
  /jailbreak/i,
  /disregard (all|your|previous) (rules|instructions|guidelines)/i,
  /pretend (you are|to be) (an? )?(evil|unethical|unrestricted|uncensored)/i,
  /dan mode/i,
];

function isModerationBlocked(message: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(message));
}

const CACHED_ANSWER_SIMILARITY_THRESHOLD = 0.9;
// Knowledge retrieval keeps a lower threshold for context breadth while cache reuse
// intentionally requires a high threshold to avoid returning the wrong prior answer.
const KNOWLEDGE_MATCH_COUNT = 10;
const KNOWLEDGE_MAX_TOTAL_TOKENS = 1500;

import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

/** Returns the OpenRouter reasoning_level string for the given request type. */
function determineReasoningEffort(
  inferredComplexCoding: boolean,
  inferredHeavyReasoning: boolean,
  inferredCodeRequest: boolean,
): string {
  if (inferredComplexCoding || inferredHeavyReasoning) return "high";
  if (inferredCodeRequest) return "medium";
  return "low";
}

export const POST = async (req: Request) => {
  // Rate limit: 30 chat requests per minute per user/IP
  const rlKey = getRateLimitKey(req, "chat");
  const rl = checkRateLimit(rlKey, 30, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  // Use static local model constants — no network call needed
  const CODE_MODEL = AUTO_PREFERRED_CODING_MODEL;
  const CHAT_MODEL = AUTO_PREFERRED_CHAT_MODEL;

  const requestSignal = req.signal;
  const {
    message,
    mode: rawMode,
    modelId,
    allowedModels,
    assistantName,
    assistantPurpose,
    assistantInstructions,
    history,
    memoryNotes,
    conversationId,
    style = "concise",
    languageLock = "auto",
    preferredProgrammingLanguage,
    interactionProfile,
    addInternetContext = false,
    costMode: rawCostMode,
    userPlan: rawUserPlan,
    thinkingEffort, // New: reasoning depth (Low, Medium, High, Xhigh)
    modelProfile = "default",
    systemPrompt: customSystemPrompt,
    enabledTools,
    googleContext,
  } = await req.json();

  // ── Moderation: block prompt-injection and jailbreak attempts ────────────────
  if (typeof message === "string" && isModerationBlocked(message)) {
    return new Response(
      JSON.stringify({ error: "Message blocked by content policy." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Detect "websearch" trigger word at the very start of the message (any case).
  // Require a word boundary after "websearch" so "websearching ..." is not matched.
  // When present, strip it so the model receives a clean prompt.
  const websearchTrigger = /^websearch(?=\s|$)/i.test(typeof message === "string" ? message : "");
  const effectiveMessage: string = websearchTrigger && typeof message === "string"
    ? message.replace(/^websearch(?=\s|$)/i, "").trim()
    : (typeof message === "string" ? message : "");

  // Override addInternetContext if the workspace has web_search tool enabled
  const effectiveAddInternetContext: boolean = addInternetContext ||
    websearchTrigger ||
    (Array.isArray(enabledTools) && enabledTools.includes("web_search"));

  // Merge any Claude models from the local curated list that aren't already in allowedModels
  let allowedModelsFinal = allowedModels;
  if (Array.isArray(allowedModels)) {
    const allowedSet = new Set<string>(allowedModels);
    const localClaudeIds = [...new Set(
      [...CHAT_MODELS, ...CODE_MODELS]
        .map((m) => m.id)
        .filter((id) => id.startsWith("anthropic/claude-") && !allowedSet.has(id))
    )];
    allowedModelsFinal = localClaudeIds.length > 0 ? [...allowedModels, ...localClaudeIds] : allowedModels;
  }
  const encoder = new TextEncoder();
  const VALID_COST_MODES: CostMode[] = ["thrifty", "balanced", "performance"];
  const costMode: CostMode = VALID_COST_MODES.includes(rawCostMode) ? rawCostMode : "balanced";
  const VALID_USER_PLANS: UserPlan[] = ["free", "pro", "pro+"];
  const clientPlan: UserPlan = VALID_USER_PLANS.includes(rawUserPlan) ? rawUserPlan : "free";

  // Verify the user's plan server-side from Supabase instead of trusting the client
  const authUserId = await getAuthUserId(req);
  const userPlan = await getServerSideUserPlan(authUserId, clientPlan);

  const inferredCodeRequest = rawMode === "code" || isCodeRequest(message);
  const inferredImageRequest = rawMode === "image" || isImageRequest(message);
  // Vision input: user uploaded an image file for analysis (not image generation)
  const inferredVisionRequest = rawMode === "upload" && typeof message === "string" && /\.(png|jpe?g|gif|webp|bmp|svg)/i.test(message);
  const inferredHeavyReasoning = !inferredCodeRequest && isHeavyReasoningRequest(typeof message === "string" ? message : "");
  // Distinguish complex from simple coding to tune reasoning effort accordingly
  const inferredComplexCoding = inferredCodeRequest && isComplexCodingRequest(typeof message === "string" ? message : "");

  let queryEmbedding: number[] | null = null;
  let retrievedKnowledgeContext = "";
  let cachedAnswerCandidate: { answer: string; similarity: number; answerId?: string } | null = null;
  let liveWebSearch: WebSearchResponsePayload | null = null;
  // Skip embedding/RAG work for image requests — they return early before any RAG context is used.
  const shouldPerformRagLookup =
    !inferredImageRequest &&
    authUserId !== null &&
    typeof effectiveMessage === "string" &&
    effectiveMessage.trim().length > 0;
  if (shouldPerformRagLookup) {
    try {
      queryEmbedding = await createOpenRouterEmbedding(effectiveMessage);
      const [knowledgeContext, cacheCandidate] = await Promise.all([
        findKnowledgeContext(authUserId, queryEmbedding),
        findCachedAnswer(authUserId, queryEmbedding),
      ]);
      retrievedKnowledgeContext = knowledgeContext;
      cachedAnswerCandidate = cacheCandidate;
      void saveUserProfileFacts(authUserId, effectiveMessage, queryEmbedding);
    } catch {
      queryEmbedding = null;
      retrievedKnowledgeContext = "";
      cachedAnswerCandidate = null;
    }
  }

  const shouldSearchLiveWeb = typeof effectiveMessage === "string" && effectiveMessage.trim().length > 0 && shouldUseLiveWebSearch({
    requested: effectiveAddInternetContext,
    mode: typeof rawMode === "string" ? rawMode : "auto",
    message: effectiveMessage,
    retrievedKnowledgeContext,
    cachedAnswerExists: Boolean(cachedAnswerCandidate),
  });

  if (shouldSearchLiveWeb) {
    try {
      if (authUserId) {
        const supabase = await getSupabase();
        liveWebSearch = await getCachedWebSearch({ supabase, userId: authUserId, query: effectiveMessage });
        if (!liveWebSearch) {
          liveWebSearch = await runTavilySearch(effectiveMessage);
          const expiresAt = await saveWebSearchCache({ supabase, userId: authUserId, payload: liveWebSearch });
          liveWebSearch = { ...liveWebSearch, expiresAt };
        }
        await logUsageEvent({
          supabase,
          userId: authUserId,
          eventType: "web_search",
          provider: liveWebSearch.provider,
          route: "/api/chat",
          metadata: { cached: liveWebSearch.cached, resultCount: liveWebSearch.results.length },
        });
      } else {
        liveWebSearch = await runTavilySearch(effectiveMessage);
      }
    } catch {
      liveWebSearch = null;
    }
  }

  // Very long context: total input length > 6000 chars → route to Gemini 2.5 Flash
  const inferredLongContext = isVeryLongContext(
    typeof effectiveMessage === "string" ? effectiveMessage : "",
    retrievedKnowledgeContext.length,
  );

  // Apply plan-based model filtering: free users only see :free models, pro users cannot use pro+-only models
  const planFilteredAllowedModels = Array.isArray(allowedModelsFinal)
    ? filterModelsByPlan(allowedModelsFinal, userPlan)
    : allowedModelsFinal;

  // Remap deprecated / removed model IDs so users with stale workspace settings
  // are automatically migrated to the current equivalent instead of hitting 404.
  const DEPRECATED_MODEL_ALIASES: Record<string, string> = {
    "openai/gpt-5.1": "openai/gpt-5.2",
  };
  const resolvedModelId = modelId
    ? (DEPRECATED_MODEL_ALIASES[modelId as string] ?? modelId)
    : modelId;

  // If user manually selected a model they don't have access to, override to an appropriate fallback
  const planEnforcedModelId = (() => {
    if (!resolvedModelId) return resolvedModelId;
    if (userPlan === "free" && isModelPremiumOnly(resolvedModelId)) return getFreePlanFallback(inferredCodeRequest);
    if (userPlan === "pro" && isModelProPlusOnly(resolvedModelId)) return getFreePlanFallback(inferredCodeRequest);
    return resolvedModelId;
  })();

  // Apply cost control: filter the allowed models list to respect the user's cost mode
  const costFilteredModels = usingAutoRouter(planFilteredAllowedModels, planEnforcedModelId, inferredImageRequest)
    ? filterModelsByCostMode(planFilteredAllowedModels, costMode)
    : planFilteredAllowedModels;

  const isAutoRouted = usingAutoRouter(costFilteredModels, planEnforcedModelId, inferredImageRequest);

  // Apply cost control to manually selected or default model
  const defaultModel = userPlan === "free"
    ? getFreePlanFallback(inferredCodeRequest)
    : (inferredCodeRequest ? CODE_MODEL : CHAT_MODEL);
  const rawSelectedModel = planEnforcedModelId ?? defaultModel;
  const costControlled = !isAutoRouted && !planEnforcedModelId
    ? getCheaperAlternative(rawSelectedModel, costMode, inferredCodeRequest)
    : { modelId: rawSelectedModel, downgraded: false };

  const toolWebSearchEnabled = Array.isArray(enabledTools) && enabledTools.includes("web_search");
  const effectiveRawMode = rawMode;

  const fallbackModel = getFreePlanFallback(inferredCodeRequest);

  // ── Smart routing: pick model + temperature + reasoning effort per request type ──
  // When the user (or a workspace) explicitly provides allowedModels or a modelId
  // we honour that; otherwise we apply the smart router.
  let selectedModel: string;
  let resolvedTemperature: number;
  let smartRouteLabel: string;
  // reasoning_effort is automatically set based on task complexity.
  // Values: "low" | "medium" | "high" (maps directly to OpenRouter's reasoning_level).
  let resolvedReasoningEffort: string;

  if (planEnforcedModelId) {
    // Manual / workspace-pinned model
    selectedModel = planEnforcedModelId;
    resolvedTemperature = getModelTemperature(selectedModel, {
      isCodeRequest: inferredCodeRequest,
      isLongContext: inferredLongContext,
      isVisionRequest: inferredVisionRequest,
    });
    resolvedReasoningEffort = inferredVisionRequest
      ? "medium"
      : determineReasoningEffort(inferredComplexCoding, inferredHeavyReasoning, inferredCodeRequest);
    smartRouteLabel = `Manual model: ${MODEL_LABELS[selectedModel] ?? selectedModel}`;
  } else if (modelProfile === "gpt-oss-chat" || modelProfile === "gpt-oss-code") {
    selectedModel = modelProfile === "gpt-oss-chat"
      ? (userPlan === "free" ? ROUTING_MAIN_MODEL_FREE : ROUTING_MAIN_MODEL)
      : (userPlan === "free" ? ROUTING_CODE_MODEL_FREE : ROUTING_CODE_MODEL);
    resolvedTemperature = getModelTemperature(selectedModel, {
      isCodeRequest: modelProfile === "gpt-oss-code",
      isLongContext: inferredLongContext,
    });
    resolvedReasoningEffort = modelProfile === "gpt-oss-code" ? "high" : "low";
    smartRouteLabel = `Profile: ${modelProfile}`;
  } else if (isAutoRouted) {
    // ── Smart router (no explicit model chosen) ────────────────────────────────
    if (inferredVisionRequest) {
      selectedModel = ROUTING_VISION_MODEL;
      resolvedTemperature = getModelTemperature(selectedModel, { isVisionRequest: true });
      resolvedReasoningEffort = "medium";
      smartRouteLabel = `Vision analysis — ${MODEL_LABELS[ROUTING_VISION_MODEL] ?? ROUTING_VISION_MODEL}`;
    } else if (inferredCodeRequest) {
      selectedModel = userPlan === "free" ? ROUTING_CODE_MODEL_FREE : ROUTING_CODE_MODEL;
      resolvedTemperature = getModelTemperature(selectedModel, { isCodeRequest: true });
      // Complex debugging/refactor → high; simple function → low
      resolvedReasoningEffort = inferredComplexCoding ? "high" : "low";
      smartRouteLabel = `Coding — ${MODEL_LABELS[ROUTING_CODE_MODEL] ?? ROUTING_CODE_MODEL}${userPlan === "free" ? " (free)" : ""}`;
    } else if (inferredHeavyReasoning) {
      selectedModel = userPlan === "free" ? ROUTING_CODE_MODEL_FREE : ROUTING_REASONING_MODEL;
      resolvedTemperature = getModelTemperature(selectedModel);
      resolvedReasoningEffort = "high";
      smartRouteLabel = `Heavy reasoning — ${MODEL_LABELS[ROUTING_REASONING_MODEL] ?? ROUTING_REASONING_MODEL}${userPlan === "free" ? " (free)" : ""}`;
    } else if (inferredLongContext) {
      selectedModel = ROUTING_GEMINI_MODEL;
      resolvedTemperature = getModelTemperature(selectedModel, { isLongContext: true });
      resolvedReasoningEffort = "low"; // summarisation / extraction doesn't need deep reasoning
      smartRouteLabel = `Long-context — ${MODEL_LABELS[ROUTING_GEMINI_MODEL] ?? ROUTING_GEMINI_MODEL}`;
    } else {
      // Default: main conversational AI — keep it fast and cheap
      selectedModel = userPlan === "free" ? ROUTING_MAIN_MODEL_FREE : ROUTING_MAIN_MODEL;
      resolvedTemperature = getModelTemperature(selectedModel);
      resolvedReasoningEffort = "low";
      smartRouteLabel = `Conversational AI — ${MODEL_LABELS[ROUTING_MAIN_MODEL] ?? ROUTING_MAIN_MODEL}${userPlan === "free" ? " (free)" : ""}`;
    }
  } else {
    selectedModel = costControlled.modelId;
    resolvedTemperature = getModelTemperature(selectedModel, {
      isCodeRequest: inferredCodeRequest,
      isLongContext: inferredLongContext,
      isVisionRequest: inferredVisionRequest,
    });
    resolvedReasoningEffort = determineReasoningEffort(inferredComplexCoding, inferredHeavyReasoning, inferredCodeRequest);
    smartRouteLabel = `Auto: ${MODEL_LABELS[selectedModel] ?? selectedModel}`;
  }

  // Determine if this is a search mode request for system prompt selection
  const isSearchMode = websearchTrigger || toolWebSearchEnabled || effectiveRawMode === "search";
  const isGemini = selectedModel.includes("gemini");
  const detected = detectLanguage(effectiveMessage);
  const languageName = languageLock !== "auto"
    ? (LANGUAGE_NAMES[languageLock] ?? "English")
    : (detected?.name ?? "English");
  const langInstruction = `Always respond in ${languageName}. Do not switch languages.`;
  const styleInstruction = style === "detailed"
    ? "Use detailed responses with clear structure and useful context."
    : style === "step-by-step"
      ? "Explain using concise numbered steps."
      : "Keep responses concise and practical.";
  const assistantInstruction = typeof assistantInstructions === "string" && assistantInstructions.trim()
    ? `Additional agent instructions for ${typeof assistantName === "string" && assistantName.trim() ? assistantName.trim() : "this assistant"}: ${assistantInstructions.trim()}`
    : "";
  const assistantPurposeInstruction = typeof assistantPurpose === "string" && assistantPurpose.trim()
    ? `The active agent's purpose is: ${assistantPurpose.trim()}`
    : "";
  const memoryInstruction = typeof memoryNotes === "string" && memoryNotes.trim()
    ? `Important remembered user context: ${memoryNotes.trim()}`
    : "";
  const programmingLanguageInstruction = typeof preferredProgrammingLanguage === "string" && preferredProgrammingLanguage.trim()
    ? `When code is requested and the user does not specify otherwise, prefer ${preferredProgrammingLanguage.trim()}.`
    : "";
  const interactionProfileInstruction = typeof interactionProfile === "string" && interactionProfile.trim()
    ? `Tailor the response using this local interaction profile: ${interactionProfile.trim()}`
    : "";
  const isGptOssModel = selectedModel.startsWith("openai/gpt-oss-120b");
  const modelProfileInstruction = isGptOssModel && modelProfile === "gpt-oss-code"
    ? "Use the GPT OSS 120B coding profile: prioritize correctness, code quality, tests, and concise engineering explanations."
    : isGptOssModel && modelProfile === "gpt-oss-chat"
      ? "Use the GPT OSS 120B chat profile: prioritize friendly tone, clarity, and concise practical responses."
      : "";
  const modelPromptInstruction = getModelPromptText(selectedModel, inferredCodeRequest);
  const internetContextInstruction = effectiveAddInternetContext
    ? "Use recent web knowledge when the selected model supports it, and prefer concrete, current details over generic background."
    : "";

  // Inject Gmail / Calendar context when the tools provide it
  // Truncate to ~2000 chars to prevent prompt injection and excessive token usage
  const rawGoogleContext = typeof googleContext === "string" ? googleContext.trim() : "";
  const safeGoogleContext = rawGoogleContext.slice(0, 2000);
  const googleContextInstruction = safeGoogleContext
    ? `The user has connected Google. Current context from their Google account:\n${safeGoogleContext}`
    : "";

  const costDowngradeNote = costControlled.downgraded ? ` (downgraded by ${costMode} cost mode)` : "";
  const planDowngradeNote = (modelId && planEnforcedModelId !== modelId) ? " (switched to free model — premium plan required)" : "";
  const routeReason = isSearchMode
    ? (websearchTrigger || toolWebSearchEnabled
      ? (liveWebSearch
        ? `Tavily live web search enabled — answering with ${MODEL_LABELS[selectedModel] ?? selectedModel}`
        : `Web Search enabled — browsing with ${MODEL_LABELS[selectedModel] ?? selectedModel}`)
      : "Search mode")
    : modelId
      ? `Manual model override: ${MODEL_LABELS[selectedModel] ?? selectedModel}${planDowngradeNote}`
      : inferredImageRequest
        ? "Auto-detected an image generation request"
        : `${smartRouteLabel}${costDowngradeNote}${planDowngradeNote}`;

  if (!modelId && rawMode === "auto" && inferredImageRequest) {
    const normalizedPrompt = message.replace(/^\s*\/image\s*/i, "").trim() || "A cinematic digital artwork";
    const encoded = encodeURIComponent(normalizedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true`;

    const imageStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Analyzing image request..." })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Rendering image..." })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: "Pollinations.ai (Free)", routeReason })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `Generated image:\n\n![Generated image](${imageUrl})\n\nIf you want changes, tell me style, colors, camera angle, or aspect ratio.` })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Done" })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(imageStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  }

  // --- RAG logic: inject relevant context into the system prompt ---
  let ragContext = "";
  // Include explicit user notes and retrieved vector context.
  if (typeof memoryNotes === "string" && memoryNotes.trim()) {
    ragContext = `\n\nRelevant context:\n${memoryNotes.trim()}`;
  }
  if (retrievedKnowledgeContext) {
    ragContext = `${ragContext}\n\nRetrieved memory context:\n${retrievedKnowledgeContext}`.trim();
  }
  if (liveWebSearch) {
    const liveWebContext = formatWebSearchContext(liveWebSearch.answer, liveWebSearch.results);
    if (liveWebContext) {
      ragContext = `${ragContext}\n\nRetrieved live web context:\n${liveWebContext}`.trim();
    }
  }

  // ── System prompts per routing destination ─────────────────────────────────
  let systemPrompt: string;
  const sharedSuffix = [
    langInstruction,
    googleContextInstruction,
    assistantPurposeInstruction,
    assistantInstruction,
    memoryInstruction,
    programmingLanguageInstruction,
    interactionProfileInstruction,
    modelPromptInstruction,
    modelProfileInstruction,
    internetContextInstruction,
  ].filter(Boolean).join(" ");

  if (isSearchMode) {
    systemPrompt = `You are a web research assistant. ${langInstruction} ${styleInstruction} Give current, practical answers. When the model has access to current web knowledge, prefer recent facts, mention concrete sources or links when possible, and clearly distinguish facts from guesses. ${sharedSuffix}${ragContext}`.trim();
  } else if (inferredVisionRequest && isGemini) {
    systemPrompt = `${VISION_SYSTEM_PROMPT}\n\n${langInstruction} ${styleInstruction} ${sharedSuffix}${ragContext}`.trim();
  } else if (inferredVisionRequest) {
    systemPrompt = `${VISION_SYSTEM_PROMPT}\n\n${langInstruction} ${styleInstruction} ${sharedSuffix}${ragContext}`.trim();
  } else if (inferredCodeRequest) {
    systemPrompt = `${MAIN_AI_SYSTEM_PROMPT}\n\n${styleInstruction} ${sharedSuffix}${ragContext}`.trim();
  } else if (inferredHeavyReasoning) {
    systemPrompt = `${HEAVY_REASONING_SYSTEM_PROMPT}\n\n${styleInstruction} ${sharedSuffix}${ragContext}`.trim();
  } else if (inferredLongContext) {
    systemPrompt = `Analyze long documents and large context efficiently.\n\nFocus on:\n- summarization\n- context retention\n- accurate extraction\n\n${sharedSuffix}${ragContext}`.trim();
  } else if (isGemini) {
    systemPrompt = `${MAIN_AI_SYSTEM_PROMPT}\n\n${styleInstruction} ${sharedSuffix}${ragContext}`.trim();
  } else {
    systemPrompt = `${MAIN_AI_SYSTEM_PROMPT}\n\n${styleInstruction} ${sharedSuffix}${ragContext}`.trim();
  }

  // Append any custom workspace system prompt
  if (typeof customSystemPrompt === "string" && customSystemPrompt.trim()) {
    systemPrompt = `${systemPrompt} ${customSystemPrompt.trim()}`.trim();
  }

  // Helper to convert client-side history pairs to role/content message format.
  const clientHistoryToMessages = (h: unknown): Array<{ role: string; content: string }> =>
    Array.isArray(h)
      ? h.flatMap((entry: { user: string; ai: string }) => [
          { role: "user", content: entry.user },
          { role: "assistant", content: entry.ai },
        ])
      : [];

  // Build history: use Supabase memory when conversationId + authenticated user are both present,
  // otherwise fall back to client-supplied history (covers unauthenticated users and
  // cases where the DB is unavailable).
  let historyMessages: Array<{ role: string; content: string }> = [];
  if (conversationId && authUserId) {
    try {
      await ensureConversation(conversationId, authUserId);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const message = err instanceof Error ? err.message : "Failed to access conversation.";
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    await saveMessage(conversationId, "user", effectiveMessage);
    const [summaries, memMessages] = await Promise.all([
      getMemorySummaries(conversationId),
      getMemoryHistory(conversationId),
    ]);
    const summaryMessages = summaries.map((s: { summary: string }) => ({
      role: "system",
      content: `[Earlier conversation summary]: ${s.summary}`,
    }));
    const recentMessages = memMessages
      .filter((m: { content: string }) => m.content !== message) // exclude the message we just saved
      .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));
    historyMessages = [...summaryMessages, ...recentMessages];

    // If Supabase returned no history (e.g. first message or RPC not yet applied),
    // fall back to the client-supplied history so conversation context is never lost.
    if (historyMessages.length === 0) {
      historyMessages = clientHistoryToMessages(history);
    }
  } else {
    // Unauthenticated users or no conversationId: use client-provided history.
    historyMessages = clientHistoryToMessages(history);
  }

  const requestBody: Record<string, unknown> = {
    model: selectedModel,
    stream: true,
    max_tokens: getModelMaxTokens(selectedModel, inferredCodeRequest),
    temperature: resolvedTemperature,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: effectiveMessage },
    ],
  };

  // Web search toggle/prefix always routes through OpenRouter web plugin.
  if ((websearchTrigger || toolWebSearchEnabled) && !liveWebSearch) {
    requestBody.plugins = [{ id: "web" }];
  }

  // Send provider-specific reasoning params when the selected model supports it.
  // Google AI Studio uses thinking_config; Groq Qwen3 uses reasoning_effort "default"/"none";
  // OpenAI-style models use reasoning_effort "low"/"medium"/"high".
  // The auto-router already picks the right effort level per task type.
  // If the client explicitly sent a thinkingEffort (e.g. from an advanced UI toggle),
  // that takes precedence over the automatic value.
  if (REASONING_MODEL_IDS.includes(selectedModel)) {
    const isQwen3Model = selectedModel.startsWith("qwen/qwen3");
    if (isGemini) {
      // Google AI Studio: thinking_config.include_thoughts
      requestBody.thinking_config = { include_thoughts: true };
    } else if (isQwen3Model) {
      // Groq Qwen3: reasoning_effort "default" (think) or "none" (skip thinking)
      const effortNum = thinkingEffort
        ? (typeof thinkingEffort === "number" ? thinkingEffort : 2)
        : (resolvedReasoningEffort === "low" ? 1 : 2);
      requestBody.reasoning_effort = effortNum <= 1 ? "none" : "default";
    } else {
      // OpenAI-style models via Groq: reasoning_effort "low" | "medium" | "high"
      if (thinkingEffort) {
        // Client override: map numeric effort (1=low, 2=medium, 3=high, 4=high)
        const effortMap: Record<number, string> = { 1: "low", 2: "medium", 3: "high", 4: "high" };
        const effortNum = typeof thinkingEffort === "number" ? thinkingEffort : 2;
        requestBody.reasoning_effort = effortMap[effortNum] ?? "medium";
      } else {
        // Automatic: resolvedReasoningEffort is already "low" | "medium" | "high"
        requestBody.reasoning_effort = resolvedReasoningEffort;
      }
    }
  }

  if (cachedAnswerCandidate && cachedAnswerCandidate.similarity >= CACHED_ANSWER_SIMILARITY_THRESHOLD) {
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        enqueue({ status: "Reusing a previously solved answer..." });
        enqueue({
          model: MODEL_LABELS[selectedModel] ?? selectedModel,
          routeReason: `Answer cache hit (${(cachedAnswerCandidate.similarity * 100).toFixed(1)}% similarity)`,
        });
        enqueue({ token: cachedAnswerCandidate.answer });
        enqueue({ status: "Done" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        if (conversationId && authUserId) {
          await saveMessage(conversationId, "assistant", cachedAnswerCandidate.answer.trim());
        }
        if (authUserId && cachedAnswerCandidate.answerId) {
          await incrementCachedAnswerUsage(cachedAnswerCandidate.answerId, authUserId);
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  }
  const isGeminiModel = (model: string) => model.includes("gemini");
  const groqApiKey = process.env.GROQ_API_KEY;
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GOOGLE_API_KEY;

  const sendModelRequest = async (body: Record<string, unknown>) => {
    const targetModel = String(body.model ?? "");
    const useGoogleStudio = isGeminiModel(targetModel);
    const endpoint = useGoogleStudio
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";
    const key = useGoogleStudio ? googleApiKey : groqApiKey;
    if (!key) {
      throw new Error(useGoogleStudio ? "Missing Google AI Studio API key." : "Missing Groq API key.");
    }

    // Translate reasoning params to the target provider's format.
    // This is especially important for fallback requests where the body was built
    // for a different provider (e.g. Groq body falling back to Google, or vice versa).
    const providerBody: Record<string, unknown> = { ...body };
    if (useGoogleStudio) {
      // Google AI Studio: remove Groq-style params; use thinking_config when reasoning is active.
      const hasReasoning = providerBody.reasoning_effort !== undefined || providerBody.reasoning_level !== undefined;
      delete providerBody.reasoning_effort;
      delete providerBody.reasoning_level;
      if (hasReasoning || providerBody.thinking_config !== undefined) {
        providerBody.thinking_config = { include_thoughts: true };
      }
    } else {
      // Groq: remove Google-style params.
      delete providerBody.thinking_config;
      delete providerBody.reasoning_level;
      // If falling back to a Qwen3 model with an OpenAI-style effort value, translate it.
      const isQwen3Target = targetModel.startsWith("qwen/qwen3");
      const effort = providerBody.reasoning_effort as string | undefined;
      if (isQwen3Target && effort && ["low", "medium", "high"].includes(effort)) {
        providerBody.reasoning_effort = effort === "low" ? "none" : "default";
      }
      // Remove reasoning_effort for models that don't support it.
      if (effort !== undefined && !REASONING_MODEL_IDS.includes(targetModel)) {
        delete providerBody.reasoning_effort;
      }
    }

    return fetch(endpoint, {
      method: "POST",
      signal: requestSignal,
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(providerBody),
    });
  };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let fullReply = "";
      const safeEnqueue = (payload: string) => {
        if (closed || requestSignal.aborted) return;
        // Collect assistant tokens for saving
        try {
          const parsed = JSON.parse(payload.replace(/^data: /, "").trim());
          if (parsed.token) fullReply += parsed.token;
        } catch {}
        controller.enqueue(encoder.encode(payload));
      };
        const safeClose = async () => {
          if (closed) return;
          closed = true;
          // Save assistant reply to Supabase memory (only for authenticated users)
          if (conversationId && authUserId && fullReply.trim()) {
            await saveMessage(conversationId, "assistant", fullReply.trim());
          }
          if (authUserId && queryEmbedding && effectiveMessage.trim() && fullReply.trim()) {
            await saveCachedAnswer(authUserId, effectiveMessage.trim(), fullReply.trim(), queryEmbedding);
          }
          controller.close();
        };
      const handleAbort = () => {
        void safeClose();
      };

      requestSignal.addEventListener("abort", handleAbort, { once: true });


      try {
        if (requestSignal.aborted) return;

        safeEnqueue(`data: ${JSON.stringify({ status: "Analyzing prompt..." })}\n\n`);
        let response = await sendModelRequest(requestBody);
        let effectiveModel = selectedModel;
        let effectiveRouteReason = routeReason;

        // Helper: get ordered list of models to try (paid first if allowed, then free)
        function getModelFallbackList() {
          // Prefer paid models if user is premium, otherwise free
          const isCode = inferredCodeRequest;
          const allModels = isCode ? CODE_MODELS : CHAT_MODELS;
          // Filter out the current model and duplicates
          const tried = new Set([requestBody.model, selectedModel]);
          return allModels
              .map((m) => m.id)
            .filter((id: string) => !tried.has(id));
        }

        // Try fallback models on 404 (no endpoint found)
        if (!response.ok) {
          let err = await response.text();
            const triedModels = [requestBody.model || selectedModel];
          let status = response.status;
          let fallbackReason = routeReason;
          let found = false;
          const currentModel = String(requestBody.model ?? selectedModel);

          const shouldFallbackToGemini =
            !isGeminiModel(currentModel)
            && (status >= 500 || status === 429 || isProviderRateLimit(status, err));

          if (shouldFallbackToGemini) {
            safeEnqueue(`data: ${JSON.stringify({ status: "Groq unavailable, switching to Gemini 2.5 Flash fallback..." })}\n\n`);
            const geminiFallbackBody: Record<string, unknown> = {
              ...requestBody,
              model: ROUTING_GEMINI_MODEL,
              temperature: getModelTemperature(ROUTING_GEMINI_MODEL, {
                isLongContext: inferredLongContext,
                isVisionRequest: inferredVisionRequest,
              }),
            };
            if (!websearchTrigger && !toolWebSearchEnabled) {
              delete geminiFallbackBody.plugins;
            }
            response = await sendModelRequest(geminiFallbackBody);
            triedModels.push(ROUTING_GEMINI_MODEL);
            if (response.ok) {
              effectiveModel = ROUTING_GEMINI_MODEL;
              fallbackReason = `${routeReason}. Groq unavailable/rate-limited, switched to Gemini 2.5 Flash fallback.`;
              effectiveRouteReason = fallbackReason;
              found = true;
            } else {
              err = await response.text();
              status = response.status;
            }
          }

          if (found) {
            // Gemini fallback succeeded; continue streaming with updated response.
          } else {

          // Try all models in order if 404 (no endpoint found), 5xx (server error on a free model),
          // or 429 upstream provider rate limit (e.g. "temporarily rate-limited upstream").
          const triggeredByFreeModel5xx =
            (status >= 500 || isProviderRateLimit(status, err)) &&
            typeof requestBody.model === "string" &&
            (requestBody.model as string).endsWith(":free");
          if (
            (status === 404 && /No endpoints found|No models match/i.test(err)) ||
            triggeredByFreeModel5xx
          ) {
            let fallbackList = getModelFallbackList();
            // When the failure was a 5xx/rate-limit on a free model, only retry with other
            // free models to avoid unexpectedly billing the user on paid endpoints.
            if (triggeredByFreeModel5xx) {
              fallbackList = fallbackList.filter((id) => id.endsWith(":free"));
            }
            for (const modelId of fallbackList) {
              safeEnqueue(`data: ${JSON.stringify({ status: `Model ${triedModels.at(-1)} unavailable, trying ${modelId}...` })}\n\n`);
              const fallbackRequestBody: Record<string, unknown> = {
                ...requestBody,
                model: modelId,
              };
              // Preserve the web plugin when the user explicitly triggered websearch — dropping
              // it silently would skip web browsing even after the retry succeeds.
              if (!websearchTrigger && !toolWebSearchEnabled) {
                delete fallbackRequestBody.plugins;
              }
              response = await sendModelRequest(fallbackRequestBody);
              triedModels.push(modelId);
              if (response.ok) {
                effectiveModel = modelId;
                fallbackReason = `Auto-fallback: ${routeReason}. Tried: ${triedModels.join(", ")}`;
                found = true;
                break;
              } else {
                err = await response.text();
                status = response.status;
              }
            }
            if (!found) {
               throw new Error(`Provider error ${status}: No available models. Tried: ${triedModels.join(", ")}. Last error: ${err}`);
            }
            // Propagate the updated reason so the client sees the correct fallback info
            effectiveRouteReason = fallbackReason;
          } else {
            // Credits fallback or other error
            const shouldAutoRouterFallback = isAutoRouted && status === 404 && /No models match your request and model restrictions/i.test(err);
            const shouldCreditsFallback = !shouldAutoRouterFallback && isCreditsError(status, err);
            if (!shouldAutoRouterFallback && !shouldCreditsFallback) {
               throw new Error(`Provider error ${status}: ${err}`);
            }
            const freeModel = getFreePlanFallback(inferredCodeRequest);
            const selectedFallbackModel = shouldCreditsFallback ? freeModel : fallbackModel;
            fallbackReason = shouldCreditsFallback
              ? `${routeReason}. Insufficient credits detected, switched to free model.`
              : `${routeReason}. Auto-router found no eligible models, so a direct fallback model was used.`;
            safeEnqueue(`data: ${JSON.stringify({ status: shouldCreditsFallback ? "Switching to free model..." : "Retrying with fallback model..." })}\n\n`);
            const fallbackRequestBody: Record<string, unknown> = {
              ...requestBody,
              model: selectedFallbackModel,
            };
            if (!websearchTrigger && !toolWebSearchEnabled) {
              delete fallbackRequestBody.plugins;
            }
            response = await sendModelRequest(fallbackRequestBody);
            effectiveModel = selectedFallbackModel;
            effectiveRouteReason = fallbackReason;
            if (!response.ok) {
              const fallbackErr = await response.text();
              throw new Error(`Provider error ${response.status}: ${fallbackErr}`);
            }
          }
          }
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Missing streaming body");
        const decoder = new TextDecoder();
        let modelSent = false;
        let buf = "";

        while (true) {
          if (requestSignal.aborted) return;
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);
              if (!modelSent) {
                const label = MODEL_LABELS[effectiveModel] ?? effectiveModel.split("/").pop() ?? "AI";
                safeEnqueue(`data: ${JSON.stringify({ model: label, routeReason: effectiveRouteReason, status: "Writing response..." })}\n\n`);
                modelSent = true;
              }
              const reasoning = parsed.choices?.[0]?.delta?.reasoning;
              if (reasoning) {
                safeEnqueue(`data: ${JSON.stringify({ reasoning })}\n\n`);
              }
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                safeEnqueue(`data: ${JSON.stringify({ token })}\n\n`);
              }
            } catch {
              // Ignore malformed provider chunks.
            }
          }
        }

        if (requestSignal.aborted) return;

        if (!modelSent) {
          const fallback = MODEL_LABELS[effectiveModel] ?? effectiveModel.split("/").pop() ?? "AI";
          safeEnqueue(`data: ${JSON.stringify({ model: fallback, routeReason: effectiveRouteReason })}\n\n`);
        }
        if (!fullReply.trim()) {
          safeEnqueue(`data: ${JSON.stringify({ token: "The AI did not produce a complete response this time. Please try again." })}\n\n`);
        }
        safeEnqueue(`data: ${JSON.stringify({ status: "Done" })}\n\n`);
        safeEnqueue("data: [DONE]\n\n");
      } catch (error) {
        if (requestSignal.aborted || isAbortLikeError(error)) return;
        safeEnqueue(`data: ${JSON.stringify({ token: `Error: ${(error as Error).message}`, status: "Error" })}\n\n`);
        safeEnqueue("data: [DONE]\n\n");
      } finally {
        requestSignal.removeEventListener("abort", handleAbort);
        await safeClose();
      }
    },
  });


  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
};
