/** Display names for OpenRouter model IDs shown in the UI and SSE events. */
export const MODEL_LABELS: Record<string, string> = {
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
  "meta-llama/llama-4-scout": "Llama 4 Scout",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
};

/** Returns true when a 429 is a provider-side upstream rate limit rather than credits exhaustion. */
export function isProviderRateLimit(status: number, body: string): boolean {
  if (status !== 429) return false;
  return (
    /rate.?limited upstream/i.test(body) ||
    /temporarily rate.?limited/i.test(body)
  );
}

export function isCreditsError(status: number, body: string): boolean {
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

export function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) return error.name === "AbortError" || /aborted/i.test(error.message);
  return false;
}

export function usingAutoRouter(allowedModels: unknown, modelId: unknown, inferredImageRequest: boolean): boolean {
  return !modelId && Array.isArray(allowedModels) && allowedModels.length > 0 && !inferredImageRequest;
}

/** Returns the OpenRouter reasoning_level string for the given request type. */
export function determineReasoningEffort(
  inferredComplexCoding: boolean,
  inferredHeavyReasoning: boolean,
  inferredCodeRequest: boolean,
): string {
  if (inferredComplexCoding || inferredHeavyReasoning) return "high";
  if (inferredCodeRequest) return "medium";
  return "low";
}
