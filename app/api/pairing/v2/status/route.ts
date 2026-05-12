import {
  buildPairingError,
  getAuthenticatedUser,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";
import { listDevicesForUser } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to view pairing status." }, { status: 401 });
    }

    const devices = await listDevicesForUser({ userId: user.id });
    return Response.json({
      devices: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        role: d.role,
        label: d.label ?? null,
        trustState: d.trust_state,
        lastSeenAt: d.last_seen_at ?? null,
      })),
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to fetch pairing v2 status.");
    return Response.json(payload, { status });
  }
}

