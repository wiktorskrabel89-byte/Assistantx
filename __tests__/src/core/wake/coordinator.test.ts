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
  const originalRouterUrl = process.env.JARVIS_ROUTER_API_URL;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.JARVIS_HOME_TAILSCALE_URL = originalTailscaleUrl;
    process.env.JARVIS_ROUTER_API_URL = originalRouterUrl;
    global.fetch = originalFetch;
  });

  it("uses tailscale_direct first and short-circuits on health success", async () => {
    process.env.JARVIS_HOME_TAILSCALE_URL = "ws://100.64.0.15:9000";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    const result = await executeWakeChain({
      preferTailscale: true,
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
    expect(result.mode).toBe("router");
    expect(result.attempts[0]?.method).toBe("tailscale_direct");
    expect(mockSendWakeOnLanPacket).not.toHaveBeenCalled();
  });

  it("falls back to wake methods when tailscale_direct fails", async () => {
    process.env.JARVIS_HOME_TAILSCALE_URL = "ws://100.64.0.15:9000";
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    mockSendWakeOnLanPacket.mockResolvedValue(undefined);

    const result = await executeWakeChain({
      preferTailscale: true,
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
    expect(result.mode).toBe("router");
    expect(result.attempts.map((attempt) => attempt.method)).toEqual(["tailscale_direct", "router_api", "lan_broadcast"]);
    expect(mockSendWakeOnLanPacket).toHaveBeenCalledTimes(1);
  });

  it("uses router_api before ipv6 wake methods", async () => {
    delete process.env.JARVIS_HOME_TAILSCALE_URL;
    process.env.JARVIS_ROUTER_API_URL = "https://router.example.test/wake";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    const result = await executeWakeChain({
      candidate: {
        deviceId: "dev-1",
        macAddress: "AA:BB:CC:DD:EE:FF",
        ipv6: "2001:db8::1",
        udpPort: 9,
        provider: "custom",
        eligibleForWake: true,
        lastSeenAt: new Date().toISOString(),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("router_api");
    expect(result.mode).toBe("router");
    expect(result.attempts.map((attempt) => attempt.method)).toEqual(["router_api"]);
  });

  it("returns rtc_wait mode when all network wake methods fail", async () => {
    delete process.env.JARVIS_HOME_TAILSCALE_URL;
    process.env.JARVIS_ROUTER_API_URL = "https://router.example.test/wake";
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    mockSendWakeOnLanPacket.mockRejectedValue(new Error("broadcast failed"));

    const result = await executeWakeChain({
      candidate: {
        deviceId: "dev-1",
        macAddress: "AA:BB:CC:DD:EE:FF",
        ipv6: null,
        udpPort: null,
        provider: "custom",
        eligibleForWake: true,
        lastSeenAt: new Date().toISOString(),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.method).toBeNull();
    expect(result.mode).toBe("rtc_wait");
    expect(result.nextAction).toBe("wait_for_bios_rtc");
    expect(result.attempts.at(-1)?.method).toBe("rtc_wait");
  });
});
