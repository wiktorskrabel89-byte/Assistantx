import { logUsageEvent } from "@/app/lib/ai-platform";
import { getSupabase } from "./supabase";

type ChatMessage = { role?: string; content?: string };

function estimateTokensFromText(text: string): number {
  if (!text.trim()) return 0;
  // Approximation only: ~1 token per 4 chars is a rough heuristic and can vary
  // significantly by language/content type versus real tokenizer counts.
  // In this app the value is used for lightweight usage telemetry (not exact billing),
  // so small/medium estimation error is acceptable for current tracking needs.
  return Math.ceil(text.length / 4);
}

export function estimateInputTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => {
    if (typeof message.content !== "string") return total;
    return total + estimateTokensFromText(message.content);
  }, 0);
}

export function estimateOutputTokens(reply: string): number {
  return estimateTokensFromText(reply);
}

export function resolveProvider(model: string): string {
  if (model.includes("gemini")) return "google-ai-studio";
  if (model === "openai/gpt-oss-120b" || model === "openai/gpt-oss-120b:free") return "openrouter";
  return "groq";
}

export async function reportChatTokenUsage(params: {
  userId: string;
  model: string;
  messages: ChatMessage[];
  reply: string;
  routeReason: string;
  cached: boolean;
  /** Actual input token count from provider stream (preferred over estimate). */
  actualInputTokens?: number;
  /** Actual output token count from provider stream (preferred over estimate). */
  actualOutputTokens?: number;
}) {
  const supabase = await getSupabase();
  await logUsageEvent({
    supabase,
    userId: params.userId,
    eventType: "chat_completion",
    provider: resolveProvider(params.model),
    model: params.model,
    route: "/api/chat",
    tokenInput: params.actualInputTokens ?? estimateInputTokens(params.messages),
    tokenOutput: params.actualOutputTokens ?? estimateOutputTokens(params.reply),
    metadata: {
      cached: params.cached,
      routeReason: params.routeReason,
      tokenCountSource: params.actualInputTokens !== undefined ? "provider" : "estimate",
    },
  });
}
