export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const message = formData.get("message") as string ?? "";

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type;

    const res = await fetch("http://127.0.0.1:8000/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_base64: base64, mime_type: mimeType, message }),
    });

    if (!res.ok) throw new Error(`Backend error: ${res.status}`);

    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ model: "GPT-4.5 Preview" })}\n\ndata: ${JSON.stringify({ token: "File upload failed. Is FastAPI running on port 8000?" })}\n\ndata: [DONE]\n\n`
          )
        );
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }
}
