import { createClient } from "@/lib/server";
import { listDevicePresenceByDeviceIds, listDevicesForUser } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

function parseFreshnessMs() {
  const raw = Number.parseInt(String(process.env.JARVIS_DEVICE_FRESHNESS_MS || "45000"), 10);
  if (!Number.isFinite(raw) || raw < 5_000) return 45_000;
  return raw;
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listDevicesForUser({ userId: data.user.id });
  const freshnessMs = parseFreshnessMs();
  const presenceRows = await listDevicePresenceByDeviceIds(
    devices.map((device) => device.id).filter((id): id is string => Boolean(id)),
  );
  const presenceByDeviceId = new Map(presenceRows.map((row) => [row.device_id, row]));
  const profile = await supabase
    .from("user_profiles")
    .select("is_beta_tester")
    .eq("user_id", data.user.id)
    .maybeSingle();
  const now = Date.now();

  const mappedDevices = devices.map((device) => {
    const presence = device.id ? presenceByDeviceId.get(device.id) : null;
    const freshestTimestamp = presence?.last_heartbeat_at ?? device.last_seen_at ?? null;
    const freshnessAgeMs = freshestTimestamp ? Math.max(0, now - new Date(freshestTimestamp).getTime()) : null;
    const isFresh = freshnessAgeMs !== null && freshnessAgeMs <= freshnessMs;
    const rawStatus = presence?.status ?? "offline";
    const resolvedOnline = Boolean(
      isFresh
      && presence?.is_online
      && rawStatus !== "offline"
      && rawStatus !== "hibernated"
      && rawStatus !== "unreachable",
    );

    return {
      id: device.id,
      label: device.label ?? "Unnamed device",
      platform: device.platform,
      role: device.role,
      trustState: device.trust_state,
      usesVpn: Boolean(device.uses_vpn),
      wakeMethodLastSuccess: device.wake_method_last_success ?? null,
      wakeFailCount: device.wake_fail_count ?? 0,
      status: resolvedOnline ? rawStatus : "offline",
      rawStatus,
      isOnline: resolvedOnline,
      freshnessAgeMs,
      freshnessState: resolvedOnline ? "fresh" : freshestTimestamp ? "stale" : "offline",
      lastSeenAt: device.last_seen_at ?? null,
      lastHeartbeatAt: presence?.last_heartbeat_at ?? null,
      cpuPercent: presence?.cpu_percent ?? null,
      ramPercent: presence?.ram_percent ?? null,
      activeApps: presence?.active_apps ?? [],
    };
  });

  const primaryDevice = mappedDevices.find((device) => device.role === "runtime" && device.trustState === "trusted")
    ?? mappedDevices.find((device) => device.platform === "desktop" && device.trustState === "trusted")
    ?? mappedDevices[0]
    ?? null;

  return Response.json({
    devices: mappedDevices,
    primaryDeviceId: primaryDevice?.id ?? null,
    freshnessMs,
    isBetaTester: Boolean(profile.data?.is_beta_tester),
  });
}
