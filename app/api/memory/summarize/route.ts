/**
 * POST /api/memory/summarize
 *
 * Compresses a block of chat messages into 2-3 bullet-point memory notes
 * using an OpenRouter LLM call.
 *
 * Body:
 *   { messages: Array<{ user: string; ai: string }> }
 *
 * Response:
 *   { summary: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "memory-summarize");
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

  const systemPrompt =
    "You are a memory-compression assistant. Given a conversation transcript, " +
    "produce 2-3 concise bullet points (each starting with '• ') that capture the key " +
    "context, decisions, and facts a future AI assistant would need. Be terse. " +
    "Do not include greetings or filler. Return only the bullet points.";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://assistantx.pl",
        "X-Title": "AssistantX Memory",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        max_tokens: 300,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Summarize this conversation:\n\n${transcript}` },
        ],
      }),
    });

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
