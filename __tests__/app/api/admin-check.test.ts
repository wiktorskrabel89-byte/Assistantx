/**
 * @jest-environment node
 *
 * Tests for GET /api/admin/check
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { GET } from "@/app/api/admin/check/route";

const mockCreateClient = createClient as jest.Mock;

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers["authorization"] = authHeader;
  return new Request("http://localhost/api/admin/check", { headers });
}

function mockSupabase(user: object | null, error: Error | null = null) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error }),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/admin/check", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("returns 401 when Authorization header does not start with 'Bearer '", async () => {
    const res = await GET(makeReq("Basic sometoken"));
    expect(res.status).toBe(401);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("returns 403 when supabase returns an error", async () => {
    mockSupabase(null, new Error("Invalid token"));
    const res = await GET(makeReq("Bearer bad-token"));
    expect(res.status).toBe(403);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("returns 403 when supabase returns no user", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });
    const res = await GET(makeReq("Bearer some-token"));
    expect(res.status).toBe(403);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("returns isAdmin: false for a regular user without admin role", async () => {
    mockSupabase({ id: "user-1", app_metadata: { role: "user" } });
    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("returns isAdmin: true when app_metadata.role is 'admin'", async () => {
    mockSupabase({ id: "user-1", app_metadata: { role: "admin" } });
    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(true);
  });

  it("returns isAdmin: false when app_metadata is missing", async () => {
    mockSupabase({ id: "user-1" });
    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("returns 500 and isAdmin: false when createClient throws", async () => {
    mockCreateClient.mockRejectedValue(new Error("DB connection failed"));
    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.status).toBe(500);
    const body = await res.json() as { isAdmin: boolean };
    expect(body.isAdmin).toBe(false);
  });

  it("sets Cache-Control: no-store on successful responses", async () => {
    mockSupabase({ id: "user-1", app_metadata: { role: "admin" } });
    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sets Vary: Authorization on successful responses", async () => {
    mockSupabase({ id: "user-1", app_metadata: { role: "admin" } });
    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.headers.get("Vary")).toBe("Authorization");
  });
});
