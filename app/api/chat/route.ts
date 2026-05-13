
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
  PERSONALITY_MODES,
  type PersonalityMode,
  VISION_SYSTEM_PROMPT,
} from "@/lib/ai-config";
import { isCodeRequest, isImageRequest, isHeavyReasoningRequest, isVeryLongContext, isComplexCodingRequest } from "@/lib/detect";
import {
  formatWebSearchContext,
  getCachedWebSearch,
  logUsageEvent,
  runTavilySearch,
  saveWebSearchCache,
  shouldUseLiveWebSearch,
  type WebSearchResponsePayload,
} from "@/app/lib/ai-platform";

import { LANGUAGE_NAMES, detectLanguage } from "@/app/api/chat/language";
import { reportChatTokenUsage } from "@/app/api/chat/token-usage";
import {
  CACHED_ANSWER_SIMILARITY_THRESHOLD,
  ensureConversation,
  findCachedAnswer,
  findKnowledgeContext,
  getAuthUserId,
  getMemoryHistory,
  getMemorySummaries,
  getQueryEmbedding,
  getServerSideUserPlan,
  getSupabase,
  incrementCachedAnswerUsage,
  saveCachedAnswer,
  saveMessage,
  saveUserProfileFacts,
} from "@/app/api/chat/supabase";

export { detectLanguage } from "@/app/api/chat/language";
import {
  MODEL_LABELS,
  isProviderRateLimit,
  isCreditsError,
  isAbortLikeError,
  usingAutoRouter,
  determineReasoningEffort,
} from "@/app/api/chat/model-helpers";
import { isModerationBlocked } from "@/app/api/chat/moderation";
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

/** Typed shape of the incoming POST body for the chat endpoint. */
type ChatRequestBody = {
  message?: string;
  mode?: string;
  modelId?: string;
  allowedModels?: string[];
  assistantName?: string;
  assistantPurpose?: string;
  assistantInstructions?: string;
  history?: unknown;
  memoryNotes?: string;
  conversationId?: string;
  style?: string;
  languageLock?: string;
  preferredProgrammingLanguage?: string;
  interactionProfile?: string;
  addInternetContext?: boolean;
  costMode?: string;
  userPlan?: string;
  thinkingEffort?: number;
  modelProfile?: string;
  systemPrompt?: string;
  personalityMode?: string;
  enabledTools?: string[];
  googleContext?: string;
};

/** Matches canonical UUID string formatting (8-4-4-4-12 hex), without validating version bits. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type LlmMessage = { role: string; content: string };
const APPROX_CHARS_PER_TOKEN = 4;
const QWEN_TOKEN_BUDGET = 6000;
const TOKEN_SAFETY_MARGIN = 500;
const MIN_OUTPUT_TOKENS = 256;
const COMPACT_RETRY_MAX_OUTPUT_TOKENS = 512;
const COMPACT_SYSTEM_PROMPT_CHARS = 2500;
const COMPACT_HISTORY_MESSAGE_CHARS = 1200;
const COMPACT_USER_MESSAGE_CHARS = 2200;

function estimateTokensFromText(text: string): number {
  // Approximation only: OpenAI-compatible tokenizers vary by model/language/code content.
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function estimateTokensFromMessages(messages: LlmMessage[]): number {
  // +4 approximates per-message role/framing overhead in chat-completions payloads.
  return messages.reduce((sum, message) => sum + estimateTokensFromText(message.content) + 4, 0);
}

function compactMessages(messages: LlmMessage[]): LlmMessage[] {
  if (messages.length === 0) return [];
  const system = messages.find((message) => message.role === "system");
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUser) {
    return system
      ? [{ role: "system", content: system.content.slice(0, COMPACT_SYSTEM_PROMPT_CHARS) }]
      : [];
  }
  const latestHistory = messages
    .filter((message) => message !== system && message !== latestUser)
    .slice(-2);
  const compacted: LlmMessage[] = [];
  if (system) compacted.push({ role: "system", content: system.content.slice(0, COMPACT_SYSTEM_PROMPT_CHARS) });
  // Keep newest turns (tail) because they are usually the most relevant for continuity.
  compacted.push(...latestHistory.map((message) => ({
    ...message,
    content: message.content.slice(-COMPACT_HISTORY_MESSAGE_CHARS),
  })));
  compacted.push({ role: latestUser.role, content: latestUser.content.slice(-COMPACT_USER_MESSAGE_CHARS) });
  return compacted;
}

function enforceQwenTokenBudget(body: Record<string, unknown>) {
  const model = String(body.model ?? "");
  if (!model.startsWith("qwen/qwen3")) return;

  const messages = Array.isArray(body.messages)
    ? (body.messages as LlmMessage[]).filter((message) => typeof message?.content === "string")
    : [];

  const currentMaxTokens = typeof body.max_tokens === "number"
    ? body.max_tokens
    : Number(body.max_tokens ?? 1024);

  const computeAllowedOutput = (items: LlmMessage[]) =>
    QWEN_TOKEN_BUDGET - TOKEN_SAFETY_MARGIN - estimateTokensFromMessages(items);

  let nextMessages = messages;
  let allowedOutputTokens = computeAllowedOutput(nextMessages);
  if (allowedOutputTokens < MIN_OUTPUT_TOKENS) {
    nextMessages = compactMessages(messages);
    allowedOutputTokens = computeAllowedOutput(nextMessages);
  }

  body.messages = nextMessages;
  body.max_tokens = Math.max(
    MIN_OUTPUT_TOKENS,
    Math.min(currentMaxTokens, allowedOutputTokens),
  );
}

function isRequestSizeTokenError(status: number, errorText: string): boolean {
  if (status === 413) return true;
  return /request too large|tokens per minute.*requested|limit \d+.*requested \d+/i.test(errorText);
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

  // Wrap JSON parsing so malformed bodies return a clean 400 instead of crashing.
  let body: ChatRequestBody;
  try {
    body = await req.json() as ChatRequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid or missing JSON request body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

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
    personalityMode: rawPersonalityMode = "default",
    enabledTools,
    googleContext,
  } = body;

  // ── Validate conversationId format before any DB operation ──────────────────
  if (typeof conversationId === "string" && !UUID_REGEX.test(conversationId)) {
    return new Response(
      JSON.stringify({ error: "Invalid conversationId format." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Reject oversized messages early to prevent token abuse ──────────────────
  const MAX_MESSAGE_LENGTH = 100_000;
  if (typeof message === "string" && message.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({ error: "Message exceeds the maximum allowed length." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

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
  const costMode: CostMode = (VALID_COST_MODES as ReadonlyArray<string>).includes(rawCostMode ?? "")
    ? rawCostMode as CostMode
    : "balanced";
  const VALID_USER_PLANS: UserPlan[] = ["free", "pro", "pro+"];
  const clientPlan: UserPlan = (VALID_USER_PLANS as ReadonlyArray<string>).includes(rawUserPlan ?? "")
    ? rawUserPlan as UserPlan
    : "free";

  // Verify the user's plan server-side from Supabase instead of trusting the client
  const authUserId = await getAuthUserId(req);
  const userPlan = await getServerSideUserPlan(authUserId, clientPlan);

  const inferredCodeRequest = rawMode === "code" || isCodeRequest(message ?? "");
  const inferredImageRequest = rawMode === "image" || isImageRequest(message ?? "");
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
      queryEmbedding = await getQueryEmbedding(effectiveMessage);
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
    "openai/gpt-oss-120b": "openai/gpt-oss-120b:free",
    "qwen/qwen3-32b:free": "qwen/qwen3-32b",
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
    ? filterModelsByCostMode(planFilteredAllowedModels ?? [], costMode)
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
      // Simple coding → Qwen3-32b (fast, free); complex debugging/refactor → GPT OSS 120B
      selectedModel = inferredComplexCoding
        ? (userPlan === "free" ? ROUTING_CODE_MODEL_FREE : ROUTING_CODE_MODEL)
        : ROUTING_MAIN_MODEL;
      resolvedTemperature = getModelTemperature(selectedModel, { isCodeRequest: true });
      // Complex debugging/refactor → high; simple function → low
      resolvedReasoningEffort = inferredComplexCoding ? "high" : "low";
      smartRouteLabel = inferredComplexCoding
        ? `Coding (complex) — ${MODEL_LABELS[selectedModel] ?? selectedModel}${userPlan === "free" ? " (free)" : ""}`
        : `Coding (simple) — ${MODEL_LABELS[selectedModel] ?? selectedModel}`;
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
  const defaultPersonality = PERSONALITY_MODES.find((mode) => mode.id === "default")
    ?? {
      id: "default",
      label: "Default",
      labelPl: "Domyślny",
      emoji: "⚖️",
      description: "Balanced behavior",
      temperature: 0.7,
      systemPromptSuffix: "Be balanced and adaptive. Maintain a natural conversational tone.",
    };
  const selectedPersonality = PERSONALITY_MODES.find((mode) => mode.id === rawPersonalityMode as PersonalityMode)
    ?? defaultPersonality;
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
    const normalizedPrompt = (message ?? "").replace(/^\s*\/image\s*/i, "").trim() || "A cinematic digital artwork";
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

  systemPrompt = `${systemPrompt} ${selectedPersonality.systemPromptSuffix}`.trim();

  // Append any custom workspace system prompt
  if (typeof customSystemPrompt === "string" && customSystemPrompt.trim()) {
    systemPrompt = `${systemPrompt} ${customSystemPrompt.trim()}`.trim();
  }

  // Keep strict model-specific decoding defaults for code/vision requests.
  // Personality temperature overrides apply to conversational responses only.
  if (selectedPersonality.id !== "default" && !inferredCodeRequest && !inferredVisionRequest) {
    resolvedTemperature = selectedPersonality.temperature;
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
  // Groq Qwen3 uses reasoning_effort "default"/"none";
  // OpenAI-style models use reasoning_effort "low"/"medium"/"high".
  // NOTE: Google AI Studio's OpenAI-compatible endpoint does NOT support thinking_config
  // or reasoning_effort — those params are stripped in sendModelRequest for Gemini models.
  // The auto-router already picks the right effort level per task type.
  // If the client explicitly sent a thinkingEffort (e.g. from an advanced UI toggle),
  // that takes precedence over the automatic value.
  if (REASONING_MODEL_IDS.includes(selectedModel)) {
    const isQwen3Model = selectedModel.startsWith("qwen/qwen3");
    if (isGemini) {
      // Google AI Studio's OpenAI-compatible endpoint doesn't support any reasoning params.
      // No special fields needed; the model reasons natively.
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
  enforceQwenTokenBudget(requestBody);

  if (cachedAnswerCandidate && cachedAnswerCandidate.similarity >= CACHED_ANSWER_SIMILARITY_THRESHOLD) {
    const cacheHitRouteReason = `Answer cache hit (${(cachedAnswerCandidate.similarity * 100).toFixed(1)}% similarity)`;
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        enqueue({ status: "Reusing a previously solved answer..." });
        enqueue({
          model: MODEL_LABELS[selectedModel] ?? selectedModel,
          routeReason: cacheHitRouteReason,
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
        if (authUserId) {
          await reportChatTokenUsage({
            userId: authUserId,
            model: selectedModel,
            messages: (requestBody.messages as Array<{ role?: string; content?: string }> | undefined) ?? [],
            reply: cachedAnswerCandidate.answer.trim(),
            routeReason: cacheHitRouteReason,
            cached: true,
          });
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  }
  const isGeminiModel = (model: string) => model.includes("gemini");
  const isOpenRouterModel = (model: string) =>
    model === "openai/gpt-oss-120b" || model === "openai/gpt-oss-120b:free";
  const normalizeOpenRouterModelId = (model: string) =>
    model === "openai/gpt-oss-120b:free" ? "openai/gpt-oss-120b" : model;
  const groqApiKey = process.env.GROQ_API_KEY;
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GOOGLE_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const openRouterReferer = process.env.OPENROUTER_HTTP_REFERER
    ?? (() => {
      try {
        return new URL(req.url).origin;
      } catch {
        return "https://assistantx.vercel.app";
      }
    })();

  const sendModelRequest = async (body: Record<string, unknown>) => {
    const targetModel = String(body.model ?? "");
    const useGoogleStudio = isGeminiModel(targetModel);
    const useOpenRouter = isOpenRouterModel(targetModel);
    const endpoint = useGoogleStudio
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : useOpenRouter
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";
    const key = useGoogleStudio ? googleApiKey : (useOpenRouter ? openRouterApiKey : groqApiKey);
    if (!key) {
      throw new Error(
        useGoogleStudio
          ? "Missing Google AI Studio API key."
          : (useOpenRouter ? "Missing OpenRouter API key." : "Missing Groq API key.")
      );
    }

    // Translate reasoning params to the target provider's format.
    // This is especially important for fallback requests where the body was built
    // for a different provider (e.g. Groq body falling back to Google, or vice versa).
    const providerBody: Record<string, unknown> = { ...body };
    if (useGoogleStudio) {
      // Google AI Studio's OpenAI-compatible endpoint does not support reasoning_effort,
      // reasoning_level, or thinking_config. Strip all of them so the request succeeds.
      delete providerBody.reasoning_effort;
      delete providerBody.reasoning_level;
      delete providerBody.thinking_config;
    } else if (useOpenRouter) {
      providerBody.model = normalizeOpenRouterModelId(targetModel);
      delete providerBody.thinking_config;
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
        ...(useOpenRouter
          ? {
              "HTTP-Referer": openRouterReferer,
              "X-Title": "AssistantX",
            }
          : {}),
      },
      body: JSON.stringify(providerBody),
    });
  };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let fullReply = "";
      let effectiveModel = selectedModel;
      let effectiveRouteReason = routeReason;
      // Actual token counts from provider stream usage chunk (preferred over estimates).
      let actualInputTokens: number | undefined;
      let actualOutputTokens: number | undefined;
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
          if (authUserId && fullReply.trim()) {
            await reportChatTokenUsage({
              userId: authUserId,
              model: effectiveModel,
              messages: (requestBody.messages as Array<{ role?: string; content?: string }> | undefined) ?? [],
              reply: fullReply.trim(),
              routeReason: effectiveRouteReason,
              cached: false,
              actualInputTokens,
              actualOutputTokens,
            });
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

          if (isRequestSizeTokenError(status, err)) {
            safeEnqueue(`data: ${JSON.stringify({ status: "Request too large, retrying with reduced context..." })}\n\n`);
            const compactRequestBody: Record<string, unknown> = {
              ...requestBody,
              messages: compactMessages((requestBody.messages as LlmMessage[]) ?? []),
              max_tokens: Math.min(Number(requestBody.max_tokens ?? 1024), COMPACT_RETRY_MAX_OUTPUT_TOKENS),
            };
            enforceQwenTokenBudget(compactRequestBody);
            response = await sendModelRequest(compactRequestBody);
            triedModels.push(`${currentModel} (compact)`);
            if (response.ok) {
              requestBody.messages = compactRequestBody.messages;
              requestBody.max_tokens = compactRequestBody.max_tokens;
              effectiveRouteReason = `${routeReason}. Reduced request context to stay within provider token limits.`;
              found = true;
            } else {
              err = await response.text();
              status = response.status;
            }
          }

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
              // Capture actual token counts reported by the provider (preferred over estimates).
              // OpenAI-compatible providers send a single usage object, typically in the last
              // data chunk before [DONE]. Overwriting on each chunk is correct: the last value
              // wins and reflects the final totals for the complete response.
              const usage = parsed.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
              if (usage?.prompt_tokens) actualInputTokens = usage.prompt_tokens;
              if (usage?.completion_tokens) actualOutputTokens = usage.completion_tokens;
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
