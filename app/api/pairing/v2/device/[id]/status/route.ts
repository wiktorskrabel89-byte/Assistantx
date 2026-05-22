import {
  buildPairingError,
  getAuthenticatedUser,
  hasPairingConfig,
  pairingNotConfiguredResponse,
} from "@/app/api/pairing/utils";
import { getDeviceById } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasPairingConfig()) {
    return pairingNotConfiguredResponse();
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to view pairing device status." }, { status: 401 });
    }

    const { id } = await params;
    const device = await getDeviceById(id);
    if (!device || device.user_id !== user.id) {
      return Response.json({ code: "not_found", error: "Device not found." }, { status: 404 });
    }

    const metadata = device.metadata && typeof device.metadata === "object"
      ? device.metadata as Record<string, unknown>
      : {};

    return Response.json({
      id: String(device.id),
      label: device.label ?? null,
      trustState: device.trust_state,
      pairCode: device.pair_code ?? null,
      pairCodeExpiresAt: device.pair_code_expires_at ?? null,
      paired: device.trust_state === "trusted",
      setupState: device.setup_state ?? "pending",
      lastSeenAt: device.last_seen_at ?? null,
      hardwareId: device.hardware_id ?? null,
      biosManufacturer: device.bios_manufacturer ?? null,
      biosModel: device.bios_model ?? null,
      metadata: {
        setupHint: typeof metadata.setupHint === "string" ? metadata.setupHint : null,
        publicIpv6: typeof metadata.publicIpv6 === "string" ? metadata.publicIpv6 : null,
      },
    });
  } catch (error) {
    const { status, payload } = buildPairingError(error, "Failed to fetch pairing device status.");
    return Response.json(payload, { status });
  }
}
