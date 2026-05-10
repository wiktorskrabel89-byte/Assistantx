import {
  buildPairingError,
  getAuthenticatedUser,
  getPairingStatus,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";

export const maxDuration = 30;

export async function GET() {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to view device pairing status." }, { status: 401 });
    }

    const status = await getPairingStatus(supabase, user.id);
    return Response.json(status);
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to load device pairing status.");
    return Response.json(payload, { status });
  }
}
