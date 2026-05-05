/**
 * @jest-environment node
 *
 * Tests for GET /api/website-creator/logs
 *
 * The route returns an SSE stream. In simulated mode (no NORTHFLANK_API_KEY or
 * serviceId) it emits a fixed set of log lines. These tests verify the response
 * headers and the streamed content in the simulated path.
 */
import { GET } from "@/app/api/website-creator/logs/route";
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

const FAKE_USER = { id: "user-logs" };

function makeReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/website-creator/logs");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

beforeEach(() => {
  delete process.env.NORTHFLANK_API_KEY;
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
});

describe("GET /api/website-creator/logs — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});

describe("GET /api/website-creator/logs — simulated mode", () => {
  it("returns SSE Content-Type header", async () => {
    const res = await GET(makeReq());
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns no-cache Cache-Control header", async () => {
    const res = await GET(makeReq());
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("streams log lines as SSE data events", async () => {
    const res = await GET(makeReq({ serviceId: "" }));
    const text = await readStream(res);
    expect(text).toContain("data:");
    expect(text).toContain("[DONE]");
  });

  it("emits the simulated-mode notice when API key is absent", async () => {
    const res = await GET(makeReq());
    const text = await readStream(res);
    expect(text).toContain("NORTHFLANK_API_KEY not configured");
  });

  it("streams JSON-encoded log objects", async () => {
    const res = await GET(makeReq());
    const text = await readStream(res);
    // Each line: data: {"log": "..."}
    const dataLines = text.split("\n").filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"));
    for (const line of dataLines) {
      const json = JSON.parse(line.slice(6)) as { log: string };
      expect(typeof json.log).toBe("string");
    }
  });
});

describe("GET /api/website-creator/logs — Northflank mode", () => {
  beforeEach(() => {
    process.env.NORTHFLANK_API_KEY = "nf-key";
    process.env.NORTHFLANK_PROJECT_ID = "nf-proj";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.NORTHFLANK_API_KEY;
    delete process.env.NORTHFLANK_PROJECT_ID;
  });

  it("falls back to simulated mode when serviceId is missing", async () => {
    const res = await GET(makeReq({ projectId: "nf-proj" }));
    const text = await readStream(res);
    expect(text).toContain("NORTHFLANK_API_KEY not configured");
    // fetch should NOT have been called because serviceId is missing
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("streams an error SSE when Northflank response is not ok", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      body: null,
      text: async () => "Service not found",
    });

    const res = await GET(makeReq({ serviceId: "svc-1", projectId: "nf-proj" }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await readStream(res);
    expect(text).toContain("Error fetching logs");
  });
});
