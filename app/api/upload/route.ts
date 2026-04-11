import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const message = (formData.get("message") as string) || "What do you see in this image?";

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: "GPT-4.5 Preview" })}\n\n`));
          const response = await openai.chat.completions.create({
            model: "gpt-4.5-preview",
            stream: true,
            messages: [
              { role: "system", content: "You are a helpful assistant with vision capabilities. Detect the language of the user's message and always respond in that same language." },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                  { type: "text", text: message },
                ],
              },
            ],
          });
          for await (const chunk of response) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `Error: ${(e as Error).message}` })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  } catch (error) {
    console.error("Upload error:", error);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: "Upload failed." })}\n\ndata: [DONE]\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }
}

