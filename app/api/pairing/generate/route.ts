import { normalizePairingCode } from "@/lib/device-pairing";
import {
  buildPairingError,
  createPairingCode,
  expirePendingPairs,
  getAuthenticatedUser,
  hasPairingConfig,
  isValidInitiatorDevice,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to generate a pairing code." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as { initiatorDevice?: unknown };
    if (!isValidInitiatorDevice(payload.initiatorDevice)) {
      return Response.json({ code: "invalid_initiator_device", error: "Invalid initiator device." }, { status: 400 });
    }

    await expirePendingPairs(supabase, user.id);

    const pairingCode = normalizePairingCode(createPairingCode());
    const { data, error } = await supabase
      .from("device_pairs")
      .insert({
        user_id: user.id,
        pairing_code: pairingCode,
        initiator_device: payload.initiatorDevice,
        status: "pending",
      })
      .select("pairing_code, expires_at")
      .single<{ pairing_code: string; expires_at: string }>();

    if (error) throw error;

    return Response.json({
      code: data.pairing_code,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to generate a pairing code.");
    return Response.json(payload, { status });
  }
}
