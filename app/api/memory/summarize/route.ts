/**
 * POST /api/memory/summarize
 *
 * Compresses a block of chat messages into 2-3 bullet-point memory notes
 * using Groq (primary) with Google AI Studio fallback.
 *
 * Body:
 *   { messages: Array<{ user: string; ai: string }> }
 *
 * Response:
 *   { summary: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { createClient } from "@/lib/server";
import { MEMORY_SUMMARY_PROMPT, ROUTING_GEMINI_MODEL, ROUTING_MAIN_MODEL, getModelTemperature } from "@/lib/ai-config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Require an authenticated Supabase session to prevent anonymous callers from
  // burning API quota at no cost.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate-limit by user ID for authenticated requests.
  const rlKey = `memory-summarize:user:${user.id}`;
  const rl = checkRateLimit(rlKey, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const body = await req.json() as { messages?: Array<{ user: string; ai: string }> };
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (messages.length === 0) {
    return NextResponse.json({ summary: "" });
  }

  const transcript = messages
    .slice(0, 20) // never summarize more than 20 turns at once
    .map((m, i) => `Turn ${i + 1}\nUser: ${m.user}\nAssistant: ${m.ai}`)
    .join("\n\n");

  const systemPrompt = MEMORY_SUMMARY_PROMPT;

  try {
    const sendChat = async (model: string) => {
      const useGoogleStudio = model.includes("gemini");
      const endpoint = useGoogleStudio
        ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";
      const key = useGoogleStudio
        ? (process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GOOGLE_API_KEY)
        : process.env.GROQ_API_KEY;
      if (!key) throw new Error(useGoogleStudio ? "Missing Google AI Studio API key." : "Missing Groq API key.");
      return fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          temperature: getModelTemperature(model),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Summarize this conversation:\n\n${transcript}` },
          ],
        }),
      });
    };

    let response = await sendChat(ROUTING_MAIN_MODEL);
    if (!response.ok) {
      response = await sendChat(ROUTING_GEMINI_MODEL);
    }

    if (!response.ok) {
      return NextResponse.json({ summary: "" }, { status: response.status });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const summary = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "" });
  }
}
