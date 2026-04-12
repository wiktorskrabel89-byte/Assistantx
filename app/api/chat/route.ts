export const maxDuration = 60;

// ── Language detection ─────────────────────────────────────────────────────
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
  {
    lang: "ru", name: "Russian",
    patterns: [/[\u0400-\u04FF]/],
  },
  {
    lang: "zh", name: "Chinese",
    patterns: [/[\u4E00-\u9FFF\u3400-\u4DBF]/],
  },
  {
    lang: "ja", name: "Japanese",
    patterns: [/[\u3040-\u309F\u30A0-\u30FF]/],
  },
  {
    lang: "ko", name: "Korean",
    patterns: [/[\uAC00-\uD7AF\u1100-\u11FF]/],
  },
  {
    lang: "ar", name: "Arabic",
    patterns: [/[\u0600-\u06FF]/],
  },
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
    patterns: [
      /\b(hallo|hoi|dank|ja|nee|hoe|wat|waar|wanneer|waarom|wie|ik|jij|hij|zij|wij|jullie|zij|een|de|het|en|of|maar|met|voor|van)\b/i,
    ],
  },
  {
    lang: "en", name: "English",
    patterns: [
      /\b(hello|hi|hey|thanks|thank you|yes|no|how|what|where|when|why|who|i|you|he|she|we|they|the|a|an|and|or|but|with|for|is|are|was|were|have|has|do|does|can|will|please|help)\b/i,
    ],
  },
];

function detectLanguage(text: string): { lang: string; name: string } | null {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;
  const scores: Record<string, { name: string; score: number }> = {};
  for (const { lang, name, patterns } of LANG_PATTERNS) {
    let score = 0;
    for (const p of patterns) {
      const matches = trimmed.match(new RegExp(p.source, p.flags + (p.flags.includes("g") ? "" : "g")));
      if (matches) score += matches.length;
    }
    if (score > 0) scores[lang] = { name, score };
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  if (ranked.length === 0) return null;
  // Need a clear winner — if top score is tied or too close, prefer English
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
  "deepseek/deepseek-r1:free": "DeepSeek R1",
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
  const { message, mode: rawMode, modelId, allowedModels } = await req.json();
  const encoder = new TextEncoder();

  const isCodeMode = rawMode === "code" || modelId === "deepseek/deepseek-v3.2";
  const detected = detectLanguage(message);
  const langInstruction = detected
    ? `Always respond in ${detected.name}. Do not switch languages.`
    : "Respond in English.";

  const systemPrompt = isCodeMode
    ? `You are an expert programmer. ${langInstruction} When generating code, always use proper formatting with markdown code blocks. Be concise and practical.`
    : `You are a helpful assistant. ${langInstruction} Be friendly and conversational.`;

  const selectedModel = modelId ?? "openrouter/auto";

  const requestBody: Record<string, unknown> = {
    model: selectedModel,
    stream: true,
    max_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
  };

  // Restrict auto router to the relevant model pool
  if (!modelId && Array.isArray(allowedModels) && allowedModels.length > 0) {
    requestBody.plugins = [{ id: "auto-router", allowed_models: allowedModels }];
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://moje-ai.vercel.app",
            "X-Title": "Moje AI",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenRouter error ${response.status}: ${err}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let modelSent = false;
        let buf = "";

        while (true) {
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
                const routed = parsed.model as string | undefined;
                const label = routed
                  ? (MODEL_LABELS[routed] ?? routed.split("/").pop() ?? "Auto Router")
                  : (selectedModel === "openrouter/auto" ? "Auto Router" : (MODEL_LABELS[selectedModel] ?? selectedModel.split("/").pop() ?? "AI"));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: selectedModel === "openrouter/auto" ? `🔀 ${label}` : label })}\n\n`));
                modelSent = true;
              }
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
              }
            } catch { /* ignore malformed */ }
          }
        }

        if (!modelSent) {
          const fallback = selectedModel === "openrouter/auto" ? "🔀 Auto Router" : (MODEL_LABELS[selectedModel] ?? selectedModel.split("/").pop() ?? "AI");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: fallback })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `Error: ${(e as Error).message}` })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}

