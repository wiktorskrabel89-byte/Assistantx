import { getAuthenticatedUser, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { insertAuditLog, listDeviceWakeCandidates, updateDeviceWakeResult } from "@/src/core/persistence/runtime-db";
import { executeWakeChain, type WakeCandidate } from "@/src/core/wake/coordinator";
import { FEATURE_FLAGS } from "@/src/core/config/feature-flags";

export const runtime = "nodejs";
export const maxDuration = 30;

function pickBestWakeCandidate(candidates: Awaited<ReturnType<typeof listDeviceWakeCandidates>>) {
  return [...candidates].sort((a, b) => {
    if (a.eligible_for_wake !== b.eligible_for_wake) {
      return Number(b.eligible_for_wake) - Number(a.eligible_for_wake);
    }
    return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
  })[0] ?? null;
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
  if (device.trust_state !== "trusted") {
    return Response.json({ error: "Device is not trusted for wake operations." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason : "manual_wake";
  const candidates = await listDeviceWakeCandidates({ deviceId: id });
  const candidate = pickBestWakeCandidate(candidates);
  if (!candidate) {
    return Response.json({ error: "No wake candidate available. Submit network snapshot first." }, { status: 400 });
  }

  const execution = await executeWakeChain({
    candidate: {
      deviceId: id,
      macAddress: candidate.mac_address,
      ipv6: candidate.ipv6,
      udpPort: candidate.udp_port,
      provider: candidate.provider,
      eligibleForWake: candidate.eligible_for_wake,
      lastSeenAt: candidate.last_seen_at,
    } satisfies WakeCandidate,
    broadcastAddress: typeof body.broadcast === "string" ? body.broadcast : null,
  });

  try {
    await insertAuditLog({
      event_type: execution.ok ? "wake_completed" : "wake_failed",
      user_id: user.id,
      organization_id: device.organization_id ?? null,
      target_type: "device",
      target_id: id,
      payload: {
        reason,
        candidate,
        attempts: execution.attempts,
        selectedMethod: execution.method,
        requestedAt: new Date().toISOString(),
      },
    });
  } catch {
    // best-effort audit write
  }

  try {
    await updateDeviceWakeResult({
      deviceId: id,
      method: execution.method ?? null,
      success: execution.ok,
    });
  } catch {
    // best-effort device wake stats update
  }

  if (!execution.ok) {
    return Response.json({
      error: "Wake sequence failed for all methods.",
      attempts: execution.attempts,
    }, { status: 502 });
  }

  return Response.json({
    ok: true,
    method: execution.method,
    attempts: execution.attempts,
  });
}
