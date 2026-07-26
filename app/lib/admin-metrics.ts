/** Read-only aggregate queries for the admin dashboard. Service-role only. */
import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export type OverviewMetrics = {
  waitlistTotal: number;
  waitlistConfirmed: number;
  waitlistPending: number;
  waitlistToday: number;
  waitlistThisWeek: number;
  waitlistThisMonth: number;
  authUsers: number | null; // null if we can't query (missing service role)
  supabaseConfigured: boolean;
};

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfWeekUtc(d = new Date()): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // treat Monday as start
  const start = startOfDayUtc(d);
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}
function startOfMonthUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return {
      waitlistTotal: 0,
      waitlistConfirmed: 0,
      waitlistPending: 0,
      waitlistToday: 0,
      waitlistThisWeek: 0,
      waitlistThisMonth: 0,
      authUsers: null,
      supabaseConfigured: false,
    };
  }

  const [total, confirmed, pending, today, thisWeek, thisMonth] = await Promise.all([
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).gte("created_at", startOfDayUtc().toISOString()),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).gte("created_at", startOfWeekUtc().toISOString()),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).gte("created_at", startOfMonthUtc().toISOString()),
  ]);

  // status column may not exist on older waitlist_signups tables — fall back
  // to total for "confirmed" if the query errored.
  const confirmedCount = confirmed.error ? total.count ?? 0 : confirmed.count ?? 0;
  const pendingCount = pending.error ? 0 : pending.count ?? 0;

  // Auth users via the admin API, filtered to REAL accounts only —
  // Supabase anonymous / guest sessions are excluded from every admin
  // surface, including this counter. We page through and tally rows where
  // is_anonymous is falsy.
  let authUsers: number | null = null;
  try {
    let count = 0;
    let sawSomething = false;
    const BATCH = 200;
    for (let p = 1; p <= 25; p++) {
      const res = await supabase.auth.admin.listUsers({ page: p, perPage: BATCH });
      if (res.error) break;
      const raw = (res.data?.users ?? []) as Array<{ is_anonymous?: boolean }>;
      if (raw.length) sawSomething = true;
      for (const u of raw) if (!u.is_anonymous) count++;
      if (raw.length < BATCH || !res.data?.nextPage) break;
    }
    authUsers = sawSomething ? count : 0;
  } catch {
    authUsers = null;
  }

  return {
    waitlistTotal: total.count ?? 0,
    waitlistConfirmed: confirmedCount,
    waitlistPending: pendingCount,
    waitlistToday: today.count ?? 0,
    waitlistThisWeek: thisWeek.count ?? 0,
    waitlistThisMonth: thisMonth.count ?? 0,
    authUsers,
    supabaseConfigured: true,
  };
}

export type RecentSignup = {
  id: string;
  name: string | null;
  email: string;
  status: string | null;
  created_at: string;
};

export async function getRecentSignups(limit = 10): Promise<RecentSignup[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("waitlist_signups")
    .select("id, name, email, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentSignup[];
}

/**
 * Return an array of {date: 'YYYY-MM-DD', count} for the last `days` days
 * (inclusive of today). Missing days are filled with 0. UTC boundaries.
 */
export async function getDailySignups(days = 30): Promise<{ date: string; count: number }[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return emptyDaily(days);

  const start = startOfDayUtc();
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const { data, error } = await supabase
    .from("waitlist_signups")
    .select("created_at")
    .gte("created_at", start.toISOString())
    .limit(50_000);

  if (error || !data) return emptyDaily(days);

  const counts = new Map<string, number>();
  for (const row of data as { created_at: string }[]) {
    const key = row.created_at.slice(0, 10); // YYYY-MM-DD in UTC
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return buildDailySeries(start, days, counts);
}

function emptyDaily(days: number): { date: string; count: number }[] {
  const start = startOfDayUtc();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return buildDailySeries(start, days, new Map());
}

function buildDailySeries(
  start: Date,
  days: number,
  counts: Map<string, number>,
): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

/** Percentage change between two consecutive equal-sized periods. */
export function periodDelta(series: { count: number }[]): { current: number; previous: number; delta: number | null } {
  const half = Math.floor(series.length / 2);
  if (half <= 0) return { current: 0, previous: 0, delta: null };
  const previous = series.slice(0, half).reduce((s, r) => s + r.count, 0);
  const current = series.slice(-half).reduce((s, r) => s + r.count, 0);
  if (previous === 0) return { current, previous: 0, delta: current > 0 ? 100 : null };
  return { current, previous, delta: Math.round(((current - previous) / previous) * 1000) / 10 };
}
