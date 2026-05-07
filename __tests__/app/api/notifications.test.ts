/**
 * @jest-environment node
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { GET, POST } from "@/app/api/notifications/route";

const mockCreateClient = createClient as jest.Mock;

function makeSupabase({
  user = { id: "user-1" } as object | null,
  userError = null as Error | null,
  notifications = [] as unknown[],
  selectError = null as Error | null,
  updateError = null as Error | null,
} = {}) {
  const limitMock = jest.fn().mockResolvedValue({ data: notifications, error: selectError });
  const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
  const selectEqMock = jest.fn().mockReturnValue({ order: orderMock });
  const updateEqMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: updateError }) });

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: userError,
      }),
    },
    from: jest.fn().mockImplementation((table: string) => ({
      select: jest.fn().mockReturnValue({ eq: selectEqMock }),
      update: jest.fn().mockReturnValue({ eq: updateEqMock }),
      table,
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/notifications", () => {
  it("returns notifications for an authenticated user", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({
      notifications: [{ id: "n1", title: "Hi", body: "", kind: "info", read: false, created_at: "2024-01-01" }],
    }));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { notifications: unknown[]; available: boolean };
    expect(body.available).toBe(true);
    expect(body.notifications).toHaveLength(1);
  });

  it("returns an unavailable response when the notifications table is missing", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({
      selectError: Object.assign(new Error("notifications does not exist"), { code: "42P01" }),
    }));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { available: boolean; notifications: unknown[]; code: string };
    expect(body.available).toBe(false);
    expect(body.notifications).toEqual([]);
    expect(body.code).toBe("notifications_not_configured");
  });
});

describe("POST /api/notifications", () => {
  it("marks all notifications as read", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());

    const req = new Request("http://localhost/api/notifications", {
      method: "POST",
      body: JSON.stringify({ action: "markAllRead" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; available: boolean };
    expect(body.ok).toBe(true);
    expect(body.available).toBe(true);
  });

  it("returns 400 for unsupported actions", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase());

    const req = new Request("http://localhost/api/notifications", {
      method: "POST",
      body: JSON.stringify({ action: "noop" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns ok when notifications are unavailable", async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({
      updateError: Object.assign(new Error("permission denied"), { code: "42501" }),
    }));

    const req = new Request("http://localhost/api/notifications", {
      method: "POST",
      body: JSON.stringify({ action: "markAllRead" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; available: boolean };
    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
  });
});
