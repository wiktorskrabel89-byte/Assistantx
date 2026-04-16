/**
 * @jest-environment node
 */
import { POST } from "@/app/api/upload/route";

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create a streaming response with SSE data lines
function makeSseResponse(lines: string[]) {
  const body = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);

  // Build a minimal ReadableStream that yields the bytes
  let sent = false;
  const readable = new ReadableStream({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(bytes);
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    body: readable,
  };
}

// Helper: read all SSE events from a streaming Response
async function readSseEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const decoder = new TextDecoder();
  const reader = res.body!.getReader();
  const events: Array<Record<string, unknown>> = [];
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }

  for (const line of buf.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") continue;
    try {
      events.push(JSON.parse(raw) as Record<string, unknown>);
    } catch { /* ignore */ }
  }

  return events;
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeFileFormData(
    content = "fake image",
    mimeType = "image/png",
    message = "What do you see?"
  ) {
    const file = new File([content], "test.png", { type: mimeType });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("message", message);
    return formData;
  }

  it("returns a JSON error response when no file is provided", async () => {
    const formData = new FormData();
    formData.append("message", "hello");

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    // The route returns a JSON 400 when no file is present
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("streams a model label event first", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "I see a cat." } }] })}`,
        "data: [DONE]",
      ])
    );

    const formData = makeFileFormData();
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const events = await readSseEvents(res);

    expect(events[0]).toHaveProperty("model", "Gemini 2.5 Flash (Vision)");
  });

  it("streams token events from the upstream API", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}`,
        "data: [DONE]",
      ])
    );

    const formData = makeFileFormData();
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const events = await readSseEvents(res);
    const tokens = events.filter((e) => "token" in e).map((e) => e.token);

    expect(tokens).toContain("Hello");
    expect(tokens).toContain(" world");
  });

  it("sends a DONE marker at the end of the stream", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}`,
        "data: [DONE]",
      ])
    );

    const formData = makeFileFormData();
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const decoder = new TextDecoder();
    const reader = res.body!.getReader();
    let raw = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }

    expect(raw).toContain("data: [DONE]");
  });

  it("streams an error token when upstream API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Service Unavailable",
      body: null,
    });

    const formData = makeFileFormData();
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const events = await readSseEvents(res);
    const errorEvent = events.find(
      (e) => typeof e.token === "string" && (e.token as string).startsWith("Error:")
    );

    expect(errorEvent).toBeDefined();
  });

  it("uses the default message when no message is provided in form", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse(["data: [DONE]"])
    );

    const file = new File(["img"], "test.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    await POST(req);

    const requestBody = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ) as { messages: Array<{ content: unknown }> };
    const userContent = requestBody.messages[1].content as Array<{ type: string; text?: string }>;
    const textPart = userContent.find((c) => c.type === "text");
    expect(textPart?.text).toBe("What do you see in this image?");
  });
});
