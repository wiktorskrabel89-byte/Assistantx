import {
  buildPairingError,
  getAuthenticatedUser,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";
import {
  getDeviceByPairCode,
  updateDeviceTrust,
  upsertDevice,
} from "@/src/core/persistence/runtime-db";
import {
  isPairingV2DevicePayload,
  isValidPairingV2Code,
  normalizeFingerprint,
  normalizePairingV2Code,
  sha256,
} from "@/app/api/pairing/v2/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to confirm pairing." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as {
      code?: unknown;
      device?: unknown;
    };
    if (typeof payload.code !== "string" || !isValidPairingV2Code(payload.code)) {
      return Response.json({ code: "invalid_code", error: "Invalid pairing code." }, { status: 400 });
    }
    if (!isPairingV2DevicePayload(payload.device)) {
      return Response.json({ code: "invalid_device_payload", error: "Invalid device payload." }, { status: 400 });
    }

    const pairCode = normalizePairingV2Code(payload.code);
    const pendingTarget = await getDeviceByPairCode({ userId: user.id, pairCode });
    if (!pendingTarget) {
      return Response.json({ code: "invalid_code", error: "Pairing code not found." }, { status: 404 });
    }
    if (pendingTarget.pair_code_expires_at && new Date(pendingTarget.pair_code_expires_at).getTime() <= Date.now()) {
      return Response.json({ code: "expired", error: "Pairing code expired." }, { status: 400 });
    }

    const fingerprint = normalizeFingerprint(payload.device.fingerprint);
    const fingerprintHash = fingerprint ? sha256(fingerprint) : null;
    if (fingerprintHash && pendingTarget.fingerprint_hash && fingerprintHash === pendingTarget.fingerprint_hash) {
      return Response.json({ code: "same_device", error: "Cannot pair a device with itself." }, { status: 400 });
    }

    const confirmingDevice = await upsertDevice({
      user_id: user.id,
      platform: payload.device.platform,
      role: payload.device.role,
      label: payload.device.label ?? null,
      fingerprint_hash: fingerprintHash,
      trust_state: "trusted",
      pair_code: null,
      pair_code_expires_at: null,
      metadata: payload.device.metadata ?? {},
      consent_profile: {},
      last_seen_at: new Date().toISOString(),
    });

    await updateDeviceTrust({
      deviceId: String(pendingTarget.id),
      trustState: "trusted",
      pairCode: null,
      pairCodeExpiresAt: null,
    });

    return Response.json({
      ok: true,
      trustedDevices: {
        runtimeDeviceId: pendingTarget.id,
        controllerDeviceId: confirmingDevice.id,
      },
      trustState: "trusted",
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to confirm pairing v2.");
    return Response.json(payload, { status });
  }
}

