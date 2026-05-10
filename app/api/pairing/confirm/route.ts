import { isValidPairingCode, normalizePairingCode } from "@/lib/device-pairing";
import {
  buildPairingError,
  expirePendingPairs,
  expireStalePendingPairs,
  getAuthenticatedUser,
  getPairByCode,
  hasPairingConfig,
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
      return Response.json({ code: "unauthorized", error: "Sign in to confirm device pairing." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as { code?: unknown };
    const normalizedCode = typeof payload.code === "string" ? normalizePairingCode(payload.code) : "";
    if (!isValidPairingCode(normalizedCode)) {
      return Response.json({ code: "invalid_code", error: "Enter a valid 6-character pairing code." }, { status: 400 });
    }

    await expireStalePendingPairs(supabase, user.id);

    const existingPair = await getPairByCode(supabase, user.id, normalizedCode);
    if (!existingPair) {
      return Response.json({ code: "invalid_code", error: "That pairing code is invalid." }, { status: 400 });
    }

    if (existingPair.status === "expired" || new Date(existingPair.expires_at).getTime() <= Date.now()) {
      return Response.json({ code: "expired", error: "That pairing code has expired." }, { status: 400 });
    }

    if (existingPair.status === "paired") {
      return Response.json({ ok: true, pairedAt: existingPair.paired_at });
    }

    const { data, error } = await supabase.rpc("confirm_device_pairing", { p_code: normalizedCode });
    if (error) throw error;
    if (!data) {
      return Response.json({ code: "invalid_code", error: "That pairing code is invalid." }, { status: 400 });
    }

    await expirePendingPairs(supabase, user.id, normalizedCode);

    const confirmedPair = await getPairByCode(supabase, user.id, normalizedCode);
    return Response.json({ ok: true, pairedAt: confirmedPair?.paired_at ?? null });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to confirm device pairing.");
    return Response.json(payload, { status });
  }
}
