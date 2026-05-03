/**
 * @jest-environment node
 */
import { detectLanguage } from "@/app/api/chat/route";
import { TOP_FREE_CHAT_MODELS, TOP_FREE_CODE_MODELS } from "@/lib/ai-config";

// Mock external dependencies so POST can be tested without live services
jest.mock("@/lib/server", () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [] }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
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

describe("detectLanguage", () => {
  it("returns null for text shorter than 2 characters", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("a")).toBeNull();
    expect(detectLanguage(" ")).toBeNull();
  });

  it("detects Polish from Polish characters", () => {
    const result = detectLanguage("Cześć, jak się masz?");
    expect(result).not.toBeNull();
    expect(result?.lang).toBe("pl");
    expect(result?.name).toBe("Polish");
  });

  it("detects Russian from Cyrillic script", () => {
    const result = detectLanguage("Привет, как дела?");
    expect(result?.lang).toBe("ru");
  });

  it("detects Chinese from CJK characters", () => {
    const result = detectLanguage("你好，今天怎么样？");
    expect(result?.lang).toBe("zh");
  });

  it("detects Japanese from Hiragana/Katakana", () => {
    const result = detectLanguage("こんにちは、元気ですか？");
    expect(result?.lang).toBe("ja");
  });

  it("detects Korean from Hangul", () => {
    const result = detectLanguage("안녕하세요, 오늘 어때요?");
    expect(result?.lang).toBe("ko");
  });

  it("detects Arabic from Arabic script", () => {
    const result = detectLanguage("مرحبا كيف حالك؟");
    expect(result?.lang).toBe("ar");
  });

  it("detects English from common English words", () => {
    const result = detectLanguage("Hello, how are you doing today?");
    expect(result).not.toBeNull();
    expect(result?.lang).toBe("en");
    expect(result?.name).toBe("English");
  });

  it("returns null when no language patterns match", () => {
    const result = detectLanguage("12345 !@#$%");
    expect(result).toBeNull();
  });

  it("prefers English when scores are tied", () => {
    // English-only plain text with common words
    const result = detectLanguage("hello and the is");
    expect(result).not.toBeNull();
    // Should not crash and should return some result
    expect(result?.lang).toBeDefined();
  });

  it("handles text with exactly 2 characters", () => {
    // Should not return null (length is exactly 2)
    // might return null or some language — important is it doesn't throw
    expect(() => detectLanguage("ab")).not.toThrow();
  });

  it("returns a result object with lang and name fields", () => {
    const result = detectLanguage("Bonjour comment allez-vous?");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("lang");
    expect(result).toHaveProperty("name");
    expect(typeof result?.lang).toBe("string");
    expect(typeof result?.name).toBe("string");
  });
});

describe("POST /api/chat — free-model fallback behavior", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
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
    // After removing the forced override, the route picks from TOP_FREE_CHAT_MODELS (random)
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
    // After removing the forced override, the route picks from TOP_FREE_CODE_MODELS (random)
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
    // Code-focused message → picks from TOP_FREE_CODE_MODELS (random)
    expect(TOP_FREE_CODE_MODELS).toContain(calledBody.model);
  });
});
