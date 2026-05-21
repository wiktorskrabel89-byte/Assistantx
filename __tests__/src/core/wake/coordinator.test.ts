/**
 * @jest-environment node
 */

jest.mock("@/src/core/wake/magic-packet", () => ({
  sendWakeOnLanPacket: jest.fn(),
}));

import { executeWakeChain } from "@/src/core/wake/coordinator";
import { sendWakeOnLanPacket } from "@/src/core/wake/magic-packet";

const mockSendWakeOnLanPacket = sendWakeOnLanPacket as jest.Mock;

describe("wake coordinator method chain", () => {
  const originalFetch = global.fetch;
  const originalWakeBaseUrl = process.env.JARVIS_WAKE_VPS_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JARVIS_WAKE_VPS_BASE_URL = "https://wake.example.com";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.JARVIS_WAKE_VPS_BASE_URL = originalWakeBaseUrl;
  });

  it("uses udp_path_probe first and short-circuits on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "ok" }),
    }) as unknown as typeof fetch;

    const result = await executeWakeChain({
      candidate: {
        deviceId: "dev-1",
        macAddress: "AA:BB:CC:DD:EE:FF",
        ipv6: "2001:db8::1",
        udpPort: 9,
        provider: "relay",
        eligibleForWake: true,
        lastSeenAt: new Date().toISOString(),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("udp_path_probe");
    expect(result.attempts.map((attempt) => attempt.method)).toEqual(["udp_path_probe"]);
    expect(mockSendWakeOnLanPacket).not.toHaveBeenCalled();
  });

  it("falls back from udp_path_probe to ipv6_magic_packet and then lan_broadcast", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "udp failed" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "ipv6 failed" }),
      }) as unknown as typeof fetch;
    mockSendWakeOnLanPacket.mockResolvedValue(undefined);

    const result = await executeWakeChain({
      candidate: {
        deviceId: "dev-1",
        macAddress: "AA:BB:CC:DD:EE:FF",
        ipv6: "2001:db8::1",
        udpPort: 9,
        provider: "relay",
        eligibleForWake: true,
        lastSeenAt: new Date().toISOString(),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("lan_broadcast");
    expect(result.attempts.map((attempt) => attempt.method)).toEqual([
      "udp_path_probe",
      "ipv6_magic_packet",
      "lan_broadcast",
    ]);
    expect(mockSendWakeOnLanPacket).toHaveBeenCalledTimes(1);
  });
});
