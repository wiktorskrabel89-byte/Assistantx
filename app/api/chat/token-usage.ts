import { logUsageEvent } from "@/app/lib/ai-platform";
import { getSupabase } from "./supabase";

type ChatMessage = { role?: string; content?: string };

function estimateTokensFromText(text: string): number {
  if (!text.trim()) return 0;
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
}) {
  const supabase = await getSupabase();
  await logUsageEvent({
    supabase,
    userId: params.userId,
    eventType: "chat_completion",
    provider: resolveProvider(params.model),
    model: params.model,
    route: "/api/chat",
    tokenInput: estimateInputTokens(params.messages),
    tokenOutput: estimateOutputTokens(params.reply),
    metadata: {
      cached: params.cached,
      routeReason: params.routeReason,
    },
  });
}
