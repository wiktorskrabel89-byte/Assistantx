import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/server";
import { chunkTextByApproxTokens, createOpenRouterEmbedding, toPgVectorLiteral } from "@/app/lib/knowledge";
import { runWithConcurrency } from "@/app/lib/concurrency";
import { ALL_MODELS, FREE_CHAT_MODEL } from "@/lib/ai-config";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
// Safety cap to limit embedding cost and latency during ingestion.
const MAX_INGESTION_CHUNKS = 60;
// Maximum concurrent embedding API calls during ingestion to balance latency and rate limits.
const EMBEDDING_CONCURRENCY = 5;
const IMAGE_ANALYSIS_MODEL = "google/gemini-2.5-flash";
const IMAGE_ANALYSIS_TEMPERATURE = 0.3;
const DOCUMENT_ANALYSIS_MODEL = FREE_CHAT_MODEL;

function getUploadModelLabel(modelId: string, isImage: boolean): string {
  if (isImage && modelId === IMAGE_ANALYSIS_MODEL) return "Gemini 2.5 Flash (Vision)";
  const found = ALL_MODELS.find((m) => m.id === modelId);
  const base = found?.label ?? modelId;
  return isImage ? base : `${base} (Document)`;
}

type KnowledgeStorageClient = {
  from: (bucket: string) => {
    upload: (
      path: string,
      body: File,
      options: { contentType: string; upsert: boolean }
    ) => Promise<{ error?: { message?: string } | null }>;
  };
};

function getKnowledgeStorageClient(client: unknown): KnowledgeStorageClient | null {
  const storage = (client as { storage?: unknown }).storage;
  if (!storage || typeof (storage as { from?: unknown }).from !== "function") return null;
  return storage as KnowledgeStorageClient;
}

// SVG is intentionally omitted from TEXT_EXTENSIONS: SVG files can embed
// <script> tags and should not be treated as safe plain text for extraction.
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "ts", "tsx", "js", "jsx", "py", "html", "css", "sql", "xml", "yml", "yaml"]);

function getExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

async function extractDocumentText(file: File, bytes: ArrayBuffer): Promise<string> {
  const extension = getExtension(file.name);
  const mimeType = file.type;

  if (mimeType === "application/pdf" || extension === "pdf") {
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === "application/zip" || extension === "zip") {
    const zip = await JSZip.loadAsync(bytes);
    const parts: string[] = [];
    for (const [path, zipEntry] of Object.entries(zip.files) as [string, JSZip.JSZipObject][]) {
      if (zipEntry.dir) continue;
      const fileExt = getExtension(path);
      if (!TEXT_EXTENSIONS.has(fileExt)) continue;
      const content = await zipEntry.async("string");
      parts.push(`// File: ${path}\n${content.trim()}`);
    }
    return parts.join("\n\n---\n\n").slice(0, 30000);
  }

  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension) || mimeType === "application/json") {
    return Buffer.from(bytes).toString("utf8").trim();
  }

  return "";
}
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

export async function POST(req: Request) {
  // Require authentication: file analysis calls OpenRouter which costs money.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  // Rate limit: 10 upload/analysis requests per minute per user/IP
  const rlKey = getRateLimitKey(req, "upload");
  const rl = checkRateLimit(rlKey, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const encoder = new TextEncoder();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const message = (formData.get("message") as string) || "What do you see in this image?";

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json({ error: "File too large. Maximum allowed size is 100 MB." }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type;
    const isImage = mimeType.startsWith("image/");
    const analysisModel = isImage ? IMAGE_ANALYSIS_MODEL : DOCUMENT_ANALYSIS_MODEL;
    const extractedText = isImage ? "" : await extractDocumentText(file, bytes);

    const stream = new ReadableStream({
      async start(controller) {
        let ingestionFileId: string | null = null;
        const persistKnowledge = async () => {
          if (isImage || !extractedText.trim()) return;
          const storage = getKnowledgeStorageClient(supabase);
          if (!storage) return;

          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${user.id}/${Date.now()}-${safeName}`;

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Saving file to knowledge bucket..." })}\n\n`));
          const uploadResult = await storage.from("knowledge").upload(storagePath, file, {
            contentType: mimeType || "application/octet-stream",
            upsert: false,
          });
          if (uploadResult.error) {
            throw new Error(`Knowledge storage upload failed: ${uploadResult.error.message ?? "Unknown error"}`);
          }

          const inserted = await supabase
            .from("knowledge_files")
            .insert({
              user_id: user.id,
              bucket_path: storagePath,
              file_name: file.name,
              mime_type: mimeType || null,
              file_size: file.size,
              status: "processing",
            })
            .select("id")
            .single();

          if (inserted.error || !inserted.data) {
            // Clean up orphaned storage object so the bucket stays consistent.
            try {
              const storageClient = getKnowledgeStorageClient(supabase);
              if (storageClient) {
                await (storageClient.from("knowledge") as unknown as { remove: (paths: string[]) => Promise<unknown> }).remove([storagePath]);
              }
            } catch {
              // best effort
            }
            throw new Error(`Failed to record knowledge file: ${inserted.error?.message ?? "Unknown error"}`);
          }
          ingestionFileId = (inserted.data as { id?: string } | null)?.id ?? null;
          if (!ingestionFileId) return;

          const allChunks = chunkTextByApproxTokens(extractedText);
          const chunks = allChunks.slice(0, MAX_INGESTION_CHUNKS);
          if (allChunks.length > MAX_INGESTION_CHUNKS) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: `Large document detected: indexed first ${MAX_INGESTION_CHUNKS} chunks.` })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: `Indexing ${chunks.length} chunks into memory...` })}\n\n`));

          const fileIdForEmbedding = ingestionFileId;
          const embeddingRows = await runWithConcurrency(chunks, EMBEDDING_CONCURRENCY, async (chunk) => {
            const embedding = await createOpenRouterEmbedding(chunk.content);
            return {
              user_id: user.id,
              file_id: fileIdForEmbedding,
              chunk_index: chunk.chunkIndex,
              content: chunk.content,
              token_count: chunk.tokenCount,
              embedding: toPgVectorLiteral(embedding),
            };
          });
          const rows = embeddingRows;

          if (rows.length > 0) {
            await supabase.from("knowledge_chunks").insert(rows);
          }

          await supabase
            .from("knowledge_files")
            .update({ status: "ready", chunk_count: rows.length, error_message: null })
            .eq("id", ingestionFileId)
            .eq("user_id", user.id);
        };

        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: isImage ? "Preparing image analysis..." : "Extracting document text..." })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: getUploadModelLabel(analysisModel, isImage) })}\n\n`));

          if (!isImage && !extractedText) {
            throw new Error("Unsupported file type. Upload an image, PDF, or text-like document.");
          }

          if (!isImage) {
            try {
              await persistKnowledge();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Knowledge memory updated." })}\n\n`));
            } catch (ingestionError) {
              if (ingestionFileId) {
                await supabase
                  .from("knowledge_files")
                  .update({
                    status: "error",
                    error_message: (ingestionError as Error).message.slice(0, 500),
                  })
                  .eq("id", ingestionFileId)
                  .eq("user_id", user.id);
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Knowledge ingestion failed, continuing with temporary analysis." })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: isImage ? "Analyzing image..." : "Reading document..." })}\n\n`));
          // Move 'Writing response...' status outside the token loop
          let writingStatusSent = false;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://assistantx.vercel.app",
              "X-Title": "AssistantX",
            },
            body: JSON.stringify({
              model: analysisModel,
              stream: true,
              temperature: isImage ? IMAGE_ANALYSIS_TEMPERATURE : undefined,
              messages: [
                {
                  role: "system",
                  content: isImage
                    ? "Analyze images accurately. Focus on screenshots, OCR, UI analysis, and multimodal analysis. Detect the language of the user's message and always respond in that same language."
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
                  if (!writingStatusSent) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Writing response..." })}\n\n`));
                    writingStatusSent = true;
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
              } catch { /* ignore */ }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "Done" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `Error: ${(e as Error).message}`, status: "Error" })}\n\n`));
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
