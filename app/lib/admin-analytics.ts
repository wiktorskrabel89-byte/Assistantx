import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export type EventTotals = {
  total: number;
  last24h: number;
  last7d: number;
  last30d: number;
  uniqueEvents: number;
};

export type TopEvent = { event_name: string; count: number };

export type RecentEvent = {
  id: number;
  at: string;
  event_name: string;
  user_id: string | null;
  source: string | null;
  properties: Record<string, unknown>;
};

async function countFrom(fromIso: string | null): Promise<number> {
  const supabase = getServiceRoleClient();
  if (!supabase) return 0;
  let q = supabase.from("analytics_events").select("*", { count: "exact", head: true });
  if (fromIso) q = q.gte("at", fromIso);
  const { count } = await q;
  return count ?? 0;
}

export async function getEventTotals(): Promise<EventTotals> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { total: 0, last24h: 0, last7d: 0, last30d: 0, uniqueEvents: 0 };
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const [total, last24h, last7d, last30d, distinctRes] = await Promise.all([
    countFrom(null),
    countFrom(new Date(now - day).toISOString()),
    countFrom(new Date(now - 7 * day).toISOString()),
    countFrom(new Date(now - 30 * day).toISOString()),
    supabase.from("analytics_events").select("event_name").limit(5000),
  ]);
  const distinct = new Set<string>();
  for (const row of (distinctRes.data ?? []) as { event_name: string }[]) {
    distinct.add(row.event_name);
  }
  return { total, last24h, last7d, last30d, uniqueEvents: distinct.size };
}

export async function getTopEvents(days = 30, limit = 8): Promise<TopEvent[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("analytics_events")
    .select("event_name")
    .gte("at", from)
    .limit(50_000);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { event_name: string }[]) {
    counts.set(row.event_name, (counts.get(row.event_name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([event_name, count]) => ({ event_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getRecentEvents(limit = 20): Promise<RecentEvent[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("analytics_events")
    .select("id, at, event_name, user_id, source, properties")
    .order("at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentEvent[];
}

export type DailyEventPoint = { date: string; count: number };

export async function getDailyEvents(days = 30, eventName?: string | null): Promise<DailyEventPoint[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return emptyDaily(days);
  const start = startOfDayUtc();
  start.setUTCDate(start.getUTCDate() - (days - 1));

  let q = supabase.from("analytics_events").select("at").gte("at", start.toISOString()).limit(100_000);
  if (eventName) q = q.eq("event_name", eventName);
  const { data } = await q;
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { at: string }[]) {
    const key = row.at.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return buildDailySeries(start, days, counts);
}

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function emptyDaily(days: number): DailyEventPoint[] {
  const start = startOfDayUtc();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return buildDailySeries(start, days, new Map());
}
function buildDailySeries(start: Date, days: number, counts: Map<string, number>): DailyEventPoint[] {
  const out: DailyEventPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}
