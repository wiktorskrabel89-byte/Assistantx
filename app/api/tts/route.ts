export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) return Response.json({ error: "No text" }, { status: 400 });

    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${process.env.INWORLD_TTS_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        voiceId: "Dennis",
        modelId: "inworld-tts-1.5-max",
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`TTS error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return Response.json({ audioContent: data.audioContent });
  } catch (error) {
    console.error("TTS error:", error);
    return Response.json({ error: "TTS failed" }, { status: 500 });
  }
}
