/**
 * @jest-environment node
 *
 * Tests for POST /api/agents/documentation
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from "@/app/api/agents/documentation/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/agents/documentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeFetchResponse(
  ok: boolean,
  body: unknown,
  status = ok ? 200 : 500,
) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "test-key";
});

describe("POST /api/agents/documentation", () => {
  it("returns 400 when name is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when name is an empty string", async () => {
    const res = await POST(makeReq({ name: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when name is not a string", async () => {
    const res = await POST(makeReq({ name: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when OpenRouter returns a non-ok response", async () => {
    mockFetch.mockReturnValue(makeFetchResponse(false, "Internal Server Error", 500));
    const res = await POST(makeReq({ name: "Test Agent" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/failed/i);
  });

  it("returns 500 when the model returns content without valid JSON", async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse(true, {
        choices: [{ message: { content: "Here is your documentation." } }],
      }),
    );
    const res = await POST(makeReq({ name: "My Agent" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/usable/i);
  });

  it("returns 500 when choices array is empty", async () => {
    mockFetch.mockReturnValue(makeFetchResponse(true, { choices: [] }));
    const res = await POST(makeReq({ name: "My Agent" }));
    expect(res.status).toBe(500);
  });

  it("returns description and instructions on success", async () => {
    const description = "A helpful customer support agent.";
    const instructions = "You are a customer support specialist...";
    mockFetch.mockReturnValue(
      makeFetchResponse(true, {
        choices: [
          {
            message: {
              content: JSON.stringify({ description, instructions }),
            },
          },
        ],
      }),
    );
    const res = await POST(makeReq({ name: "Support Agent" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { description: string; instructions: string };
    expect(body.description).toBe(description);
    expect(body.instructions).toBe(instructions);
  });

  it("extracts JSON embedded within surrounding text", async () => {
    const description = "A coding assistant.";
    const instructions = "You help write code.";
    mockFetch.mockReturnValue(
      makeFetchResponse(true, {
        choices: [
          {
            message: {
              content: `Sure! Here's the JSON:\n${JSON.stringify({ description, instructions })}\nLet me know if you need anything else.`,
            },
          },
        ],
      }),
    );
    const res = await POST(makeReq({ name: "Code Helper" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { description: string; instructions: string };
    expect(body.description).toBe(description);
    expect(body.instructions).toBe(instructions);
  });

  it("returns 500 when JSON has description but no instructions", async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse(true, {
        choices: [
          {
            message: {
              content: JSON.stringify({ description: "Some description" }),
            },
          },
        ],
      }),
    );
    const res = await POST(makeReq({ name: "Incomplete Agent" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const res = await POST(makeReq({ name: "Test Agent" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Network error");
  });

  it("uses the provided descriptionHint and preferredMode in the request", async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse(true, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: "A code review agent.",
                instructions: "Review code thoroughly.",
              }),
            },
          },
        ],
      }),
    );
    await POST(makeReq({ name: "Reviewer", descriptionHint: "reviews code", preferredMode: "code" }));
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = callBody.messages.find((m) => m.role === "user")?.content ?? "";
    expect(userMessage).toContain("reviews code");
    expect(userMessage).toContain("code");
  });

  it("trims whitespace from description and instructions in the response", async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse(true, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: "  Padded description.  ",
                instructions: "\n  Padded instructions.\n  ",
              }),
            },
          },
        ],
      }),
    );
    const res = await POST(makeReq({ name: "Padded Agent" }));
    const body = await res.json() as { description: string; instructions: string };
    expect(body.description).toBe("Padded description.");
    expect(body.instructions).toBe("Padded instructions.");
  });
});
