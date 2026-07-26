import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Analytics" };

async function loadCounts() {
  const supabase = getServiceRoleClient();
  if (!supabase) return null;
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const from30 = new Date(now.getTime() - 30 * day).toISOString();
  const [{ count: last30 }, { count: pending }, { count: confirmed }] = await Promise.all([
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).gte("created_at", from30),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
  ]);
  return { last30: last30 ?? 0, pending: pending ?? 0, confirmed: confirmed ?? 0 };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

export default async function AdminAnalytics() {
  const counts = await loadCounts();
  const confirmRate =
    counts && counts.confirmed + counts.pending > 0
      ? Math.round((counts.confirmed / (counts.confirmed + counts.pending)) * 1000) / 10
      : null;

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Analytics
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Growth &amp; conversion
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Based on data we actually have: waitlist signups. Registration &amp; subscription conversion tiles will fill in once those flows exist.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Signups (30d)" value={counts ? counts.last30.toLocaleString() : "—"} sub="Rolling window" />
        <Stat
          label="Confirm rate"
          value={confirmRate === null ? "—" : `${confirmRate.toFixed(1)}%`}
          sub="Confirmed ÷ (confirmed + pending)"
        />
        <Stat label="Confirmed" value={counts ? counts.confirmed.toLocaleString() : "—"} />
        <Stat label="Pending" value={counts ? counts.pending.toLocaleString() : "—"} sub="Not yet clicked confirm" />
      </div>

      <section className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-sm text-white/60">
        <h2 className="text-lg font-bold tracking-tight text-white mb-3">Extending analytics</h2>
        <p>
          To track richer product funnels, add an <code className="text-violet-300">analytics_events</code> table with <code>event_name</code>, <code>user_id</code>, <code>properties jsonb</code>, <code>at</code>. Insert from your app + surface aggregates here. Nothing is faked in the meantime.
        </p>
      </section>
    </div>
  );
}
