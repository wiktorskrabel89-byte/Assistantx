import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server";

const PERSONA_TO_GROQ_VOICE: Record<string, string> = {
  jarvis: "alloy",
  nova: "nova",
  echo: "echo",
  assistant: "alloy",
  default: "alloy",
  aria: "alloy",
};

const MAX_TTS_INPUT_LENGTH = 1500;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    text?: string;
    persona?: string;
    language?: string;
    model?: string;
  } | null;

  const text = String(body?.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }
  if (text.length > MAX_TTS_INPUT_LENGTH) {
    return NextResponse.json({ error: "Text is too long for realtime TTS." }, { status: 400 });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json({ error: "Groq TTS is not configured (missing GROQ_API_KEY)." }, { status: 503 });
  }

  const persona = String(body?.persona || "jarvis").toLowerCase();
  const voice = PERSONA_TO_GROQ_VOICE[persona] || PERSONA_TO_GROQ_VOICE.default;
  const language = String(body?.language || "en-US");
  const model = String(body?.model || "playai-tts");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        format: "wav",
        language,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({
        ok: false,
        error: `Groq TTS request failed (${response.status}): ${errText.slice(0, 500)}`,
      }, { status: 502 });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return NextResponse.json({
      ok: true,
      provider: "groq",
      model,
      persona,
      voice,
      format: "wav",
      audioBase64: audioBuffer.toString("base64"),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: `TTS pipeline failed: ${error instanceof Error ? error.message : "unknown error"}`,
    }, { status: 500 });
  }
}
