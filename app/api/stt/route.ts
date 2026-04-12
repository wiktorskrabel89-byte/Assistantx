import { WebSocket } from "ws";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { chunks } = await req.json() as { chunks: string[] };
  if (!chunks?.length) return Response.json({ transcript: "" });

  return new Promise<Response>((resolve) => {
    const ws = new WebSocket(
      "wss://api.inworld.ai/stt/v1/transcribe:streamBidirectional",
      { headers: { Authorization: `Basic ${process.env.INWORLD_TTS_KEY}` } }
    );

    let finalTranscript = "";
    let resolved = false;

    const done = (r: Response) => {
      if (!resolved) { resolved = true; resolve(r); }
    };

    const timer = setTimeout(() => {
      ws.close();
      done(Response.json({ transcript: finalTranscript }));
    }, 20000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        transcribe_config: {
          modelId: "inworld/inworld-stt-1",
          audioEncoding: "LINEAR16",
          sampleRateHertz: 16000,
          enableLanguageDetection: true,
          numberOfChannels: 1,
        },
      }));
      for (const chunk of chunks) {
        ws.send(JSON.stringify({ audio_chunk: { content: chunk } }));
      }
      ws.send(JSON.stringify({ end_turn: {} }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const t = msg?.result?.transcription;
        if (t) {
          finalTranscript = t.transcript;
          if (t.isFinal) {
            clearTimeout(timer);
            ws.send(JSON.stringify({ close_stream: {} }));
            ws.close();
            done(Response.json({ transcript: finalTranscript }));
          }
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      done(Response.json({ error: err.message }, { status: 500 }));
    });

    ws.on("close", () => {
      clearTimeout(timer);
      done(Response.json({ transcript: finalTranscript }));
    });
  });
}
