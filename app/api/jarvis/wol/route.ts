import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/server";
import { sendWakeOnLanPacket } from "@/src/core/wake/magic-packet";

/** Wake-on-LAN ports that are standard and safe to accept from callers. */
const ALLOWED_WOL_PORTS = [7, 9];

function secretsMatch(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: Request): Promise<Response> {
  // Require authentication — this endpoint sends UDP packets into the server's
  // network and must not be callable by anonymous users.
  const authHeader = request.headers.get("authorization");
  const sharedSecret = request.headers.get("x-jarvis-wol-secret");
  const configuredSharedSecret = process.env.JARVIS_WOL_SHARED_SECRET;

  if (!authHeader?.startsWith("Bearer ")) {
    if (!secretsMatch(sharedSecret, configuredSharedSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser(token);
    if (authError || !data.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mac = typeof body.mac === "string" ? body.mac.trim() : "";
  if (!mac) {
    return Response.json(
      { error: "Missing required field: mac (e.g. AA:BB:CC:DD:EE:FF)" },
      { status: 400 },
    );
  }

  const broadcast =
    typeof body.broadcast === "string" ? body.broadcast.trim() : "255.255.255.255";
  const requestedPort = typeof body.port === "number" && body.port > 0 ? body.port : 9;

  // Only allow standard WoL ports (9 and 7) to prevent this endpoint being
  // abused as a general-purpose UDP packet sender into the server's network.
  if (!ALLOWED_WOL_PORTS.includes(requestedPort)) {
    return Response.json(
      { error: `Port must be one of: ${ALLOWED_WOL_PORTS.join(", ")}` },
      { status: 400 },
    );
  }
  const port = requestedPort;

  try {
    await sendWakeOnLanPacket({
      mac,
      host: broadcast,
      port,
      socketType: "udp4",
      enableBroadcast: true,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.toLowerCase().includes("invalid mac") ? 400 : 500;
    return Response.json(
      { error: status === 500 ? `Failed to send WoL packet: ${message}` : message },
      { status },
    );
  }

  return Response.json({
    ok: true,
    message: `Magic packet sent to ${mac} via ${broadcast}:${port}`,
  });
}
