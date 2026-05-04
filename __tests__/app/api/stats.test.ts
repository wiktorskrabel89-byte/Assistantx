/**
 * @jest-environment node
 *
 * Tests for GET /api/stats
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { createClient } from "@/lib/server";
import { GET } from "@/app/api/stats/route";

const mockCreateClient = createClient as jest.Mock;

function makeReq(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers["authorization"] = authHeader;
  return new NextRequest("http://localhost/api/stats", { headers });
}

function makeFullSupabase({
  user = { id: "user-1" } as object | null,
  statsData = { total_messages: 0, total_tokens: 0 } as object | null,
  statsError = null as Error | null,
  conversationCount = 5,
  stateJson = { userPlan: "free", premiumRequestsUsed: 0 } as Record<string, unknown> | null,
} = {}) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: statsData, error: statsError }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          // conversations query (count: exact, head: true)
          count: conversationCount,
          // workspace_states query (single)
          single: jest.fn().mockResolvedValue({
            data: stateJson ? { state_json: stateJson } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/stats", () => {
  it("returns zeroed stats when no auth token is supplied", async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      totalMessages: number;
      totalTokens: number;
      totalConversations: number;
      topModels: unknown[];
      userPlan: string;
      premiumRequestsUsed: number;
    };
    expect(body.totalMessages).toBe(0);
    expect(body.totalTokens).toBe(0);
    expect(body.totalConversations).toBe(0);
    expect(body.topModels).toEqual([]);
    expect(body.userPlan).toBe("free");
    expect(body.premiumRequestsUsed).toBe(0);
  });

  it("returns zeroed stats when auth token is provided but user is not found", async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    const res = await GET(makeReq("Bearer bad-token"));
    expect(res.status).toBe(200);
    const body = await res.json() as { totalMessages: number };
    expect(body.totalMessages).toBe(0);
  });

  it("returns real stats for an authenticated user", async () => {
    const supabase = makeFullSupabase({
      user: { id: "user-1" },
      statsData: { total_messages: 42, total_tokens: 1234 },
      conversationCount: 7,
      stateJson: { userPlan: "pro", premiumRequestsUsed: 3 },
    });

    // The route calls supabase.auth.getUser(token) when a Bearer token is provided
    mockCreateClient.mockResolvedValue(supabase);

    // Mock Promise.all: rpc + from().select().eq() x2
    // We need both .count and .single() to resolve
    const eqMock = jest.fn();
    eqMock.mockReturnValueOnce({ count: 7 }); // conversations count
    eqMock.mockReturnValueOnce({
      single: jest.fn().mockResolvedValue({
        data: { state_json: { userPlan: "pro", premiumRequestsUsed: 3 } },
        error: null,
      }),
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: eqMock }),
    });

    supabase.rpc.mockResolvedValue({ data: { total_messages: 42, total_tokens: 1234 }, error: null });

    const res = await GET(makeReq("Bearer valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      totalMessages: number;
      totalTokens: number;
      userPlan: string;
      premiumRequestsUsed: number;
    };
    expect(body.totalMessages).toBe(42);
    expect(body.totalTokens).toBe(1234);
    expect(body.userPlan).toBe("pro");
    expect(body.premiumRequestsUsed).toBe(3);
  });

  it("defaults userPlan to 'free' when workspace state is null", async () => {
    const eqMock = jest.fn();
    eqMock.mockReturnValueOnce({ count: 0 });
    eqMock.mockReturnValueOnce({
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: eqMock }) }),
    });

    const res = await GET(makeReq("Bearer valid-token"));
    const body = await res.json() as { userPlan: string };
    expect(body.userPlan).toBe("free");
  });

  it("defaults premiumRequestsUsed to 0 when it is not a number in state", async () => {
    const eqMock = jest.fn();
    eqMock.mockReturnValueOnce({ count: 0 });
    eqMock.mockReturnValueOnce({
      single: jest.fn().mockResolvedValue({
        data: { state_json: { userPlan: "pro", premiumRequestsUsed: "not-a-number" } },
        error: null,
      }),
    });
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      rpc: jest.fn().mockResolvedValue({ data: { total_messages: 0, total_tokens: 0 }, error: null }),
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: eqMock }) }),
    });

    const res = await GET(makeReq("Bearer valid-token"));
    const body = await res.json() as { premiumRequestsUsed: number };
    expect(body.premiumRequestsUsed).toBe(0);
  });

  it("returns topModels as empty array", async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    const res = await GET(makeReq());
    const body = await res.json() as { topModels: unknown[] };
    expect(Array.isArray(body.topModels)).toBe(true);
    expect(body.topModels).toHaveLength(0);
  });
});
