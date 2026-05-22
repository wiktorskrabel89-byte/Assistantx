/**
 * @jest-environment node
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
  }),
}));

jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
  getRateLimitKey: jest.fn().mockReturnValue("probe-key"),
  rateLimitedResponse: jest.fn((retryAfterMs: number) => new Response(JSON.stringify({ retryAfterMs }), { status: 429 })),
}));

import { POST } from "@/app/api/local-server/probe/route";
import { createClient } from "@/lib/server";

describe("POST /api/local-server/probe", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns models for Ollama payload shape", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "qwen2.5:14b" }, { name: "gemma3:12b" }] }), { status: 200 })
    );

    const req = new Request("http://localhost/api/local-server/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: "http://127.0.0.1:11434", apiType: "ollama" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { models: string[]; latencyMs: number };
    expect(body.models).toEqual(["qwen2.5:14b", "gemma3:12b"]);
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns models for OpenAI-compatible payload shape", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "local-chat-model" }, { id: "local-code-model" }] }), { status: 200 })
    );

    const req = new Request("http://localhost/api/local-server/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: "http://127.0.0.1:1234", apiType: "openai-compat" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { models: string[] };
    expect(body.models).toEqual(["local-chat-model", "local-code-model"]);
  });

  it("returns 401 when user is not authenticated", async () => {
    (createClient as jest.Mock).mockResolvedValueOnce({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const req = new Request("http://localhost/api/local-server/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: "http://127.0.0.1:11434", apiType: "ollama" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
