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

jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
  getRateLimitKey: jest.fn().mockReturnValue("test-key"),
  rateLimitedResponse: jest.fn(),
}));

import {
  TOP_FREE_CHAT_MODELS,
  TOP_FREE_CODE_MODELS,
  ROUTING_MAIN_MODEL_FREE,
  ROUTING_CODE_MODEL_FREE,
} from "@/lib/ai-config";

const normalizeProviderModel = (modelId: string) =>
  modelId === "openai/gpt-oss-120b:free" ? "openai/gpt-oss-120b" : modelId;

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.GOOGLE_AI_STUDIO_API_KEY = "test-google-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
});

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
    expect(TOP_FREE_CHAT_MODELS.map(normalizeProviderModel)).toContain(calledBody.model);
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
    expect(TOP_FREE_CODE_MODELS.map(normalizeProviderModel)).toContain(calledBody.model);
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
    expect(TOP_FREE_CODE_MODELS.map(normalizeProviderModel)).toContain(calledBody.model);
  });
});

describe("POST /api/chat — 5xx free-model retry cascade", () => {
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

  it("retries with Gemini fallback when a Groq model returns 5xx, and succeeds", async () => {
    let callCount = 0;
    const mockFetch = jest.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call returns 503
        return Promise.resolve(
          new Response("Service Unavailable", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }
      // Second call (retry with next free fallback) succeeds
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello!" } }] })}\ndata: [DONE]\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        )
      );
    });

    // Use a free model directly to trigger the 5xx retry path
    const req = makeRequest({
      message: "Hello",
      mode: "chat",
      modelId: "meta-llama/llama-3.3-70b-instruct:free",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Consume the stream so the route's async start() logic fully completes
    await res.text();

    // Should have been called at least twice (initial + one retry)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);

    // First retry should use Gemini fallback when Groq is unavailable
    const retryBody = JSON.parse(
      mockFetch.mock.calls[1][1]?.body as string
    ) as { model: string };
    expect(retryBody.model).toBe("gemini-2.5-flash");
  });

  it("uses Gemini fallback in the retry chain when a Groq model returns 5xx", async () => {
    // All calls fail to exercise the exhausted-fallback code path
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );

    const req = makeRequest({
      message: "Hello",
      mode: "chat",
      modelId: "meta-llama/llama-3.3-70b-instruct:free",
    });
    const res = await POST(req);
    // Consume the stream to let the async retry logic complete
    await res.text();

    const triedModels: string[] = [];
    for (const [, init] of mockFetch.mock.calls) {
      const body = JSON.parse((init as RequestInit).body as string) as { model: string };
      triedModels.push(body.model);
    }
    expect(triedModels).toContain("gemini-2.5-flash");
  });
});


describe("POST /api/chat — web_search tool enables OpenRouter web plugin", () => {
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

  it("keeps selected routing but enables the OpenRouter web plugin when web_search is enabled", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "What happened today?",
      mode: "chat",
      enabledTools: ["web_search"],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      model: string;
      plugins?: Array<{ id: string }>;
    };
    expect(calledBody.plugins).toEqual([{ id: "web" }]);
    expect(calledBody.model).not.toBe("perplexity/sonar");
  });

  it("does not attach the web plugin when web_search is not enabled", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Hello there",
      mode: "chat",
      enabledTools: [],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      model: string;
      plugins?: Array<{ id: string }>;
    };
    expect(calledBody.plugins ?? []).toHaveLength(0);
  });
});

describe("POST /api/chat — unauthenticated user uses client history", () => {
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

  it("includes client-supplied history in messages when unauthenticated and conversationId is present", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Wiktor" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "What is my name?",
      mode: "chat",
      conversationId: "00000000-0000-0000-0000-000000000123",
      history: [{ user: "my name is wiktor", ai: "Nice to meet you, Wiktor!" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    // History should include the prior exchange
    const userMessages = calledBody.messages.filter((m) => m.role === "user");
    const assistantMessages = calledBody.messages.filter((m) => m.role === "assistant");
    expect(userMessages.some((m) => m.content === "my name is wiktor")).toBe(true);
    expect(assistantMessages.some((m) => m.content === "Nice to meet you, Wiktor!")).toBe(true);
  });
});

describe('POST /api/chat — "websearch" prefix enables web plugin on current model', () => {
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

  it('strips the "websearch" prefix and adds the web plugin to the request', async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "websearch what is the capital of France",
      mode: "chat",
      modelId: "qwen/qwen3-32b",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      model: string;
      plugins: Array<{ id: string }>;
      messages: Array<{ role: string; content: string }>;
    };

    // Plugin should be added for web search
    expect(calledBody.plugins).toEqual([{ id: "web" }]);

    // The model should remain the user's selected model, not be replaced by perplexity/sonar
    expect(calledBody.model).toBe("qwen/qwen3-32b");

    // The "websearch" prefix should be stripped from the user message
    const userMsg = calledBody.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("what is the capital of France");
  });

  it('is case-insensitive: "WEBSEARCH" also triggers the web plugin', async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "WEBSEARCH latest news today",
      mode: "chat",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      plugins: Array<{ id: string }>;
      messages: Array<{ role: string; content: string }>;
    };

    expect(calledBody.plugins).toEqual([{ id: "web" }]);
    const userMsg = calledBody.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("latest news today");
  });

  it('does NOT add the web plugin when message does not start with "websearch"', async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Tell me about websearch algorithms",
      mode: "chat",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      plugins?: Array<{ id: string }>;
    };

    // "websearch" only triggers when it's at the very beginning of the message
    expect(calledBody.plugins).toBeUndefined();
  });

  it('does NOT trigger websearch for messages starting with "websearching"', async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "websearching for something",
      mode: "chat",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      plugins?: Array<{ id: string }>;
      messages: Array<{ role: string; content: string }>;
    };

    // "websearching" should not trigger the websearch plugin
    expect(calledBody.plugins).toBeUndefined();
    // The message must be sent as-is, without stripping any prefix
    const userMsg = calledBody.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("websearching for something");
  });

  it('does NOT override the model when "websearch" prefix is used (keeps user-selected model)', async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "result" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "websearch current weather in Warsaw",
      mode: "chat",
      modelId: "openai/gpt-oss-120b:free",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      model: string;
    };
    const calledUrl = String(mockFetch.mock.calls[0][0]);

    // Model must NOT be overridden to perplexity/sonar
    expect(calledBody.model).not.toBe("perplexity/sonar");
    expect(calledBody.model).toBe("openai/gpt-oss-120b");
    expect(calledUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
  });
});

describe("POST /api/chat — Gemini routing temperatures and prompts", () => {
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

  it("uses Gemini fallback temperature 0.6 and main assistant prompt for manual Gemini chat", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Hi there",
      mode: "chat",
      userPlan: "pro",
      modelId: "google/gemini-2.5-flash",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = calledBody.messages.find((m) => m.role === "system");
    expect(calledBody.temperature).toBe(0.6);
    expect(systemMessage?.content).toContain("You are a powerful AI assistant specialized in:");
  });

  it("uses Gemini long-context temperature 0.6 and long-context prompt", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const longMessage = "A".repeat(7000);
    const req = makeRequest({
      message: longMessage,
      mode: "chat",
      userPlan: "pro",
      allowedModels: ["qwen/qwen3-32b", "openai/gpt-oss-120b:free", "google/gemini-2.5-flash"],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
      model: string;
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = calledBody.messages.find((m) => m.role === "system");
    expect(calledBody.model).toBe("gemini-2.5-flash");
    expect(calledBody.temperature).toBe(0.6);
    expect(systemMessage?.content).toContain("Analyze long documents and large context efficiently.");
  });
});

describe("POST /api/chat — reasoning extraction from provider stream chunks", () => {
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

  it("streams reasoning when provider emits reasoning_content deltas (Qwen-like)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "chain", content: "answer" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Solve this",
      mode: "chat",
      modelId: "qwen/qwen3-32b",
      userPlan: "pro",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain(`"reasoning":"chain"`);
    expect(body).toContain(`"token":"answer"`);
  });

  it("streams reasoning from typed content parts and normal text parts separately", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: [{ type: "reasoning", text: "think" }, { type: "text", text: "final" }] } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Explain",
      mode: "chat",
      modelId: "google/gemini-2.5-flash",
      userPlan: "pro",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain(`"reasoning":"think"`);
    expect(body).toContain(`"token":"final"`);
  });

  it("moves inline <think>...</think> text from token stream into reasoning", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "<think>chain of thought</think>final answer" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Explain",
      mode: "chat",
      modelId: "qwen/qwen3-32b",
      userPlan: "pro",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain(`"reasoning":"chain of thought"`);
    expect(body).toContain(`"token":"final answer"`);
    expect(body).not.toContain("<think>");
  });

  it("handles <think> tags that are split across multiple provider chunks", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "<thi" } }] })}\n`
          + `data: ${JSON.stringify({ choices: [{ delta: { content: "nk>secret</think>visible" } }] })}\n`
          + "data: [DONE]\n",
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "Explain",
      mode: "chat",
      modelId: "qwen/qwen3-32b",
      userPlan: "pro",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain(`"reasoning":"secret"`);
    expect(body).toContain(`"token":"visible"`);
    expect(body).not.toContain(`"token":"<thi"`);
  });
});

describe("POST /api/chat — profile-based routing", () => {
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

  it("uses Qwen chat model for gpt-oss-chat profile on simple chat prompts", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "hi",
      mode: "chat",
      userPlan: "free",
      modelProfile: "gpt-oss-chat",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as { model: string };
    expect(calledBody.model).toBe(normalizeProviderModel(ROUTING_MAIN_MODEL_FREE));
  });

  it("uses GPT OSS code model for gpt-oss-code profile", async () => {
    const mockFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\ndata: [DONE]\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const req = makeRequest({
      message: "write a function",
      mode: "code",
      userPlan: "free",
      modelProfile: "gpt-oss-code",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as { model: string };
    expect(calledBody.model).toBe(normalizeProviderModel(ROUTING_CODE_MODEL_FREE));
  });
});
