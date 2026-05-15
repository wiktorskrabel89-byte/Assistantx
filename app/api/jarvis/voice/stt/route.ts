import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server";

const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    audioBase64?: string;
    mimeType?: string;
    model?: string;
    language?: string;
  } | null;

  const audioBase64 = String(body?.audioBase64 || "").trim();
  if (!audioBase64) {
    return NextResponse.json({ error: "Missing audioBase64 payload." }, { status: 400 });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json({ error: "Groq STT is not configured (missing GROQ_API_KEY)." }, { status: 503 });
  }

  const mimeType = String(body?.mimeType || "audio/wav");
  const model = String(body?.model || DEFAULT_STT_MODEL);
  const language = String(body?.language || "en").split("-")[0];

  try {
    const raw = Buffer.from(audioBase64, "base64");
    const blob = new Blob([raw], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, "voice-input.wav");
    formData.append("model", model);
    if (language && language !== "auto") {
      formData.append("language", language);
    }
    formData.append("response_format", "verbose_json");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: formData,
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({
        error: `Groq STT request failed (${response.status}): ${errText.slice(0, 500)}`,
      }, { status: 502 });
    }

    if (contentType.includes("application/json")) {
      const payload = await response.json() as {
        text?: string;
      };
      return NextResponse.json({
        ok: true,
        text: String(payload?.text || "").trim(),
        isFinal: true,
        provider: "groq",
        model,
      });
    }

    const textPayload = await response.text();
    return NextResponse.json({
      ok: true,
      text: String(textPayload || "").trim(),
      isFinal: true,
      provider: "groq",
      model,
    });
  } catch (error) {
    return NextResponse.json({
      error: `STT pipeline failed: ${error instanceof Error ? error.message : "unknown error"}`,
    }, { status: 500 });
  }
}
