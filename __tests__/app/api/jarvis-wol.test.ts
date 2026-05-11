/**
 * @jest-environment node
 */

jest.mock("node:dgram", () => ({
  createSocket: jest.fn(() => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    return {
      once: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
      }),
      bind: jest.fn((handler: () => void) => handler()),
      setBroadcast: jest.fn(),
      send: jest.fn((_packet, _offset, _length, _port, _host, callback: (err?: Error | null) => void) => callback(null)),
      close: jest.fn(),
      __handlers: handlers,
    };
  }),
}));

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { POST } from "@/app/api/jarvis/wol/route";

const mockCreateClient = createClient as jest.Mock;

describe("POST /api/jarvis/wol", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.JARVIS_WOL_SHARED_SECRET;
  });

  it("accepts the configured shared secret without Supabase auth", async () => {
    process.env.JARVIS_WOL_SHARED_SECRET = "top-secret";

    const response = await POST(new Request("http://localhost/api/jarvis/wol", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jarvis-wol-secret": "top-secret",
      },
      body: JSON.stringify({ mac: "AA:BB:CC:DD:EE:FF" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
    }));
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("rejects requests without auth or a shared secret", async () => {
    const response = await POST(new Request("http://localhost/api/jarvis/wol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac: "AA:BB:CC:DD:EE:FF" }),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
