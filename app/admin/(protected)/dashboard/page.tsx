import { getOverviewMetrics, getRecentSignups } from "@/app/lib/admin-metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Overview" };

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

export default async function AdminDashboard() {
  const [metrics, signups] = await Promise.all([
    getOverviewMetrics(),
    getRecentSignups(10),
  ]);

  return (
    <div>
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Overview
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            AssistantX Control Center
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Live figures pulled from Supabase. Any counter marked &ldquo;—&rdquo; needs the underlying integration to be configured.
        </p>
      </header>

      {!metrics.supabaseConfigured && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          Supabase service role key is not configured on the server. Metrics will be zero until <code>SUPABASE_SERVICE_ROLE_KEY</code> is set.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Auth users" value={fmt(metrics.authUsers)} sub={metrics.authUsers === null ? "Auth admin API not available" : "Registered accounts"} />
        <Stat label="Waitlist total" value={fmt(metrics.waitlistTotal)} sub={`${fmt(metrics.waitlistConfirmed)} confirmed · ${fmt(metrics.waitlistPending)} pending`} />
        <Stat label="Waitlist today" value={fmt(metrics.waitlistToday)} sub="Since 00:00 UTC" />
        <Stat label="Waitlist this month" value={fmt(metrics.waitlistThisMonth)} sub={`${fmt(metrics.waitlistThisWeek)} this week`} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value="—" sub="Payments integration not configured" />
        <Stat label="Active subs" value="—" sub="Payments integration not configured" />
        <Stat label="Total revenue" value="—" sub="Payments integration not configured" />
        <Stat label="Conversion" value="—" sub="Needs paid-conversion data" />
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold tracking-tight">Recent signups</h2>
          <span className="text-xs text-white/40">Newest first</span>
        </div>
        {signups.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/40">
            No signups yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {signups.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-white/80">{s.name || "—"}</td>
                    <td className="px-4 py-3 text-white/60 font-mono text-xs">{maskEmail(s.email)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                          s.status === "confirmed"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/30"
                            : "bg-amber-500/10 text-amber-200 border border-amber-400/30"
                        }`}
                      >
                        {s.status || "confirmed"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">
                      {new Date(s.created_at).toLocaleString(undefined, { hour12: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
