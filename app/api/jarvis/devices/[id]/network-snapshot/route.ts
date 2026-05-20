import { getAuthenticatedUser, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { upsertNetworkPeer, updateDeviceNetworkSnapshot } from "@/src/core/persistence/runtime-db";
import { FEATURE_FLAGS } from "@/src/core/config/feature-flags";

export const runtime = "nodejs";
export const maxDuration = 30;

function normalizePort(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const port = Math.floor(value);
  if (port < 1 || port > 65535) return null;
  return port;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!FEATURE_FLAGS.wakeV2Enabled) {
    return Response.json({ error: "Cloud Wake v1 is disabled." }, { status: 403 });
  }

  const { id } = await params;
  const { user } = await getAuthenticatedUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const device = await resolveOwnedDevice({ userId: user.id, deviceId: id });
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const provider = body.provider === "tailscale" || body.provider === "relay" || body.provider === "lan" || body.provider === "custom"
    ? body.provider
    : "custom";
  const udpPort = normalizePort(body.udpPort);
  const ipv6 = typeof body.ipv6 === "string" ? body.ipv6 : null;
  const mac = typeof body.macAddress === "string" ? body.macAddress : null;

  await updateDeviceNetworkSnapshot({
    deviceId: id,
    ipv6,
    mac,
    udpPort,
    networkEpoch: typeof body.networkEpoch === "number" ? body.networkEpoch : null,
  });

  await upsertNetworkPeer({
    device_id: id,
    user_id: user.id,
    organization_id: device.organization_id ?? null,
    provider,
    mesh_ip: typeof body.meshIp === "string" ? body.meshIp : null,
    hostname: typeof body.hostname === "string" ? body.hostname : null,
    mac_address: mac,
    direct_connected: Boolean(body.directConnected),
    relay_connected: Boolean(body.relayConnected),
    eligible_for_wake: Boolean(body.eligibleForWake ?? true),
    metadata: {
      ipv6,
      udpPort,
      networkEpoch: typeof body.networkEpoch === "number" ? body.networkEpoch : null,
      gateway: typeof body.gateway === "string" ? body.gateway : null,
      lastSeenAt: new Date().toISOString(),
    },
  });

  return Response.json({
    ok: true,
    deviceId: id,
    provider,
    hasIpv6: Boolean(ipv6),
    hasMac: Boolean(mac),
    udpPort,
  });
}

