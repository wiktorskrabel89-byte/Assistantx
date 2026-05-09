/**
 * @jest-environment node
 */
import { POST } from "@/app/api/upload/route";
import { ALL_MODELS, FREE_CHAT_MODEL } from "@/lib/ai-config";

// Derive the expected document model label the same way the route does.
const freeModelEntry = ALL_MODELS.find((m) => m.id === FREE_CHAT_MODEL);
const EXPECTED_DOCUMENT_LABEL = `${freeModelEntry?.label ?? FREE_CHAT_MODEL} (Document)`;

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Supabase so the auth check in the upload route resolves with a user
jest.mock("@/lib/server", () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
      }),
    },
  }),
}));

jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
  getRateLimitKey: jest.fn().mockReturnValue("test-key"),
  rateLimitedResponse: jest.fn(),
}));

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

    expect(events[1]).toHaveProperty("model", "Gemini 2.5 Flash (Vision)");
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

  it("sends vision temperature 0.3 and multimodal analysis prompt for image uploads", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse(["data: [DONE]"])
    );

    const formData = makeFileFormData("fake image", "image/png", "Analyze this screenshot");
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    await POST(req);

    const requestBody = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ) as { temperature?: number; messages: Array<{ role: string; content: string }> };

    expect(requestBody.temperature).toBe(0.3);
    expect(requestBody.messages[0].content).toContain("multimodal analysis");
  });

  it("returns 401 when the user is not authenticated", async () => {
    const { createClient } = jest.requireMock("@/lib/server") as {
      createClient: jest.Mock;
    };
    createClient.mockResolvedValueOnce({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: new FormData(),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Authentication required");
  });

  it("returns 413 when the uploaded file exceeds the 100 MB size limit", async () => {
    // Override the request's formData() to return a FormData whose File
    // reports a size over the 100 MB limit without allocating that memory.
    const file = new File(["tiny"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 101 * 1024 * 1024, configurable: true });

    const fd = new FormData();
    fd.append("file", file);
    fd.append("message", "What is this?");

    const req = new Request("http://localhost/api/upload", { method: "POST" });
    Object.defineProperty(req, "formData", {
      value: jest.fn().mockResolvedValue(fd),
      configurable: true,
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("too large");
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    const rateLimit = jest.requireMock("@/lib/rateLimit") as {
      checkRateLimit: jest.Mock;
      rateLimitedResponse: jest.Mock;
    };
    rateLimit.checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 5_000 });
    rateLimit.rateLimitedResponse.mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 })
    );

    const file = new File(["data"], "test.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("streams an error token when an unsupported binary file is uploaded", async () => {
    const file = new File([new Uint8Array([0x00, 0x01, 0x02])], "binary.bin", {
      type: "application/octet-stream",
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("message", "What is this?");

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const events = await readSseEvents(res);
    const errorEvent = events.find(
      (e) => typeof e.token === "string" && (e.token as string).toLowerCase().includes("unsupported")
    );
    expect(errorEvent).toBeDefined();
  });

  it("processes a plain text file and emits the document model label", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Summary: test content." } }] })}`,
        "data: [DONE]",
      ])
    );

    const file = new File(["This is the document content."], "readme.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("message", "Summarize");

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const events = await readSseEvents(res);
    expect(events.some((e) => e.model === EXPECTED_DOCUMENT_LABEL)).toBe(true);
    const tokens = events.filter((e) => "token" in e).map((e) => e.token);
    expect(tokens).toContain("Summary: test content.");
  });

  it("processes a TypeScript source file as a text document", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Code looks good." } }] })}`,
        "data: [DONE]",
      ])
    );

    const tsCode = "export function add(a: number, b: number): number { return a + b; }";
    const file = new File([tsCode], "utils.ts", { type: "text/typescript" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("message", "Review this code");

    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const events = await readSseEvents(res);
    expect(events.some((e) => e.model === EXPECTED_DOCUMENT_LABEL)).toBe(true);
  });
});
