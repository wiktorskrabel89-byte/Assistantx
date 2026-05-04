/**
 * @jest-environment node
 *
 * Tests for POST /api/chat — mocks are declared before any module imports so
 * the route module is always evaluated after all mocks are in place.
 */

// Mock external dependencies so POST can be tested without live services.
// These jest.mock() calls are hoisted to the top of the file by Jest's transform,
// ensuring they run before any module-level imports of the route.
jest.mock("@/lib/server", () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null }),
      order: jest.fn().mockResolvedValue({ data: [] }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: [] }),
  }),
}));

jest.mock("@/app/api/openrouter/modelCache", () => ({
  fetchLatestModelIds: jest.fn().mockResolvedValue({}),
  getCachedModels: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
  getRateLimitKey: jest.fn().mockReturnValue("test-key"),
  rateLimitedResponse: jest.fn(),
}));

import { TOP_FREE_CHAT_MODELS, TOP_FREE_CODE_MODELS } from "@/lib/ai-config";

describe("POST /api/chat — free-model fallback behavior", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    // Import the route module after mocks are set up
    ({ POST } = await import("@/app/api/chat/route"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("selects a free chat model when rawMode=chat and message is conversational", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello!" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({ message: "Hello, how are you?", mode: "chat" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as { model: string };
    // Free plan with no modelId → route picks from TOP_FREE_CHAT_MODELS (random)
    expect(TOP_FREE_CHAT_MODELS).toContain(calledBody.model);
  });

  it("selects a free code model when rawMode=code", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "code!" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({ message: "Write a Python function", mode: "code" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as { model: string };
    // Free plan with code mode → route picks from TOP_FREE_CODE_MODELS (random)
    expect(TOP_FREE_CODE_MODELS).toContain(calledBody.model);
  });

  it("uses a code free model when rawMode=chat but message is code-focused", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "code!" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    // This message should trigger inferredCodeRequest = true via isCodeRequest()
    const req = makeRequest({ message: "Debug this function: def foo(): pass", mode: "chat" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as { model: string };
    // Code-focused message in chat mode → picks from TOP_FREE_CODE_MODELS
    expect(TOP_FREE_CODE_MODELS).toContain(calledBody.model);
  });
});

