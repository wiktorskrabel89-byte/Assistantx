import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "ts", "tsx", "js", "jsx", "py", "html", "css", "sql", "xml", "yml", "yaml"]);

function getExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

async function extractDocumentText(file: File, bytes: ArrayBuffer) {
  const extension = getExtension(file.name);
  const mimeType = file.type;

  if (mimeType === "application/pdf" || extension === "pdf") {
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    try {
      const parsed = await parser.getText();
      return parsed.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension) || mimeType === "application/json") {
    return Buffer.from(bytes).toString("utf8").trim();
  }

  return "";
}

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
    const isImage = mimeType.startsWith("image/");
    const extractedText = isImage ? "" : await extractDocumentText(file, bytes);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: isImage ? "Gemini 2.5 Flash (Vision)" : "Gemini 2.5 Flash (Document)" })}\n\n`));

          if (!isImage && !extractedText) {
            throw new Error("Unsupported file type. Upload an image, PDF, or text-like document.");
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://moje-ai.vercel.app",
              "X-Title": "Moje AI",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-preview",
              stream: true,
              messages: [
                {
                  role: "system",
                  content: isImage
                    ? "You are a helpful assistant with vision capabilities. Detect the language of the user's message and always respond in that same language."
                    : "You are a helpful document assistant. Read the uploaded file carefully, answer in the same language as the user's message, quote important details when useful, and mention if the file appears incomplete.",
                },
                {
                  role: "user",
                  content: isImage
                    ? [
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                        { type: "text", text: message },
                      ]
                    : `User question: ${message}\n\nFile name: ${file.name}\nFile type: ${mimeType || "unknown"}\n\nDocument content:\n${extractedText.slice(0, 30000)}`,
                },
              ],
            }),
          });

          if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenRouter error ${response.status}: ${err}`);
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buf = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;
              try {
                const parsed = JSON.parse(raw);
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
              } catch { /* ignore */ }
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
