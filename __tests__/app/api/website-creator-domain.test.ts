/**
 * @jest-environment node
 *
 * Tests for POST /api/website-creator/domain
 */
import { POST } from "@/app/api/website-creator/domain/route";
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

const FAKE_USER = { id: "user-domain" };

function makeReq(body: object): NextRequest {
  return new NextRequest("http://localhost/api/website-creator/domain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ZONE_ID;
  delete process.env.CLOUDFLARE_BASE_DOMAIN;
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
});

// ── Simulated mode ───────────────────────────────────────────────────────────

describe("POST /api/website-creator/domain — simulated mode", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await POST(makeReq({ subdomain: "mysite" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/website-creator/domain", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when subdomain is missing", async () => {
    const res = await POST(makeReq({ targetUrl: "https://example.com" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("subdomain is required");
  });

  it("returns 400 when subdomain is empty string", async () => {
    const res = await POST(makeReq({ subdomain: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns simulated liveUrl when Cloudflare env vars are absent", async () => {
    const res = await POST(makeReq({ subdomain: "mysite" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { liveUrl: string; recordId: string; note: string };
    expect(body.liveUrl).toBe("https://mysite.example.com");
    expect(body.recordId).toMatch(/^simulated-/);
    expect(body.note).toContain("simulated");
  });
});

// ── Real Cloudflare mode ─────────────────────────────────────────────────────

describe("POST /api/website-creator/domain — Cloudflare mode", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = "cf-token";
    process.env.CLOUDFLARE_ZONE_ID = "zone-123";
    process.env.CLOUDFLARE_BASE_DOMAIN = "example.com";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ZONE_ID;
    delete process.env.CLOUDFLARE_BASE_DOMAIN;
  });

  it("creates a new DNS record when none exists", async () => {
    (global.fetch as jest.Mock)
      // List records → none found
      .mockResolvedValueOnce({ json: async () => ({ result: [] }) })
      // Create record → success
      .mockResolvedValueOnce({
        json: async () => ({ success: true, result: { id: "rec-1" } }),
      });

    const res = await POST(makeReq({ subdomain: "newsite", targetUrl: "https://preview.northflank.com" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { liveUrl: string; recordId: string };
    expect(body.liveUrl).toBe("https://newsite.example.com");
    expect(body.recordId).toBe("rec-1");
  });

  it("updates an existing DNS record when one already exists", async () => {
    (global.fetch as jest.Mock)
      // List records → one found
      .mockResolvedValueOnce({ json: async () => ({ result: [{ id: "existing-rec" }] }) })
      // Update record → success
      .mockResolvedValueOnce({
        json: async () => ({ success: true, result: { id: "existing-rec" } }),
      });

    const res = await POST(makeReq({ subdomain: "mysite" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { recordId: string };
    expect(body.recordId).toBe("existing-rec");
  });

  it("returns 502 when Cloudflare DNS creation fails", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => ({ result: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: false, errors: [{ message: "invalid token" }] }),
      });

    const res = await POST(makeReq({ subdomain: "fail" }));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("invalid token");
  });

  it("returns 502 when Cloudflare DNS update fails", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => ({ result: [{ id: "old-rec" }] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: false, errors: [{ message: "update failed" }] }),
      });

    const res = await POST(makeReq({ subdomain: "fail-update" }));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("update failed");
  });

  it("returns 500 when fetch throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
    const res = await POST(makeReq({ subdomain: "broken" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("network down");
  });

  it("falls back to baseDomain as CNAME target when targetUrl is invalid", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => ({ result: [] }) })
      .mockResolvedValueOnce({
        json: async () => ({ success: true, result: { id: "rec-2" } }),
      });

    const res = await POST(makeReq({ subdomain: "mysite", targetUrl: "not-a-url" }));
    expect(res.status).toBe(200);
    // Verify the second fetch (create) used baseDomain as CNAME target
    const createCall = (global.fetch as jest.Mock).mock.calls[1];
    const createBody = JSON.parse(createCall[1].body as string) as { content: string };
    expect(createBody.content).toBe("example.com");
  });
});
