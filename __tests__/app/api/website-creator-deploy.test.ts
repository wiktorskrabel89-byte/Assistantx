/**
 * @jest-environment node
 *
 * Tests for POST /api/website-creator/deploy
 *
 * In simulated mode (no NORTHFLANK_API_KEY / NORTHFLANK_PROJECT_ID), the
 * route returns a data-URL preview. These tests cover the simulated path
 * and basic error handling.
 */
import { POST } from "@/app/api/website-creator/deploy/route";
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

const FAKE_USER = { id: "user-deploy" };

function makeReq(body?: object): NextRequest {
  return new NextRequest("http://localhost/api/website-creator/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  delete process.env.NORTHFLANK_API_KEY;
  delete process.env.NORTHFLANK_PROJECT_ID;
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
});

describe("POST /api/website-creator/deploy — simulated mode", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await POST(makeReq({ projectName: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/website-creator/deploy", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns a data-URL previewUrl in simulated mode", async () => {
    const res = await POST(makeReq({ projectName: "test", html: "<p>Hi</p>", css: "body{}", js: "" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { previewUrl: string; deploymentId: string; logs: string[] };
    expect(body.previewUrl).toMatch(/^data:text\/html;base64,/);
    expect(body.deploymentId).toMatch(/^simulated-/);
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
  });

  it("uses default values when html/css/js are omitted", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json() as { previewUrl: string };
    expect(body.previewUrl).toMatch(/^data:text\/html;base64,/);
  });

  it("includes js in the generated HTML when provided", async () => {
    const res = await POST(makeReq({ html: "<p>x</p>", css: "", js: "console.log('hi')" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { previewUrl: string };
    // Decode the base64 payload and verify the script tag is present
    const base64 = body.previewUrl.replace("data:text/html;base64,", "");
    const html = Buffer.from(base64, "base64").toString("utf8");
    expect(html).toContain("console.log('hi')");
    expect(html).toContain("<script>");
  });

  it("does not include a script tag when js is empty", async () => {
    const res = await POST(makeReq({ html: "<p>x</p>", css: "", js: "" }));
    const body = await res.json() as { previewUrl: string };
    const base64 = body.previewUrl.replace("data:text/html;base64,", "");
    const html = Buffer.from(base64, "base64").toString("utf8");
    expect(html).not.toContain("<script>");
  });

  it("includes css in the generated HTML", async () => {
    const res = await POST(makeReq({ html: "", css: "body { color: red; }", js: "" }));
    const body = await res.json() as { previewUrl: string };
    const base64 = body.previewUrl.replace("data:text/html;base64,", "");
    const html = Buffer.from(base64, "base64").toString("utf8");
    expect(html).toContain("body { color: red; }");
  });
});

describe("POST /api/website-creator/deploy — Northflank mode", () => {
  beforeEach(() => {
    process.env.NORTHFLANK_API_KEY = "nf-key";
    process.env.NORTHFLANK_PROJECT_ID = "nf-proj";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.NORTHFLANK_API_KEY;
    delete process.env.NORTHFLANK_PROJECT_ID;
  });

  it("returns 502 when Northflank service creation fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const res = await POST(makeReq({ projectName: "test", html: "<p>x</p>", css: "", js: "" }));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Northflank service creation failed");
  });

  it("returns 502 when file upload fails", async () => {
    // Service creation succeeds (201)
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: "svc-1" } }),
      })
      // File upload fails
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

    const res = await POST(makeReq({ projectName: "test", html: "<p>x</p>", css: "", js: "" }));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("File upload failed");
  });

  it("returns previewUrl on successful deployment", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "svc-123" } }),
      })
      .mockResolvedValueOnce({ ok: true });

    const res = await POST(makeReq({ projectId: "proj-1", projectName: "MySite", html: "<p>x</p>", css: "", js: "" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { previewUrl: string; deploymentId: string };
    expect(body.previewUrl).toContain("nf-proj");
    expect(body.deploymentId).toBe("svc-123");
  });

  it("uses service name as ID when Northflank returns 409 (service exists)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: true });

    const res = await POST(makeReq({ projectId: "existing", projectName: "MySite", html: "", css: "", js: "" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { deploymentId: string };
    expect(body.deploymentId).toMatch(/^site-existing/);
  });

  it("returns 500 when fetch throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network error"));
    const res = await POST(makeReq({ projectName: "test", html: "", css: "", js: "" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("network error");
  });
});
