import dgram from "node:dgram";

export type WakeSocketType = "udp4" | "udp6";

export function parseMac(mac: string): Buffer {
  const hex = mac.replace(/[:\-]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
  const bytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function buildMagicPacket(mac: Buffer): Buffer {
  const packet = Buffer.alloc(102);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i += 1) {
    mac.copy(packet, 6 + i * 6);
  }
  return packet;
}

export async function sendMagicPacket(params: {
  packet: Buffer;
  host: string;
  port: number;
  socketType?: WakeSocketType;
  enableBroadcast?: boolean;
}): Promise<void> {
  const {
    packet,
    host,
    port,
    socketType = "udp4",
    enableBroadcast = false,
  } = params;

  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket({ type: socketType, reuseAddr: true });

    socket.once("error", (err) => {
      socket.close();
      reject(err);
    });

    socket.bind(() => {
      if (enableBroadcast && socketType === "udp4") {
        socket.setBroadcast(true);
      }
      socket.send(packet, 0, packet.length, port, host, (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

export async function sendWakeOnLanPacket(params: {
  mac: string;
  host: string;
  port?: number;
  socketType?: WakeSocketType;
  enableBroadcast?: boolean;
}): Promise<void> {
  const macBytes = parseMac(params.mac);
  const packet = buildMagicPacket(macBytes);
  await sendMagicPacket({
    packet,
    host: params.host,
    port: params.port ?? 9,
    socketType: params.socketType ?? "udp4",
    enableBroadcast: params.enableBroadcast ?? false,
  });
}

