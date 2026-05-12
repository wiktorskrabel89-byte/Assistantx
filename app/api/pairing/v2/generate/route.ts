import {
  buildPairingError,
  getAuthenticatedUser,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";
import { upsertDevice } from "@/src/core/persistence/runtime-db";
import {
  createPairingV2Code,
  isPairingV2DevicePayload,
  normalizeFingerprint,
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
      return Response.json({ code: "unauthorized", error: "Sign in to generate a pairing code." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as {
      device?: unknown;
      expiresInSeconds?: unknown;
    };

    if (!isPairingV2DevicePayload(payload.device)) {
      return Response.json({ code: "invalid_device_payload", error: "Invalid device payload." }, { status: 400 });
    }

    const expiresInSeconds = typeof payload.expiresInSeconds === "number"
      ? Math.min(Math.max(Math.floor(payload.expiresInSeconds), 60), 1800)
      : 300;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const fingerprint = normalizeFingerprint(payload.device.fingerprint);
    const fingerprintHash = fingerprint ? sha256(fingerprint) : null;
    const pairCode = createPairingV2Code();

    const device = await upsertDevice({
      user_id: user.id,
      platform: payload.device.platform,
      role: payload.device.role,
      label: payload.device.label ?? null,
      fingerprint_hash: fingerprintHash,
      trust_state: "pending",
      pair_code: pairCode,
      pair_code_expires_at: expiresAt,
      metadata: payload.device.metadata ?? {},
      consent_profile: {},
    });

    return Response.json({
      pairCode,
      expiresAt,
      deviceId: device.id,
      trustState: device.trust_state,
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to generate a pairing v2 code.");
    return Response.json(payload, { status });
  }
}
