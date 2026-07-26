import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import {
  getEventTotals,
  getTopEvents,
  getRecentEvents,
  getDailyEvents,
} from "@/app/lib/admin-analytics";
import { GrowthChart } from "@/app/admin/(protected)/dashboard/growth-chart";
import { AnimatedCounter } from "@/app/admin/(protected)/dashboard/animated-counter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Analytics" };

async function loadWaitlist() {
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

function Stat({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.14]">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight tabular-nums">
        <AnimatedCounter value={value} className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent" />
      </p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function relative(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function eventColor(name: string): string {
  if (name.startsWith("waitlist.confirmed")) return "bg-emerald-500/10 text-emerald-300 border-emerald-400/30";
  if (name.startsWith("waitlist.joined")) return "bg-violet-500/10 text-violet-300 border-violet-400/30";
  if (name.startsWith("waitlist.rate_limited")) return "bg-amber-500/10 text-amber-200 border-amber-400/30";
  if (name.startsWith("waitlist.duplicate")) return "bg-white/[0.05] text-white/60 border-white/10";
  if (name.startsWith("admin.")) return "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-400/30";
  return "bg-blue-500/10 text-blue-300 border-blue-400/30";
}

export default async function AdminAnalytics() {
  const [waitlist, totals, topEvents, recent, dailyAll, dailyJoined] = await Promise.all([
    loadWaitlist(),
    getEventTotals(),
    getTopEvents(30, 8),
    getRecentEvents(20),
    getDailyEvents(30, null),
    getDailyEvents(30, "waitlist.joined"),
  ]);

  const confirmRate =
    waitlist && waitlist.confirmed + waitlist.pending > 0
      ? Math.round((waitlist.confirmed / (waitlist.confirmed + waitlist.pending)) * 1000) / 10
      : null;
  const maxTop = topEvents[0]?.count ?? 0;

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Analytics
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Product analytics
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Live from <code className="text-white/70">analytics_events</code>. Waitlist join + confirm are wired in; add more via <code className="text-white/70">POST /api/analytics/track</code> or the server helper <code className="text-white/70">logEvent()</code>.
        </p>
      </header>

      {/* Event totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Events (all time)" value={totals.total} sub={`${totals.uniqueEvents} distinct names`} />
        <Stat label="Last 24h" value={totals.last24h} />
        <Stat label="Last 7 days" value={totals.last7d} />
        <Stat label="Last 30 days" value={totals.last30d} />
      </div>

      {/* Big chart */}
      <section className="mt-6">
        <GrowthChart data={dailyAll} />
      </section>

      {/* Two-column: waitlist funnel + top events */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            Waitlist funnel
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">Confirm rate &amp; volume</h3>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-wider text-white/40">30-day signups</p>
              <p className="mt-1 text-2xl font-black tabular-nums">
                <AnimatedCounter value={waitlist?.last30 ?? 0} />
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-wider text-white/40">Confirm rate</p>
              <p className="mt-1 text-2xl font-black tabular-nums">
                {confirmRate === null ? "—" : `${confirmRate.toFixed(1)}%`}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-wider text-white/40">Confirmed</p>
              <p className="mt-1 text-2xl font-black tabular-nums">
                <AnimatedCounter value={waitlist?.confirmed ?? 0} />
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-wider text-white/40">Pending</p>
              <p className="mt-1 text-2xl font-black tabular-nums">
                <AnimatedCounter value={waitlist?.pending ?? 0} />
              </p>
              <p className="mt-1 text-xs text-white/40">Not yet clicked confirm</p>
            </div>
          </div>
          <p className="mt-5 text-xs text-white/50">
            <strong>waitlist.joined</strong> in last 30d: {dailyJoined.reduce((s, d) => s + d.count, 0).toLocaleString()}
          </p>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            Top events
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">By count · last 30 days</h3>
          {topEvents.length === 0 ? (
            <p className="mt-6 text-sm text-white/40">No events yet — fire some through <code>logEvent()</code> or POST <code>/api/analytics/track</code>.</p>
          ) : (
            <ul className="mt-5 space-y-2.5">
              {topEvents.map((e, i) => {
                const pct = maxTop ? (e.count / maxTop) * 100 : 0;
                return (
                  <li
                    key={e.event_name}
                    className="group"
                    style={{ animation: `bar-in 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 0.04}s both` }}
                  >
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-mono text-white/80 truncate">{e.event_name}</span>
                      <span className="tabular-nums text-white/50">{e.count.toLocaleString()}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 shadow-[0_0_12px_rgba(167,139,250,0.35)]"
                        style={{
                          width: `${Math.max(2, pct)}%`,
                          animation: `bar-grow 0.9s cubic-bezier(0.22,1,0.36,1) ${0.2 + i * 0.04}s both`,
                          transformOrigin: "left center",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <style>{`
            @keyframes bar-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
            @keyframes bar-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
          `}</style>
        </div>
      </div>

      {/* Recent event stream */}
      <section className="mt-8">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
              Recent events
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">Live stream</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/40">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            live
          </span>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/40">
            No events yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Properties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {recent.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap" title={new Date(e.at).toLocaleString()}>
                      {relative(e.at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-mono ${eventColor(e.event_name)}`}>
                        {e.event_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">{e.source || "—"}</td>
                    <td className="px-4 py-3 text-white/50 text-xs max-w-md truncate font-mono">
                      {Object.keys(e.properties || {}).length ? JSON.stringify(e.properties) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-sm text-white/60">
        <h2 className="text-lg font-bold tracking-tight text-white mb-3">Fire your own events</h2>
        <p className="mb-3">Two entry points:</p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <span className="text-white/80">Server-side</span> — <code className="text-violet-300">import {`{ logEvent }`} from &quot;@/app/lib/analytics-events&quot;</code> and call <code className="text-violet-300">logEvent({`{ name, properties, request }`})</code>.
          </li>
          <li>
            <span className="text-white/80">Client-side</span> — <code className="text-violet-300">POST /api/analytics/track</code> with JSON body <code className="text-violet-300">{`{ name, properties?, anonymous_id?, source? }`}</code>.
          </li>
        </ol>
        <p className="mt-4 text-xs text-white/40">
          Every insert stores a hashed IP + user agent (audit-friendly, not personally-identifiable). Errors never break the calling flow.
        </p>
      </section>
    </div>
  );
}
