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

  // Auth users via the admin API. Requires SUPABASE_SERVICE_ROLE_KEY.
  let authUsers: number | null = null;
  try {
    // The listUsers admin API returns a total when perPage=1.
    const admin = (supabase as unknown as {
      auth: { admin: { listUsers: (opts?: { page?: number; perPage?: number }) => Promise<{
        data?: { users?: unknown[]; total?: number; nextPage?: number | null };
        error?: unknown;
      }> } };
    }).auth.admin;
    const res = await admin.listUsers({ page: 1, perPage: 1 });
    if (!res.error && typeof res.data?.total === "number") authUsers = res.data.total;
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
