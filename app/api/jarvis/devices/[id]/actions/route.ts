import { getAuthenticatedUser, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { buildDeviceActionPrompt, normalizeDeviceActionPayload, type DeviceActionType } from "@/src/core/jarvis/device-actions";
import { insertAiTask, insertAuditLog, listDeviceWakeCandidates } from "@/src/core/persistence/runtime-db";
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
    return Response.json({ error: "Device is not trusted for device actions." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    actionType?: unknown;
    payload?: unknown;
    wakeBeforeAction?: unknown;
    reason?: unknown;
  };

  if (body.actionType !== "launch_roblox") {
    return Response.json({ error: "Unsupported action type." }, { status: 400 });
  }

  const actionType: DeviceActionType = body.actionType;
  const payload = normalizeDeviceActionPayload(actionType, body.payload);
  const wakeBeforeAction = Boolean(body.wakeBeforeAction ?? true);
  const reason = typeof body.reason === "string" ? body.reason : actionType;

  let wake = null as null | Awaited<ReturnType<typeof executeWakeChain>>;
  if (wakeBeforeAction && FEATURE_FLAGS.wakeV2Enabled) {
    const candidates = await listDeviceWakeCandidates({ deviceId: id });
    const candidate = pickBestWakeCandidate(candidates);
    if (candidate) {
      wake = await executeWakeChain({
        candidate: {
          deviceId: id,
          macAddress: candidate.mac_address,
          ipv6: candidate.ipv6,
          udpPort: candidate.udp_port,
          provider: candidate.provider,
          eligibleForWake: candidate.eligible_for_wake,
          lastSeenAt: candidate.last_seen_at,
        } satisfies WakeCandidate,
      });
    }
  }

  const task = await insertAiTask({
    user_id: user.id,
    device_id: id,
    prompt: buildDeviceActionPrompt(actionType, payload),
    status: "pending",
    routing: "local",
    category: "system_action",
    action_type: actionType,
    payload,
  });

  try {
    await insertAuditLog({
      event_type: "device_action_queued",
      user_id: user.id,
      organization_id: device.organization_id ?? null,
      target_type: "device",
      target_id: id,
      payload: {
        actionType,
        payload,
        taskId: task.task_id,
        wakeRequested: wakeBeforeAction,
        wakeResult: wake,
        reason,
      },
    });
  } catch {
    // best-effort audit write
  }

  return Response.json({
    ok: true,
    taskId: task.task_id,
    actionType,
    payload,
    wake,
  });
}
