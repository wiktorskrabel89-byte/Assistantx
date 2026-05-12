import {
  buildPairingError,
  getAuthenticatedUser,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";
import { getDeviceById, updateDeviceTrust } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to revoke pairing." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as { deviceId?: unknown; reason?: unknown };
    if (typeof payload.deviceId !== "string" || !payload.deviceId) {
      return Response.json({ code: "invalid_device", error: "deviceId is required." }, { status: 400 });
    }

    const device = await getDeviceById(payload.deviceId);
    if (!device || device.user_id !== user.id) {
      return Response.json({ code: "not_found", error: "Device not found." }, { status: 404 });
    }

    const reason = typeof payload.reason === "string" ? payload.reason : "revoked_by_user";
    await updateDeviceTrust({
      deviceId: payload.deviceId,
      trustState: "revoked",
      pairCode: null,
      pairCodeExpiresAt: null,
    });

    return Response.json({
      ok: true,
      deviceId: payload.deviceId,
      trustState: "revoked",
      reason,
      revokedAt: new Date().toISOString(),
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to revoke pairing v2.");
    return Response.json(payload, { status });
  }
}

