export async function POST(req: Request) {
  try {
    const { message, mode } = await req.json();

    const res = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, mode: mode ?? "auto" }),
    });

    if (!res.ok) {
      throw new Error(`Backend error: ${res.status}`);
    }

    // Pass the SSE stream straight through to the client
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("AI backend error:", error);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ model: null })}\n\ndata: ${JSON.stringify({ token: "AI backend not available. Is FastAPI running on port 8000?" })}\n\ndata: [DONE]\n\n`
          )
        );
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }
}
