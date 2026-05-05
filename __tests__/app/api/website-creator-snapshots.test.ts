/**
 * @jest-environment node
 *
 * Tests for GET /api/website-creator/snapshots and
 *             POST /api/website-creator/snapshots
 */
import { GET, POST } from "@/app/api/website-creator/snapshots/route";
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      from: mockFrom,
      auth: { getUser: mockGetUser },
    })
  ),
}));

const FAKE_USER = { id: "user-snap" };

function makeReq(method: "GET" | "POST", params?: Record<string, string>, body?: object): NextRequest {
  const url = new URL("http://localhost/api/website-creator/snapshots");
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
});

// ── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/website-creator/snapshots", () => {
  function setupGetChain(result: { data: unknown; error: unknown }) {
    const limitMock = jest.fn().mockResolvedValue(result);
    const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
    const eqUserMock = jest.fn().mockReturnValue({ order: orderMock });
    const eqProjectMock = jest.fn().mockReturnValue({ eq: eqUserMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqProjectMock });
    mockFrom.mockReturnValue({ select: selectMock });
  }

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await GET(makeReq("GET", { projectId: "p1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Missing projectId");
  });

  it("returns snapshots array on success", async () => {
    const snaps = [{ id: "s1", label: "v1", created_at: "2024-01-01" }];
    setupGetChain({ data: snaps, error: null });

    const res = await GET(makeReq("GET", { projectId: "proj-1" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { snapshots: unknown[] };
    expect(body.snapshots).toEqual(snaps);
  });

  it("returns empty array when no snapshots exist", async () => {
    setupGetChain({ data: null, error: null });

    const res = await GET(makeReq("GET", { projectId: "proj-1" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { snapshots: unknown[] };
    expect(body.snapshots).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    setupGetChain({ data: null, error: { message: "query failed" } });

    const res = await GET(makeReq("GET", { projectId: "proj-1" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("query failed");
  });
});

// ── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/website-creator/snapshots", () => {
  function setupPostChain(result: { data: unknown; error: unknown }) {
    // First call: project ownership check → from("website_creator_projects").select().eq().eq().single()
    const projectSingleMock = jest.fn().mockResolvedValue({ data: { id: "proj-1" }, error: null });
    const projectEqUserMock = jest.fn().mockReturnValue({ single: projectSingleMock });
    const projectEqIdMock = jest.fn().mockReturnValue({ eq: projectEqUserMock });
    const projectSelectMock = jest.fn().mockReturnValue({ eq: projectEqIdMock });

    // Second call: insert → from("website_creator_snapshots").insert().select().single()
    const singleMock = jest.fn().mockResolvedValue(result);
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    mockFrom
      .mockReturnValueOnce({ select: projectSelectMock })
      .mockReturnValue({ insert: insertMock });

    return { insertMock };
  }

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    const res = await POST(makeReq("POST", {}, { projectId: "p1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/website-creator/snapshots", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 when projectId is missing from body", async () => {
    const res = await POST(makeReq("POST", {}, { html: "<p>hi</p>" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Missing projectId");
  });

  it("creates a snapshot and returns 201", async () => {
    const created = { id: "snap-1", label: "v1", created_at: "2024-01-01" };
    setupPostChain({ data: created, error: null });

    const res = await POST(makeReq("POST", {}, {
      projectId: "proj-1",
      html: "<p>Hello</p>",
      css: "body{}",
      js: "",
      label: "v1",
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as { snapshot: unknown };
    expect(body.snapshot).toEqual(created);
  });

  it("returns 500 on database insert error", async () => {
    setupPostChain({ data: null, error: { message: "insert error" } });

    const res = await POST(makeReq("POST", {}, { projectId: "proj-1" }));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("insert error");
  });

  it("uses empty defaults when optional fields are omitted", async () => {
    const created = { id: "snap-2", label: null, created_at: "2024-02-01" };
    const { insertMock } = setupPostChain({ data: created, error: null });

    const res = await POST(makeReq("POST", {}, { projectId: "proj-1" }));
    expect(res.status).toBe(201);
    // Verify insert was called with default empty values
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      html: "",
      css: "",
      js: "",
      pages: [],
    }));
  });

  it("returns 404 when project does not belong to the user", async () => {
    // Project ownership check returns no matching project
    const projectSingleMock = jest.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const projectEqUserMock = jest.fn().mockReturnValue({ single: projectSingleMock });
    const projectEqIdMock = jest.fn().mockReturnValue({ eq: projectEqUserMock });
    const projectSelectMock = jest.fn().mockReturnValue({ eq: projectEqIdMock });
    mockFrom.mockReturnValue({ select: projectSelectMock });

    const res = await POST(makeReq("POST", {}, { projectId: "other-users-proj" }));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Project not found");
  });
});
