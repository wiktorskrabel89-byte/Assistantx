import dgram from "node:dgram";

/** Parse a MAC address string into a 6-byte Buffer.
 *  Accepts formats: AA:BB:CC:DD:EE:FF  AA-BB-CC-DD-EE-FF  AABBCCDDEEFF
 */
function parseMac(mac: string): Buffer {
  const hex = mac.replace(/[:\-]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
  const bytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Build a Wake-on-LAN magic packet (102 bytes). */
function buildMagicPacket(mac: Buffer): Buffer {
  const packet = Buffer.alloc(102);
  // 6 bytes of 0xFF
  packet.fill(0xff, 0, 6);
  // 16 repetitions of the 6-byte MAC
  for (let i = 0; i < 16; i++) {
    mac.copy(packet, 6 + i * 6);
  }
  return packet;
}

/** Send the magic packet via UDP broadcast. */
function sendMagicPacket(
  packet: Buffer,
  broadcastAddr: string,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    socket.once("error", (err) => {
      socket.close();
      reject(err);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcastAddr, (err) => {
        socket.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

export async function POST(request: Request): Promise<Response> {
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
  const port = typeof body.port === "number" && body.port > 0 ? body.port : 9;

  let macBytes: Buffer;
  try {
    macBytes = parseMac(mac);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  const packet = buildMagicPacket(macBytes);

  try {
    await sendMagicPacket(packet, broadcast, port);
  } catch (err) {
    return Response.json(
      { error: `Failed to send WoL packet: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    message: `Magic packet sent to ${mac} via ${broadcast}:${port}`,
  });
}
