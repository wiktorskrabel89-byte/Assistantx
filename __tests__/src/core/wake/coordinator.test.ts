/**
 * @jest-environment node
 */

jest.mock("@/src/core/wake/magic-packet", () => ({
  sendWakeOnLanPacket: jest.fn(),
}));

import { executeWakeChain } from "@/src/core/wake/coordinator";
import { sendWakeOnLanPacket } from "@/src/core/wake/magic-packet";

const mockSendWakeOnLanPacket = sendWakeOnLanPacket as jest.Mock;

describe("wake coordinator tailscale path", () => {
  const originalFetch = global.fetch;
  const originalTailscaleUrl = process.env.JARVIS_HOME_TAILSCALE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.JARVIS_HOME_TAILSCALE_URL = originalTailscaleUrl;
    global.fetch = originalFetch;
  });

  it("uses tailscale_direct first and short-circuits on health success", async () => {
    process.env.JARVIS_HOME_TAILSCALE_URL = "ws://100.64.0.15:9000";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    const result = await executeWakeChain({
      candidate: {
        deviceId: "dev-1",
        macAddress: "AA:BB:CC:DD:EE:FF",
        ipv6: "2001:db8::1",
        udpPort: 9,
        provider: "tailscale",
        eligibleForWake: true,
        lastSeenAt: new Date().toISOString(),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("tailscale_direct");
    expect(result.attempts[0]?.method).toBe("tailscale_direct");
    expect(mockSendWakeOnLanPacket).not.toHaveBeenCalled();
  });

  it("falls back to wake methods when tailscale_direct fails", async () => {
    process.env.JARVIS_HOME_TAILSCALE_URL = "ws://100.64.0.15:9000";
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    mockSendWakeOnLanPacket.mockResolvedValue(undefined);

    const result = await executeWakeChain({
      candidate: {
        deviceId: "dev-1",
        macAddress: "AA:BB:CC:DD:EE:FF",
        ipv6: null,
        udpPort: null,
        provider: "relay",
        eligibleForWake: true,
        lastSeenAt: new Date().toISOString(),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("lan_broadcast");
    expect(result.attempts.map((attempt) => attempt.method)).toEqual(["tailscale_direct", "lan_broadcast"]);
    expect(mockSendWakeOnLanPacket).toHaveBeenCalledTimes(1);
  });
});

