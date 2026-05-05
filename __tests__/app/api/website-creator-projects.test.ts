/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/website-creator/projects/route";
import { NextRequest } from "next/server";

const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      from: mockFrom,
      auth: { getUser: mockGetUser },
    })
  ),
}));

const FAKE_USER = { id: "user-abc" };

function makeReq(body?: object, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers["authorization"] = authHeader;
  return new NextRequest("http://localhost/api/website-creator/projects", {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  mockGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });

  // GET chain: select → eq → order
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockEq.mockReturnValue({ order: mockOrder });
  mockSelect.mockReturnValue({ eq: mockEq });

  // POST chain: insert → select → single
  mockSingle.mockResolvedValue({ data: { id: "proj-1", name: "Nowy projekt" }, error: null });
  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
  const selectAfterInsert = jest.fn().mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: selectAfterInsert });

  mockFrom.mockImplementation(() => ({
    select: mockSelect,
    insert: mockInsert,
  }));
});

// ── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/website-creator/projects", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns projects array on success", async () => {
    const projects = [{ id: "p1", name: "Site A", user_id: FAKE_USER.id }];
    mockOrder.mockResolvedValueOnce({ data: projects, error: null });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { projects: unknown[] };
    expect(body.projects).toEqual(projects);
  });

  it("returns empty array when no projects exist", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(makeReq());
    const body = await res.json() as { projects: unknown[] };
    expect(body.projects).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "db failure" } });
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("db failure");
  });

  it("uses bearer token auth when provided", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const res = await GET(makeReq(undefined, "Bearer token-xyz"));
    expect(res.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith("token-xyz");
  });
});

// ── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/website-creator/projects", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await POST(makeReq({ name: "My Site" }));
    expect(res.status).toBe(401);
  });

  it("creates a project and returns 201", async () => {
    const created = { id: "proj-new", name: "My Site", html: "", css: "", js: "" };
    const selectAfterInsert = jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: created, error: null }) });
    mockInsert.mockReturnValue({ select: selectAfterInsert });

    const res = await POST(makeReq({ name: "My Site", html: "<h1>Hi</h1>", css: "body{}", js: "alert(1)" }));
    expect(res.status).toBe(201);
    const body = await res.json() as { project: unknown };
    expect(body.project).toEqual(created);
  });

  it("uses defaults when body fields are omitted", async () => {
    const created = { id: "proj-2", name: "Nowy projekt" };
    const selectAfterInsert = jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: created, error: null }) });
    mockInsert.mockReturnValue({ select: selectAfterInsert });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(201);
    // Verify insert was called with the default name
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ name: "Nowy projekt" }));
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/website-creator/projects", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 500 on database insert error", async () => {
    const selectAfterInsert = jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: "insert failed" } }) });
    mockInsert.mockReturnValue({ select: selectAfterInsert });

    const res = await POST(makeReq({ name: "Bad Site" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("insert failed");
  });
});
