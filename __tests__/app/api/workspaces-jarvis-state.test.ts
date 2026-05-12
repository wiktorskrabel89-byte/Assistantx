/**
 * @jest-environment node
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { GET, PUT } from "@/app/api/workspaces/jarvis-state/route";

const mockCreateClient = createClient as jest.Mock;

function makeSupabase() {
  const jarvisMaybeSingle = jest.fn().mockResolvedValue({
    data: { preferences: {}, history: [], tasks: [], schedules: [], voice_settings: {}, sync_metadata: {}, updated_at: "2026-01-01T00:00:00.000Z" },
    error: null,
  });
  const workspaceMaybeSingle = jest.fn().mockResolvedValue({
    data: { state_json: null },
    error: null,
  });
  const upsert = jest.fn().mockResolvedValue({ error: null });

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === "jarvis_cloud_memory") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jarvisMaybeSingle,
            }),
          }),
          upsert,
        };
      }
      if (table === "workspace_states") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: workspaceMaybeSingle,
            }),
          }),
          upsert,
        };
      }
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        upsert,
      };
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("workspaces/jarvis-state bearer auth", () => {
  it("accepts bearer token on GET", async () => {
    const supabase = makeSupabase();
    mockCreateClient.mockResolvedValue(supabase);
    const req = new Request("http://localhost/api/workspaces/jarvis-state", {
      headers: { Authorization: "Bearer test-token" },
    });

    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(supabase.auth.getUser).toHaveBeenCalledWith("test-token");
  });

  it("accepts bearer token on PUT", async () => {
    const supabase = makeSupabase();
    mockCreateClient.mockResolvedValue(supabase);
    const req = new Request("http://localhost/api/workspaces/jarvis-state", {
      method: "PUT",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: { theme: "dark" },
        history: [{ id: "h1", user: "hi", ai: "hello", createdAt: "2026-01-01T00:00:00.000Z" }],
        tasks: [{ id: "task-1", title: "Task", updatedAt: "2026-01-01T00:00:00.000Z" }],
      }),
    });

    const res = await PUT(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(supabase.auth.getUser).toHaveBeenCalledWith("test-token");
  });
});

