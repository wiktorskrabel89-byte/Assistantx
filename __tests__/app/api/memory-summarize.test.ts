/**
 * @jest-environment node
 *
 * Tests for POST /api/memory/summarize
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { NextRequest } from "next/server";
import { createClient } from "@/lib/server";
import { POST } from "@/app/api/memory/summarize/route";

const mockCreateClient = createClient as jest.Mock;

const FAKE_USER = { id: "user-abc" };

function makeSupabase(user: object | null) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
}

function makeReq(body: unknown, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers["authorization"] = authHeader;
  return new NextRequest("http://localhost/api/memory/summarize", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeFetchOk(summary: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content: summary } }] }),
  } as unknown as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "test-key";
});

describe("POST /api/memory/summarize", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(null));
    const res = await POST(makeReq({ messages: [] }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns empty summary for an empty messages array", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(FAKE_USER));
    const res = await POST(makeReq({ messages: [] }));
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: string };
    expect(body.summary).toBe("");
  });

  it("returns empty summary when messages field is missing", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(FAKE_USER));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: string };
    expect(body.summary).toBe("");
  });

  it("returns the AI-generated summary on success", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(FAKE_USER));
    const summary = "• User asked about Next.js\n• AI explained routing";
    mockFetch.mockReturnValue(makeFetchOk(summary));

    const res = await POST(makeReq({
      messages: [{ user: "What is Next.js?", ai: "Next.js is a React framework." }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: string };
    expect(body.summary).toBe(summary);
  });

  it("returns empty summary when OpenRouter returns non-ok status", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(FAKE_USER));
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    const res = await POST(makeReq({
      messages: [{ user: "Hello", ai: "Hi" }],
    }));
    expect(res.status).toBe(503);
    const body = await res.json() as { summary: string };
    expect(body.summary).toBe("");
  });

  it("returns empty summary when fetch throws", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(FAKE_USER));
    mockFetch.mockRejectedValue(new Error("Network error"));

    const res = await POST(makeReq({
      messages: [{ user: "Hello", ai: "Hi" }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: string };
    expect(body.summary).toBe("");
  });

  it("truncates to 20 messages before sending to the LLM", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(FAKE_USER));
    mockFetch.mockReturnValue(makeFetchOk("• Summary"));

    const messages = Array.from({ length: 25 }, (_, i) => ({
      user: `Q${i}`,
      ai: `A${i}`,
    }));

    await POST(makeReq({ messages }));

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callBody.messages.find((m) => m.role === "user")?.content ?? "";
    // Only turns 0-19 should appear (Turn 1 to Turn 20)
    expect(userContent).toContain("Turn 20");
    expect(userContent).not.toContain("Turn 21");
  });

  it("returns 429 when rate limit is exceeded (many calls in the same window)", async () => {
    // Each module-level test run resets the rate-limiter state via jest module isolation,
    // but we can test the 429 path by making 11 requests in a row (limit = 10).
    mockCreateClient.mockResolvedValue(makeSupabase({ id: "rl-test-user-unique" }));
    mockFetch.mockReturnValue(makeFetchOk("summary"));

    let lastResponse: Response = new Response();
    for (let i = 0; i < 11; i++) {
      lastResponse = await POST(makeReq({ messages: [{ user: "hi", ai: "hello" }] }));
    }
    // The 11th request should be rate-limited
    expect(lastResponse.status).toBe(429);
  });
});
