import { getAuthenticatedUser, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { listDeviceWakeCandidates } from "@/src/core/persistence/runtime-db";
import { FEATURE_FLAGS } from "@/src/core/config/feature-flags";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
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

  const candidates = await listDeviceWakeCandidates({ deviceId: id });
  return Response.json({
    deviceId: id,
    trustState: device.trust_state,
    wakeMethodLastSuccess: device.wake_method_last_success ?? null,
    wakeFailCount: device.wake_fail_count ?? 0,
    candidates,
  });
}

