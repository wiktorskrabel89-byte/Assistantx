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
const ELEVEN_DEFAULT_VOICE = process.env.ELEVENLABS_DEFAULT_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const { data: { user }, error: authError } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    text?: string;
    persona?: string;
    language?: string;
    model?: string;
    provider?: string;
  } | null;

  const text = String(body?.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }
  if (text.length > MAX_TTS_INPUT_LENGTH) {
    return NextResponse.json({ error: "Text is too long for realtime TTS." }, { status: 400 });
  }

  const persona = String(body?.persona || "jarvis").toLowerCase();
  const language = String(body?.language || "en-US");
  const provider = String(body?.provider || "groq").toLowerCase();
  const requestedModel = String(body?.model || "").trim();

  try {
    const response = provider === "openai"
      ? await synthesizeOpenAi({ text, model: requestedModel || "gpt-4o-mini-tts", voicePersona: persona })
      : provider === "elevenlabs"
        ? await synthesizeElevenLabs({ text, language, model: requestedModel || "eleven_multilingual_v2" })
        : await synthesizeGroq({ text, language, model: requestedModel || "playai-tts", voicePersona: persona });
    return NextResponse.json({
      ok: true,
      provider: response.provider,
      model: response.model,
      persona,
      voice: response.voice,
      format: "wav",
      audioBase64: response.audio.toString("base64"),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: `TTS pipeline failed: ${error instanceof Error ? error.message : "unknown error"}`,
    }, { status: 500 });
  }
}

async function synthesizeGroq({
  text,
  language,
  model,
  voicePersona,
}: {
  text: string;
  language: string;
  model: string;
  voicePersona: string;
}) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("Groq TTS is not configured (missing GROQ_API_KEY).");
  }
  const voice = PERSONA_TO_GROQ_VOICE[voicePersona] || PERSONA_TO_GROQ_VOICE.default;
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
    throw new Error(`Groq TTS request failed (${response.status}): ${errText.slice(0, 500)}`);
  }
  return {
    provider: "groq",
    model,
    voice,
    audio: Buffer.from(await response.arrayBuffer()),
  };
}

async function synthesizeOpenAi({
  text,
  model,
  voicePersona,
}: {
  text: string;
  model: string;
  voicePersona: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI TTS is not configured (missing OPENAI_API_KEY).");
  }
  const voice = PERSONA_TO_GROQ_VOICE[voicePersona] || "alloy";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "wav",
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS request failed (${response.status}): ${errText.slice(0, 500)}`);
  }
  return {
    provider: "openai",
    model,
    voice,
    audio: Buffer.from(await response.arrayBuffer()),
  };
}

async function synthesizeElevenLabs({
  text,
  language,
  model,
}: {
  text: string;
  language: string;
  model: string;
}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ElevenLabs TTS is not configured (missing ELEVENLABS_API_KEY).");
  }
  const voice = ELEVEN_DEFAULT_VOICE;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/wav",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
      },
      language_code: language.split("-")[0].toLowerCase(),
      output_format: "pcm_44100",
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS request failed (${response.status}): ${errText.slice(0, 500)}`);
  }
  return {
    provider: "elevenlabs",
    model,
    voice,
    audio: Buffer.from(await response.arrayBuffer()),
  };
}
