
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
  FREE_CHAT_MODEL,
  AUTO_PREFERRED_CODING_MODEL,
  AUTO_PREFERRED_CHAT_MODEL,
  REASONING_MODEL_IDS,
  getModelMaxTokens,
} from "@/lib/ai-config";
import { isCodeRequest, isImageRequest } from "@/lib/detect";

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


// Default search model (constant — never needs dynamic update)
const SEARCH_MODEL = "perplexity/sonar";

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
  "anthropic/claude-haiku-4.5": "Claude Haiku 4.5",
  "openai/gpt-5.4": "GPT-5.4",
  "openai/gpt-5": "GPT-5",
  "openai/gpt-5-mini": "GPT-5 Mini",
  "openai/gpt-5-nano": "GPT-5 Nano",
  "openai/gpt-5.2": "GPT-5.2",
  "openai/gpt-5.2-pro": "GPT-5.2 Pro",
  "openai/gpt-5.3": "GPT-5.3",
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
};


import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";
import { filterHealthyModels, markModelDown, recordModelSuccess } from "@/app/api/openrouter/modelHealth";

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
    systemPrompt: customSystemPrompt,
    enabledTools,
    googleContext,
  } = await req.json();

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

  // Exclude models that are currently marked as down from auto-routing.
  // filterHealthyModels falls back to the full list if all models are marked down.
  const healthyFilteredModels = Array.isArray(costFilteredModels)
    ? filterHealthyModels(costFilteredModels)
    : costFilteredModels;

  const isAutoRouted = usingAutoRouter(healthyFilteredModels, planEnforcedModelId, inferredImageRequest);

  // Apply cost control to manually selected or default model
  const defaultModel = userPlan === "free"
    ? getFreePlanFallback(inferredCodeRequest)
    : (inferredCodeRequest ? CODE_MODEL : CHAT_MODEL);
  const rawSelectedModel = planEnforcedModelId ?? defaultModel;
  const costControlled = !isAutoRouted && !planEnforcedModelId
    ? getCheaperAlternative(rawSelectedModel, costMode, inferredCodeRequest)
    : { modelId: rawSelectedModel, downgraded: false };



  // When the web_search tool is enabled, treat the request as search mode so Perplexity
  // Sonar (which has real internet access) is used instead of a plain text instruction.
  const toolWebSearchEnabled = Array.isArray(enabledTools) && enabledTools.includes("web_search");
  // "websearch" prefix trigger forces search mode but keeps the user's selected model
  // (web browsing is added via the OpenRouter web plugin instead of switching to Perplexity).
  const effectiveRawMode = toolWebSearchEnabled ? "search" : rawMode;

  const fallbackModel = effectiveRawMode === "search"
    ? SEARCH_MODEL
    : getFreePlanFallback(inferredCodeRequest);

  const selectedModel = toolWebSearchEnabled
    ? SEARCH_MODEL
    : isAutoRouted
      ? (healthyFilteredModels.find((id: string) => id === (inferredCodeRequest ? AUTO_PREFERRED_CODING_MODEL : AUTO_PREFERRED_CHAT_MODEL))
          ?? healthyFilteredModels[0]
          ?? getFreePlanFallback(inferredCodeRequest))
      : costControlled.modelId;

  // Determine if this is a search/DeepSeek/Gemini request for system prompt selection
  const isSearchMode = websearchTrigger || effectiveRawMode === "search" || (!isAutoRouted && typeof selectedModel === "string" && selectedModel.includes("perplexity"));
  const isDeepSeek = selectedModel.includes("deepseek");
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
    ? (websearchTrigger && !toolWebSearchEnabled ? `Web search triggered by "websearch" prefix — browsing the web with ${MODEL_LABELS[selectedModel] ?? selectedModel}` : toolWebSearchEnabled ? "Web Search tool active — using search model with internet access" : (isAutoRouted ? "Search mode with automatic model routing" : "Search mode using a research-oriented model"))
    : isAutoRouted
      ? rawMode === "code"
        ? `Auto router choosing the best coding model${costMode !== "performance" ? ` (${costMode} mode)` : ""}${userPlan === "free" ? " (free plan)" : ""}`
        : rawMode === "chat"
          ? `Auto router choosing the best chat model${costMode !== "performance" ? ` (${costMode} mode)` : ""}${userPlan === "free" ? " (free plan)" : ""}`
          : `Auto router choosing the best model for this request${costMode !== "performance" ? ` (${costMode} mode)` : ""}${userPlan === "free" ? " (free plan)" : ""}`
      : modelId
        ? `Manual model override: ${MODEL_LABELS[selectedModel] ?? selectedModel}${planDowngradeNote}`
        : inferredImageRequest
          ? "Auto-detected an image generation request"
          : inferredCodeRequest
            ? `Auto-detected a coding-focused request${costDowngradeNote}${planDowngradeNote}`
            : `Auto-detected a conversational request${costDowngradeNote}${planDowngradeNote}`;

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
  // Use memoryNotes as RAG context if available (or fetch from Supabase/vector store here)
  if (typeof memoryNotes === "string" && memoryNotes.trim()) {
    ragContext = `\n\nRelevant context:\n${memoryNotes.trim()}`;
  }
  // You can extend this to fetch from a vector store if needed

  let systemPrompt: string;
  if (isSearchMode) {
      systemPrompt = `You are a web research assistant. ${langInstruction} ${styleInstruction} Give current, practical answers. When the model has access to current web knowledge, prefer recent facts, mention concrete sources or links when possible, and clearly distinguish facts from guesses. ${internetContextInstruction} ${googleContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${memoryInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else if (isDeepSeek) {
      systemPrompt = `You are an expert software engineer and coding assistant. ${langInstruction} ${styleInstruction} Help with writing, reviewing, debugging and explaining code. Always use proper markdown code blocks with language tags. Be concise, precise and practical. Prefer showing working code over long explanations. ${internetContextInstruction} ${googleContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${memoryInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else if (isGemini) {
      systemPrompt = `You are a friendly and knowledgeable conversational assistant. ${langInstruction} ${styleInstruction} Be warm, engaging and helpful. Explain things clearly, ask clarifying questions when needed, and keep responses natural and easy to read. ${internetContextInstruction} ${googleContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${memoryInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else if (inferredCodeRequest) {
      systemPrompt = `You are an expert programmer. ${langInstruction} ${styleInstruction} When generating code, always use proper formatting with markdown code blocks. Be concise and practical. ${internetContextInstruction} ${googleContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${memoryInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else {
      systemPrompt = `You are a helpful assistant. ${langInstruction} ${styleInstruction} Be friendly and conversational. ${internetContextInstruction} ${googleContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${memoryInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
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
    max_tokens: getModelMaxTokens(selectedModel),
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: effectiveMessage },
    ],
  };

  // When the "websearch" prefix was used, ask OpenRouter to add live web browsing
  // to whichever model the user has selected (works for any model via the web plugin).
  if (websearchTrigger && !toolWebSearchEnabled) {
    requestBody.plugins = [{ id: "web" }];
  }

  // Only send reasoning_level if the selected model explicitly supports it.
  // Use exact ID match to avoid false positives from substring matching.
  if (thinkingEffort && REASONING_MODEL_IDS.includes(selectedModel)) {
    // Map numeric effort (1=low, 2=medium, 3=high, 4=xhigh) to the string OpenRouter expects.
    const effortMap: Record<number, string> = { 1: "low", 2: "medium", 3: "high", 4: "xhigh" };
    const effortNum = typeof thinkingEffort === "number" ? thinkingEffort : 2;
    requestBody.reasoning_level = effortMap[effortNum] ?? "medium";
  }



  const sendOpenRouterRequest = async (body: Record<string, unknown>) => {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: requestSignal,
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://assistantx.vercel.app",
        "X-Title": "AssistantX",
      },
      body: JSON.stringify(body),
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
        controller.close();
      };
      const handleAbort = () => {
        void safeClose();
      };

      requestSignal.addEventListener("abort", handleAbort, { once: true });


      try {
        if (requestSignal.aborted) return;

        safeEnqueue(`data: ${JSON.stringify({ status: "Analyzing prompt..." })}\n\n`);
        let response = await sendOpenRouterRequest(requestBody);
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
            // Mark the initial model as down when OpenRouter says it has no endpoint or is erroring.
            if (typeof requestBody.model === "string") {
              markModelDown(requestBody.model);
            }
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
              if (!websearchTrigger) {
                delete fallbackRequestBody.plugins;
              }
              response = await sendOpenRouterRequest(fallbackRequestBody);
              triedModels.push(modelId);
              if (response.ok) {
                effectiveModel = modelId;
                fallbackReason = `Auto-fallback: ${routeReason}. Tried: ${triedModels.join(", ")}`;
                found = true;
                break;
              } else {
                err = await response.text();
                status = response.status;
                // Mark each failing fallback model as down too.
                if (status >= 500 || (status === 404 && /No endpoints found|No models match/i.test(err)) || isProviderRateLimit(status, err)) {
                  markModelDown(modelId);
                }
              }
            }
            if (!found) {
              throw new Error(`OpenRouter error ${status}: No available models. Tried: ${triedModels.join(", ")}. Last error: ${err}`);
            }
            // Propagate the updated reason so the client sees the correct fallback info
            effectiveRouteReason = fallbackReason;
          } else {
            // Credits fallback or other error
            const shouldAutoRouterFallback = isAutoRouted && status === 404 && /No models match your request and model restrictions/i.test(err);
            const shouldCreditsFallback = !shouldAutoRouterFallback && isCreditsError(status, err);
            // Mark the model as down on 5xx errors that are NOT credits-related.
            if (status >= 500 && !shouldCreditsFallback && typeof requestBody.model === "string") {
              markModelDown(requestBody.model);
            }
            if (!shouldAutoRouterFallback && !shouldCreditsFallback) {
              throw new Error(`OpenRouter error ${status}: ${err}`);
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
            delete fallbackRequestBody.plugins;
            response = await sendOpenRouterRequest(fallbackRequestBody);
            effectiveModel = selectedFallbackModel;
            effectiveRouteReason = fallbackReason;
            if (!response.ok) {
              const fallbackErr = await response.text();
              throw new Error(`OpenRouter error ${response.status}: ${fallbackErr}`);
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
        // Stream completed without error — clear any down status for this model.
        recordModelSuccess(effectiveModel);
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
