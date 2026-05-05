import { createClient } from "@/lib/server";
import { NextRequest } from "next/server";

/** GET /api/website-creator/logs?serviceId=...&projectId=...
 *
 * Streams build / runtime logs from Northflank for a given service as
 * Server-Sent Events. Falls back to a placeholder when keys are not configured.
 */

export const maxDuration = 60;

async function getUser(req: NextRequest) {
  const supabase = await createClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) return data.user;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const northflankProjectId = searchParams.get("projectId") ?? process.env.NORTHFLANK_PROJECT_ID;

  const apiKey = process.env.NORTHFLANK_API_KEY;

  const encoder = new TextEncoder();

  function sse(data: string): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify({ log: data })}\n\n`);
  }

  // ── Simulated mode ────────────────────────────────────────────────────────────
  if (!apiKey || !northflankProjectId || !serviceId) {
    const stream = new ReadableStream({
      start(controller) {
        const lines = [
          "NORTHFLANK_API_KEY not configured — simulated logs.",
          "[INFO] Build started...",
          "[INFO] Copying static files...",
          "[INFO] index.html → /public",
          "[INFO] Build complete.",
          "[INFO] Service healthy.",
        ];
        let i = 0;
        function enqueue() {
          if (i >= lines.length) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          controller.enqueue(sse(lines[i++]));
          setTimeout(enqueue, 300);
        }
        enqueue();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── Real Northflank log streaming ─────────────────────────────────────────────
  try {
    const northflankRes = await fetch(
      `https://api.northflank.com/v1/projects/${northflankProjectId}/services/${serviceId}/logs`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream",
        },
      }
    );

    if (!northflankRes.ok || !northflankRes.body) {
      const errText = await northflankRes.text().catch(() => "Unknown error");
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(sse(`Error fetching logs: ${errText}`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
      });
    }

    // Pipe Northflank SSE through, extracting log lines
    const reader = northflankRes.body.getReader();
    const dec = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buf = "";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6)) as { log?: string };
                  if (parsed.log) controller.enqueue(sse(parsed.log));
                } catch {
                  controller.enqueue(sse(line.slice(6)));
                }
              }
            }
          }
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Log stream failed.";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sse(`Error: ${msg}`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  }
}
