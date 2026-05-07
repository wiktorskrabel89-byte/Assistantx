import { renderHook, act, waitFor } from "@testing-library/react";
import { useNotifications } from "@/app/hooks/useNotifications";

// ── Supabase client mock ──────────────────────────────────────────────────────

type PostgresPayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type ChannelCallback = (payload: PostgresPayload) => void;

// Build a minimal Supabase channel stub
function makeChannelStub() {
  let callback: ChannelCallback | null = null;
  const stub = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    _emit: (payload: PostgresPayload) => {
      if (callback) callback(payload);
    },
  };
  // Capture the callback from the `.on(…, callback)` call
  stub.on.mockImplementation(
    (_event: string, _filter: unknown, cb: ChannelCallback) => {
      callback = cb;
      return stub;
    }
  );
  return stub;
}

const mockChannel = makeChannelStub();
const mockGetSession = jest.fn();
const mockFetch = jest.fn();

jest.mock("@/lib/client", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/client";

const mockCreateClient = createClient as jest.Mock;

function setupMockClient(options: {
  userId?: string | null;
  notifications?: Record<string, unknown>[];
  sessionError?: boolean;
  available?: boolean;
} = {}) {
  const userId = options.userId ?? "user-abc";
  const notifications = options.notifications ?? [];
  const sessionError = options.sessionError ?? false;
  const available = options.available ?? true;

  const session = sessionError
    ? { data: { session: null }, error: new Error("Session error") }
    : { data: { session: userId ? { user: { id: userId } } : null } };

  mockGetSession.mockResolvedValue(session);
  mockFetch.mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ notifications, available }),
  });

  const clientStub = {
    auth: {
      getSession: mockGetSession,
    },
    channel: jest.fn().mockReturnValue(mockChannel),
  };

  mockCreateClient.mockReturnValue(clientStub);
  return { clientStub };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as typeof fetch;
    // Reset channel stub state
    mockChannel.on.mockImplementation(
      (_event: string, _filter: unknown, cb: ChannelCallback) => {
        (mockChannel as { _registeredCallback?: ChannelCallback })._registeredCallback = cb;
        return mockChannel;
      }
    );
  });

  it("starts with an empty notifications list and unreadCount = 0", async () => {
    setupMockClient({ userId: null });
    const { result } = renderHook(() => useNotifications());
    // Let the hook's bootstrap settle
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not populate notifications when the user is not authenticated", async () => {
    setupMockClient({ userId: null });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    // Notifications remain empty since session.user is null
    expect(result.current.notifications).toEqual([]);
  });

  it("fetches and populates notifications when the user is authenticated", async () => {
    setupMockClient({
      userId: "user-abc",
      notifications: [
        { id: "n1", kind: "info", title: "Hello", body: "World", read: false, created_at: "2024-01-01" },
      ],
    });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    const n = result.current.notifications[0];
    expect(n.id).toBe("n1");
    expect(n.kind).toBe("info");
    expect(n.title).toBe("Hello");
    expect(n.body).toBe("World");
    expect(n.read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it("sets unreadCount to the number of unread notifications", async () => {
    setupMockClient({
      userId: "user-abc",
      notifications: [
        { id: "n1", kind: "info", title: "A", body: "B", read: false, created_at: "2024-01-01" },
        { id: "n2", kind: "success", title: "C", body: "D", read: true, created_at: "2024-01-02" },
        { id: "n3", kind: "warning", title: "E", body: "F", read: false, created_at: "2024-01-03" },
      ],
    });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(2));
  });

  it("markAllRead updates all notifications to read (optimistic update)", async () => {
    const userId = "user-abc";
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          notifications: [
            { id: "n1", kind: "info", title: "T", body: "B", read: false, created_at: "2024-01-01" },
          ],
          available: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true, available: true }),
      });

    mockCreateClient.mockReturnValue({
      auth: { getSession: mockGetSession },
      channel: jest.fn().mockReturnValue(mockChannel),
    });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.read)).toBe(true);
  });

  it("markAllRead is a no-op when there are no unread notifications", async () => {
    const userId = "user-abc";
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ notifications: [], available: true }),
    });
    mockCreateClient.mockReturnValue({
      auth: { getSession: mockGetSession },
      channel: jest.fn().mockReturnValue(mockChannel),
    });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes the realtime channel on unmount", async () => {
    setupMockClient({ userId: "user-abc" });
    const { unmount } = renderHook(() => useNotifications());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    unmount();
    expect(mockChannel.unsubscribe).toHaveBeenCalled();
  });

  it("gracefully handles session errors without throwing", async () => {
    setupMockClient({ sessionError: true });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    // Should remain in initial empty state
    expect(result.current.notifications).toEqual([]);
  });

  it("does not subscribe to realtime when notifications are unavailable", async () => {
    const { clientStub } = setupMockClient({ userId: "user-abc", available: false });
    renderHook(() => useNotifications());

    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    expect(clientStub.channel).not.toHaveBeenCalled();
  });
});
