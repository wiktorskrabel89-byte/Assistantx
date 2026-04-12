export const maxDuration = 60;

const CODE_KEYWORDS = [
  "kod", "code", "funkcja", "function", "skrypt", "script",
  "napisz", "wygeneruj", "implement", "stwórz", "fix", "napraw",
  "class", "klasa", "def ", "const ", "let ", "var ", "import ",
  "snippet", "przykład kodu",
];

function isCodeRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return CODE_KEYWORDS.some((k) => lower.includes(k));
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
  const { message, modelId, mode: rawMode, allowedModels } = await req.json();
  const isAuto = !modelId && rawMode === "auto";
  const encoder = new TextEncoder();

  // Determine system prompt based on model or request content
  const CODE_MODEL_IDS = [
    "deepseek/deepseek-v3.2",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5-mini",
  ];
  const isCodeMode = modelId ? CODE_MODEL_IDS.includes(modelId) : isCodeRequest(message);
  const systemPrompt = isCodeMode
    ? "You are an expert programmer. Detect the language of the user's message and always respond in that same language. When generating code, always use proper formatting with markdown code blocks. Be concise and practical."
    : "Detect the language of the user's message and always respond in that same language. Be helpful, friendly and conversational.";

  const selectedModel = modelId ?? "openrouter/auto";

  const requestBody: Record<string, unknown> = {
    model: selectedModel,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
  };

  // For auto router, restrict to the 6 configured direct models
  if (isAuto && Array.isArray(allowedModels) && allowedModels.length > 0) {
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
                  : (isAuto ? "Auto Router" : (MODEL_LABELS[selectedModel] ?? selectedModel.split("/").pop() ?? "AI"));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: isAuto ? `🔀 ${label}` : label })}\n\n`));
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
          const fallback = isAuto ? "🔀 Auto Router" : (MODEL_LABELS[selectedModel] ?? selectedModel.split("/").pop() ?? "AI");
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

