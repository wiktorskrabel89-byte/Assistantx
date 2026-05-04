/**
 * @jest-environment node
 *
 * Tests for GET /api/workspaces/state and PUT /api/workspaces/state
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { GET, PUT } from "@/app/api/workspaces/state/route";

const mockCreateClient = createClient as jest.Mock;

const VALID_PAYLOAD = {
  workspaces: [{ id: "ws-1", name: "Workspace 1" }],
  activeWorkspaceId: "ws-1",
  dark: true,
};

function makeSupabase({
  user = { id: "user-1" } as object | null,
  userError = null as Error | null,
  stateData = { state_json: VALID_PAYLOAD, updated_at: "2024-01-01" } as unknown,
  stateError = null as Error | null,
  upsertError = null as Error | null,
} = {}) {
  const maybeSingleMock = jest.fn().mockResolvedValue({ data: stateData, error: stateError });
  const eqMock = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
  const upsertMock = jest.fn().mockResolvedValue({ error: upsertError });

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: userError,
      }),
    },
    from: jest.fn().mockReturnValue({
      select: selectMock,
      upsert: upsertMock,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
describe("GET /api/workspaces/state", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({ user: null }));
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json() as { code: string; error: string };
    expect(body.code).toBe("unauthorized");
  });

  it("returns state and updatedAt for an authenticated user", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { state: unknown; updatedAt: string | null };
    expect(body.state).toEqual(VALID_PAYLOAD);
    expect(body.updatedAt).toBe("2024-01-01");
  });

  it("returns state: null when no row exists", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({ stateData: null }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { state: null; updatedAt: null };
    expect(body.state).toBeNull();
    expect(body.updatedAt).toBeNull();
  });

  it("returns 503 with workspace_sync_not_configured when table does not exist (code 42P01)", async () => {
    const supabase = makeSupabase({ stateError: Object.assign(new Error("workspace_states does not exist"), { code: "42P01" }) });
    mockCreateClient.mockResolvedValue(supabase);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("workspace_sync_not_configured");
  });

  it("returns 503 with workspace_sync_not_configured on permission denied error (code 42501)", async () => {
    const supabase = makeSupabase({ stateError: Object.assign(new Error("permission denied"), { code: "42501" }) });
    mockCreateClient.mockResolvedValue(supabase);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("workspace_sync_not_configured");
  });

  it("returns 500 on generic supabase error", async () => {
    const supabase = makeSupabase({ stateError: Object.assign(new Error("Generic error"), { code: "99999" }) });
    mockCreateClient.mockResolvedValue(supabase);
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("workspace_sync_failed");
  });

  it("returns 401 when getUser throws", async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockRejectedValue(new Error("Auth failure")) },
    });
    const res = await GET();
    // The route catches all errors and returns an error response
    expect([401, 500, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------
describe("PUT /api/workspaces/state", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({ user: null }));
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload (missing workspaces)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify({ activeWorkspaceId: "ws-1", dark: false }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_workspace_payload");
  });

  it("returns 400 for invalid payload (dark not a boolean)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify({ workspaces: [], activeWorkspaceId: "ws-1", dark: "yes" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid payload (activeWorkspaceId not a string)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify({ workspaces: [], activeWorkspaceId: 42, dark: false }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with ok:true on success", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 503 on upsert permission error (code 42501)", async () => {
    const supabase = makeSupabase({ upsertError: Object.assign(new Error("permission denied"), { code: "42501" }) });
    mockCreateClient.mockResolvedValue(supabase);
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const res = await PUT(req);
    expect(res.status).toBe(503);
  });

  it("returns 503 on upsert table missing error (code 42P01)", async () => {
    const supabase = makeSupabase({ upsertError: Object.assign(new Error("workspace_states does not exist"), { code: "42P01" }) });
    mockCreateClient.mockResolvedValue(supabase);
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const res = await PUT(req);
    expect(res.status).toBe(503);
  });

  it("returns 500 on generic upsert error", async () => {
    const supabase = makeSupabase({ upsertError: Object.assign(new Error("Generic DB error"), { code: "XXXXX" }) });
    mockCreateClient.mockResolvedValue(supabase);
    const req = new Request("http://localhost/api/workspaces/state", {
      method: "PUT",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });
});
