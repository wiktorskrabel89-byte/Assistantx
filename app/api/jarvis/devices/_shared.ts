import { createClient } from "@/lib/server";
import { getDeviceById, type DeviceRow } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function getAuthenticatedUser(request: Request) {
  const supabase = await createClient();
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { supabase, user: data.user };
    }
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { supabase, user: null };
  }
  return { supabase, user: data.user };
}

export async function resolveOwnedDevice(params: {
  userId: string;
  deviceId: string;
}): Promise<DeviceRow | null> {
  const device = await getDeviceById(params.deviceId);
  if (!device || device.user_id !== params.userId) return null;
  return device;
}

export function normalizeCanonicalPresenceState(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ONLINE") return "online";
  if (normalized === "BUSY") return "busy";
  if (normalized === "IDLE") return "idle";
  if (normalized === "SLEEPING") return "sleeping";
  if (normalized === "HIBERNATED") return "hibernated";
  if (normalized === "OFFLINE") return "offline";
  if (normalized === "BOOTING") return "booting";
  if (normalized === "UNREACHABLE") return "unreachable";
  return null;
}

