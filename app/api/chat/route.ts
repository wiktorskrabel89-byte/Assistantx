
import { filterModelsByPlan, isModelPremiumOnly, getFreePlanFallback, filterModelsByCostMode, getCheaperAlternative } from "@/lib/ai-config";
import type { CostMode, UserPlan } from "@/lib/ai-config";
export const maxDuration = 60;



// 3 best truly free coding models on OpenRouter (2026)
const FREE_CODING_MODELS = [
  "openrouter/elephant-alpha", // Elephant Alpha (100B, $0, strong code)
  "meta-llama/llama-4-scout:free", // Llama 4 Scout (open, $0, code)
  "meta-llama/llama-4-scout:free", // Llama 4 Scout (open, $0, code)
];
// 3 best truly free chatting models on OpenRouter (2026)
const FREE_CHAT_MODELS = [
  "openrouter/elephant-alpha", // Elephant Alpha (100B, $0, chat)
  "meta-llama/llama-4-scout:free", // Llama 4 Scout (open, $0, chat)
  "meta-llama/llama-4-scout:free", // Llama 4 Scout (open, $0, chat)
];

const CODE_MODEL = FREE_CODING_MODELS[0];
const CHAT_MODEL = FREE_CHAT_MODELS[1];
const SEARCH_MODEL = "perplexity/sonar";
const FREE_CODE_MODEL = "openrouter/elephant-alpha";
const FREE_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

function isCreditsError(status: number, body: string): boolean {
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

function isCodeRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (/```/.test(text)) return true;
  if (/<\/?[a-z][^>]*>/i.test(text)) return true;
  if (/\b(function|class|interface|type|const|let|var|import|export|npm|yarn|pnpm|sql|regex|api|endpoint|typescript|javascript|python|java|c\+\+|c#|golang|rust|debug|bug|refactor|algorithm)\b/i.test(text)) return true;
  if (/\b(write|generate|create|build|fix|optimize|review|explain)\b.{0,30}\b(code|script|query|function|component)\b/i.test(text)) return true;
  if (/^[\s\w]*[{}()[\];=<>/\\]{2,}[\s\w]*$/.test(text)) return true;

  return false;
}

function isImageRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  return /\b(generate|create|draw|make|design)\b.{0,30}\b(image|picture|photo|art|illustration|logo|poster|wallpaper|icon)\b/.test(text)
    || /^\s*\/image\b/.test(text)
    || /\bimage of\b/.test(text)
    || /\bplease.*\b(image|picture|photo)\b/.test(text);
}

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
  "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3 70B",
  "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
  "meta-llama/llama-4-scout:free": "Llama 4 Scout",
  "deepseek/deepseek-v3.2": "DeepSeek V3.2",
  // "deepseek/deepseek-r1:free": "DeepSeek R1", // removed unavailable model
  "deepseek/deepseek-r1": "DeepSeek R1",
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
  "openai/gpt-5.1": "GPT-5.1",
  "openai/gpt-5.2": "GPT-5.2",
  "openai/gpt-5.2-pro": "GPT-5.2 Pro",
  "openai/gpt-oss-120b": "GPT OSS 120B",
  "x-ai/grok-4": "Grok 4",
  "x-ai/grok-3": "Grok 3",
  "x-ai/grok-3-mini": "Grok 3 Mini",
  "minimax/minimax-m2.5": "MiniMax M2.5",
  "moonshotai/kimi-k2-thinking": "Kimi K2 Thinking",
  "perplexity/sonar": "Perplexity Sonar",
};

export async function POST(req: Request) {
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
    style = "concise",
    languageLock = "auto",
    preferredProgrammingLanguage,
    interactionProfile,
    addInternetContext = false,
    costMode: rawCostMode,
    userPlan: rawUserPlan,
  } = await req.json();
  const encoder = new TextEncoder();
  const VALID_COST_MODES: CostMode[] = ["thrifty", "balanced", "performance"];
  const costMode: CostMode = VALID_COST_MODES.includes(rawCostMode) ? rawCostMode : "balanced";
  const VALID_USER_PLANS: UserPlan[] = ["free", "premium"];
  const userPlan: UserPlan = VALID_USER_PLANS.includes(rawUserPlan) ? rawUserPlan : "free";

  const inferredCodeRequest = rawMode === "code" || isCodeRequest(message);
  const inferredImageRequest = rawMode === "image" || isImageRequest(message);

  // Apply plan-based model filtering: free users can only use :free models
  const planFilteredAllowedModels = Array.isArray(allowedModels)
    ? filterModelsByPlan(allowedModels, userPlan)
    : allowedModels;

  // If user manually selected a non-free model but is on free plan, override to free fallback
  const planEnforcedModelId = modelId && userPlan === "free" && isModelPremiumOnly(modelId)
    ? getFreePlanFallback(inferredCodeRequest)
    : modelId;

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



  const fallbackModel = rawMode === "search"
    ? SEARCH_MODEL
    : inferredCodeRequest



  // Allow user to choose from free models for coding/chatting

  let selectedModel = isAutoRouted
    ? "openrouter/auto"
    : costControlled.modelId;

  // If user requests a free model for coding/chatting, allow selection
  if (!modelId && rawMode === "code" && FREE_CODING_MODELS.length > 0) {
    selectedModel = CODE_MODEL;
  } else if (!modelId && rawMode === "chat" && FREE_CHAT_MODELS.length > 0) {
    selectedModel = CHAT_MODEL;
  }

  // Optionally: expose FREE_CODING_MODELS and FREE_CHAT_MODELS in API response for UI
  const isSearchMode = rawMode === "search" || (!usingAutoRouter && typeof selectedModel === "string" && selectedModel.includes("perplexity"));
  const isDeepSeek = selectedModel.includes("deepseek");
  const isGemini = selectedModel.includes("gemini");
  const detected = detectLanguage(message);
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
  const internetContextInstruction = addInternetContext
    ? "Use recent web knowledge when the selected model supports it, and prefer concrete, current details over generic background."
    : "";

  const costDowngradeNote = costControlled.downgraded ? ` (downgraded by ${costMode} cost mode)` : "";
  const planDowngradeNote = (modelId && planEnforcedModelId !== modelId) ? " (switched to free model — premium plan required)" : "";
  const routeReason = isSearchMode
    ? (isAutoRouted ? "Search mode with automatic model routing" : "Search mode using a research-oriented model")
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
    systemPrompt = `You are a web research assistant. ${langInstruction} ${styleInstruction} Give current, practical answers. When the model has access to current web knowledge, prefer recent facts, mention concrete sources or links when possible, and clearly distinguish facts from guesses. ${internetContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else if (isDeepSeek) {
    systemPrompt = `You are an expert software engineer and coding assistant. ${langInstruction} ${styleInstruction} Help with writing, reviewing, debugging and explaining code. Always use proper markdown code blocks with language tags. Be concise, precise and practical. Prefer showing working code over long explanations. ${internetContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else if (isGemini) {
    systemPrompt = `You are a friendly and knowledgeable conversational assistant. ${langInstruction} ${styleInstruction} Be warm, engaging and helpful. Explain things clearly, ask clarifying questions when needed, and keep responses natural and easy to read. ${internetContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else if (inferredCodeRequest) {
    systemPrompt = `You are an expert programmer. ${langInstruction} ${styleInstruction} When generating code, always use proper formatting with markdown code blocks. Be concise and practical. ${internetContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  } else {
    systemPrompt = `You are a helpful assistant. ${langInstruction} ${styleInstruction} Be friendly and conversational. ${internetContextInstruction} ${assistantPurposeInstruction} ${assistantInstruction} ${programmingLanguageInstruction} ${interactionProfileInstruction}${ragContext}`.trim();
  }

  const historyMessages: Array<{ role: string; content: string }> = Array.isArray(history)
    ? history.flatMap((entry: { user: string; ai: string }) => [
        { role: "user", content: entry.user },
        { role: "assistant", content: entry.ai },
      ])
    : [];

  const requestBody: Record<string, unknown> = {
    model: selectedModel,
    stream: true,
    max_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: message },
    ],
  };

  if (isAutoRouted) {
    requestBody.plugins = [{ id: "auto-router", allowed_models: costFilteredModels }];
  }

  const sendOpenRouterRequest = async (body: Record<string, unknown>) => {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: requestSignal,
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://moje-ai.vercel.app",
        "X-Title": "Moje AI",
      },
      body: JSON.stringify(body),
    });
  };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (payload: string) => {
        if (closed || requestSignal.aborted) return;
        controller.enqueue(encoder.encode(payload));
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const handleAbort = () => {
        safeClose();
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
          const { CODE_MODELS, CHAT_MODELS } = require("@/lib/ai-config");
          const isCode = inferredCodeRequest;
          const allModels = isCode ? CODE_MODELS : CHAT_MODELS;
          // Filter out the current model and duplicates
          const tried = new Set([requestBody.model, selectedModel]);
          return allModels
            .map((m: any) => m.id)
            .filter((id: string) => !tried.has(id));
        }

        // Try fallback models on 404 (no endpoint found)
        if (!response.ok) {
          let err = await response.text();
          let triedModels = [requestBody.model || selectedModel];
          let status = response.status;
          let fallbackReason = routeReason;
          let found = false;

          // Try all models in order if 404 (no endpoint found)
          if (status === 404 && /No endpoints found|No models match/i.test(err)) {
            const fallbackList = getModelFallbackList();
            for (const modelId of fallbackList) {
              safeEnqueue(`data: ${JSON.stringify({ status: `Model ${triedModels.at(-1)} unavailable, trying ${modelId}...` })}\n\n`);
              const fallbackRequestBody: Record<string, unknown> = {
                ...requestBody,
                model: modelId,
              };
              delete fallbackRequestBody.plugins;
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
              }
            }
            if (!found) {
              throw new Error(`OpenRouter error 404: No available models. Tried: ${triedModels.join(", ")}. Last error: ${err}`);
            }
          } else {
            // Credits fallback or other error
            const shouldAutoRouterFallback = isAutoRouted && status === 404 && /No models match your request and model restrictions/i.test(err);
            const shouldCreditsFallback = !shouldAutoRouterFallback && isCreditsError(status, err);
            if (!shouldAutoRouterFallback && !shouldCreditsFallback) {
              throw new Error(`OpenRouter error ${status}: ${err}`);
            }
            const freeModel = inferredCodeRequest ? FREE_CODE_MODEL : FREE_CHAT_MODEL;
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
                const label = effectiveModel === "openrouter/auto"
                  ? "Auto router"
                  : (MODEL_LABELS[effectiveModel] ?? effectiveModel.split("/").pop() ?? "AI");
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
          const fallback = effectiveModel === "openrouter/auto"
            ? "Auto Router"
            : (MODEL_LABELS[effectiveModel] ?? effectiveModel.split("/").pop() ?? "AI");
          safeEnqueue(`data: ${JSON.stringify({ model: fallback, routeReason: effectiveRouteReason })}\n\n`);
        }
        safeEnqueue(`data: ${JSON.stringify({ status: "Done" })}\n\n`);
        safeEnqueue("data: [DONE]\n\n");
      } catch (error) {
        if (requestSignal.aborted || isAbortLikeError(error)) return;
        safeEnqueue(`data: ${JSON.stringify({ token: `Error: ${(error as Error).message}`, status: "Error" })}\n\n`);
        safeEnqueue("data: [DONE]\n\n");
      } finally {
        requestSignal.removeEventListener("abort", handleAbort);
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}