import { getAuthenticatedUser } from "@/app/api/jarvis/devices/_shared";
import { listDeviceWakeCandidates, listDevicesForUser } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

function isDeviceOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= 90_000;
}

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listDevicesForUser({
    userId: user.id,
    role: "runtime",
    platform: "desktop",
  });

  const items = await Promise.all(devices.map(async (device) => {
    const deviceId = String(device.id);
    const candidates = await listDeviceWakeCandidates({ deviceId });
    const metadata = device.metadata && typeof device.metadata === "object"
      ? device.metadata as Record<string, unknown>
      : {};
    return {
      id: deviceId,
      label: device.label ?? "Jarvis Desktop",
      trustState: device.trust_state,
      setupState: device.setup_state ?? "pending",
      lastSeenAt: device.last_seen_at ?? null,
      online: isDeviceOnline(device.last_seen_at),
      hardwareId: device.hardware_id ?? null,
      biosManufacturer: device.bios_manufacturer ?? null,
      biosModel: device.bios_model ?? null,
      wakeMethodLastSuccess: device.wake_method_last_success ?? null,
      wakeFailCount: device.wake_fail_count ?? 0,
      lastKnownIpv6: device.last_known_ipv6 ?? null,
      lastKnownMac: device.last_known_mac ?? null,
      lastLocalBroadcast: device.last_local_broadcast ?? null,
      lastPublicIpv6DiscoveredAt: device.last_public_ipv6_discovered_at ?? null,
      eligibleForWake: candidates.some((candidate) => candidate.eligible_for_wake),
      wakeCandidates: candidates.length,
      metadata: {
        setupHint: typeof metadata.setupHint === "string" ? metadata.setupHint : null,
        setupSource: typeof metadata.setupSource === "string" ? metadata.setupSource : null,
        publicIpv6: typeof metadata.publicIpv6 === "string" ? metadata.publicIpv6 : null,
      },
    };
  }));

  return Response.json({ devices: items });
}
