import { POST as wakeDeviceRoute } from "@/app/api/jarvis/devices/[id]/wake/route";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId) {
    return Response.json({ error: "deviceId is required." }, { status: 400 });
  }

  const proxyBody = { ...body };
  delete proxyBody.deviceId;
  const proxyRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(proxyBody),
  });
  return wakeDeviceRoute(proxyRequest, { params: Promise.resolve({ id: deviceId }) });
}

