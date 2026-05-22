import { getAuthenticatedUser, normalizeCanonicalPresenceState, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { upsertDevicePresence, updateDevicePresenceTimestamp } from "@/src/core/persistence/runtime-db";
import { FEATURE_FLAGS } from "@/src/core/config/feature-flags";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const status = normalizeCanonicalPresenceState(body.status);
  if (!status) {
    return Response.json({ error: "Invalid status. Use canonical states ONLINE/BUSY/IDLE/SLEEPING/HIBERNATED/OFFLINE/BOOTING/UNREACHABLE." }, { status: 400 });
  }

  await upsertDevicePresence({
    device_id: id,
    user_id: user.id,
    organization_id: device.organization_id ?? null,
    status,
    active_apps: Array.isArray(body.activeApps) ? body.activeApps.filter((item): item is string => typeof item === "string").slice(0, 25) : [],
    cpu_percent: typeof body.cpuPercent === "number" ? body.cpuPercent : null,
    ram_percent: typeof body.ramPercent === "number" ? body.ramPercent : null,
    network_mode: body.networkMode === "mesh_direct" || body.networkMode === "relay" || body.networkMode === "lan" || body.networkMode === "unknown"
      ? body.networkMode
      : "unknown",
    is_online: status !== "offline" && status !== "unreachable" && status !== "hibernated",
    last_heartbeat_at: typeof body.lastHeartbeatAt === "string" ? body.lastHeartbeatAt : new Date().toISOString(),
  });

  await updateDevicePresenceTimestamp(id);
  return Response.json({ ok: true, deviceId: id, status });
}

