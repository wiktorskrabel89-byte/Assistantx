/**
 * @jest-environment node
 */

jest.mock("@/src/core/config/feature-flags", () => ({
  FEATURE_FLAGS: {
    wakeV2Enabled: true,
    hibernateInterceptEnabled: false,
    p2pTunnelEnabled: false,
  },
}));

jest.mock("@/app/api/jarvis/devices/_shared", () => ({
  getAuthenticatedUser: jest.fn(),
  resolveOwnedDevice: jest.fn(),
  resolveAgentUrl: jest.fn(),
}));

jest.mock("@/src/core/persistence/runtime-db", () => ({
  listDeviceWakeCandidates: jest.fn(),
  insertAuditLog: jest.fn(),
  updateDeviceWakeResult: jest.fn(),
}));

jest.mock("@/src/core/wake/coordinator", () => ({
  executeWakeChain: jest.fn(),
}));

import { POST } from "@/app/api/jarvis/devices/[id]/wake/route";
import { getAuthenticatedUser, resolveAgentUrl, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { executeWakeChain } from "@/src/core/wake/coordinator";
import { listDeviceWakeCandidates } from "@/src/core/persistence/runtime-db";

const mockGetAuthenticatedUser = getAuthenticatedUser as jest.Mock;
const mockResolveAgentUrl = resolveAgentUrl as jest.Mock;
const mockResolveOwnedDevice = resolveOwnedDevice as jest.Mock;
const mockListDeviceWakeCandidates = listDeviceWakeCandidates as jest.Mock;
const mockExecuteWakeChain = executeWakeChain as jest.Mock;

describe("POST /api/jarvis/devices/:id/wake", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: "user-1" },
    });
    mockResolveOwnedDevice.mockResolvedValue({
      id: "device-1",
      user_id: "user-1",
      organization_id: null,
      trust_state: "trusted",
    });
    mockResolveAgentUrl.mockReturnValue(null);
    mockListDeviceWakeCandidates.mockResolvedValue([{
      device_id: "device-1",
      provider: "relay",
      mac_address: "AA:BB:CC:DD:EE:FF",
      ipv6: "2001:db8::1",
      udp_port: 9999,
      eligible_for_wake: true,
      last_seen_at: "2026-05-20T00:00:00.000Z",
    }]);
  });

  it("returns wake success with selected method", async () => {
    mockExecuteWakeChain.mockResolvedValue({
      ok: true,
      method: "ipv6_magic_packet",
      attempts: [{ method: "ipv6_magic_packet", ok: true, details: "ok", latencyMs: 12 }],
    });

    const response = await POST(
      new Request("http://localhost/api/jarvis/devices/device-1/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "manual_wake" }),
      }),
      { params: Promise.resolve({ id: "device-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
      method: "ipv6_magic_packet",
    }));
  });

  it("returns 502 when all wake methods fail", async () => {
    mockExecuteWakeChain.mockResolvedValue({
      ok: false,
      method: null,
      attempts: [{ method: "lan_broadcast", ok: false, details: "failed", latencyMs: 20 }],
    });

    const response = await POST(
      new Request("http://localhost/api/jarvis/devices/device-1/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "device-1" }) },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: "Wake sequence failed for all methods.",
    }));
  });
});
