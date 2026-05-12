import { randomBytes } from "node:crypto";
import {
  buildPairingError,
  getAuthenticatedUser,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";
import { getDeviceById, updateDeviceTrust } from "@/src/core/persistence/runtime-db";
import { sha256 } from "@/app/api/pairing/v2/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to rotate trust keys." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as { deviceId?: unknown };
    if (typeof payload.deviceId !== "string" || !payload.deviceId) {
      return Response.json({ code: "invalid_device", error: "deviceId is required." }, { status: 400 });
    }

    const device = await getDeviceById(payload.deviceId);
    if (!device || device.user_id !== user.id) {
      return Response.json({ code: "not_found", error: "Device not found." }, { status: 404 });
    }

    const trustKey = `tk_${randomBytes(24).toString("hex")}`;
    await updateDeviceTrust({
      deviceId: payload.deviceId,
      trustState: "trusted",
      trustKeyHash: sha256(trustKey),
    });

    return Response.json({
      ok: true,
      deviceId: payload.deviceId,
      trustKey,
      rotatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to rotate trust key.");
    return Response.json(payload, { status });
  }
}

