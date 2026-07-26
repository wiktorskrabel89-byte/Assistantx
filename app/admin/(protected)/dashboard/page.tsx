import { getOverviewMetrics, getRecentSignups, getDailySignups, periodDelta } from "@/app/lib/admin-metrics";
import { AnimatedCounter } from "@/app/admin/(protected)/dashboard/animated-counter";
import { Sparkline } from "@/app/admin/(protected)/dashboard/sparkline";
import { GrowthChart } from "@/app/admin/(protected)/dashboard/growth-chart";
import { Heatmap } from "@/app/admin/(protected)/dashboard/heatmap";
import { ActivityFeed } from "@/app/admin/(protected)/dashboard/activity-feed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Overview" };

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        up
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-red-400/30 bg-red-500/10 text-red-300"
      }`}
    >
      <svg viewBox="0 0 12 12" width="8" height="8" aria-hidden="true">
        <path
          d={up ? "M6 2 L11 8 H1 Z" : "M6 10 L1 4 H11 Z"}
          fill="currentColor"
        />
      </svg>
      {up ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

function Tile({
  eyebrow,
  label,
  value,
  sub,
  delta,
  spark,
  color,
  icon,
  delay,
}: {
  eyebrow: string;
  label: string;
  value: number | null;
  sub?: string;
  delta?: number | null;
  spark?: number[];
  color: string;
  icon: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.14] hover:bg-white/[0.04] hover:-translate-y-0.5"
      style={{ animation: `tile-in 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s both` }}
    >
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{eyebrow}</p>
          <p className="mt-1 text-xs text-white/70">{label}</p>
        </div>
        <div
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ring-white/20"
          style={{ background: color }}
        >
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-black tracking-tight tabular-nums">
          <AnimatedCounter value={value} className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent" />
        </p>
        {spark && <Sparkline data={spark} id={eyebrow} color={colorToStroke(color)} />}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/40">
        <span>{sub || " "}</span>
        {typeof delta !== "undefined" && <DeltaBadge delta={delta ?? null} />}
      </div>
    </div>
  );
}

function colorToStroke(bg: string): string {
  if (bg.includes("violet") || bg.includes("purple") || bg.includes("139,92")) return "#a78bfa";
  if (bg.includes("cyan") || bg.includes("6,182")) return "#22d3ee";
  if (bg.includes("emerald") || bg.includes("16,185")) return "#34d399";
  if (bg.includes("fuchsia") || bg.includes("217,70")) return "#f0abfc";
  if (bg.includes("amber") || bg.includes("245,158")) return "#fbbf24";
  return "#a78bfa";
}

const svg = (d: string) => (
  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

export default async function AdminDashboard() {
  const [metrics, signups, daily30, daily84] = await Promise.all([
    getOverviewMetrics(),
    getRecentSignups(8),
    getDailySignups(30),
    getDailySignups(84), // 12 weeks
  ]);

  const trend14 = daily30.slice(-14).map((d) => d.count);
  const trend7 = daily30.slice(-7).map((d) => d.count);
  const weekDelta = periodDelta(daily30.slice(-14)); // last 7 vs previous 7
  const monthDelta = periodDelta(daily30); // last 15 vs previous 15
  const todayDelta = periodDelta(daily30.slice(-2)); // yesterday vs today

  return (
    <div>
      {/* Header with animated gradient wash */}
      <header className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-violet-950/40 via-black to-black p-8 mb-8">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -top-20 -left-20 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" style={{ animation: "hero-orb 12s ease-in-out infinite" }} />
          <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" style={{ animation: "hero-orb 14s ease-in-out infinite reverse" }} />
        </div>
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            Overview
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-[-0.02em]">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
              AssistantX Control Center
            </span>
          </h1>
          <p className="mt-2 text-sm text-white/50 max-w-xl">
            Everything live from Supabase. Tiles animate in on load, sparklines show the last two weeks, and the feed refreshes on every visit.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              Supabase healthy
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/50">
              Session · {new Date().toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      </header>

      {!metrics.supabaseConfigured && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          <code>SUPABASE_SERVICE_ROLE_KEY</code> not configured — counters will show 0 until it&rsquo;s set.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          eyebrow="Users"
          label="Auth users"
          value={metrics.authUsers}
          sub={metrics.authUsers === null ? "Auth admin API unavailable" : "Registered accounts"}
          color="linear-gradient(135deg, rgba(139,92,246,0.9), rgba(96,165,250,0.9))"
          icon={svg("M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.25a3 3 0 11-6 0 3 3 0 016 0zm7.5 2.25a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197A5.971 5.971 0 016 18.719M12 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z")}
          delay={0.05}
        />
        <Tile
          eyebrow="Waitlist"
          label="Total"
          value={metrics.waitlistTotal}
          sub={`${metrics.waitlistConfirmed.toLocaleString()} confirmed · ${metrics.waitlistPending.toLocaleString()} pending`}
          delta={monthDelta.delta}
          spark={trend14}
          color="linear-gradient(135deg, rgba(139,92,246,0.9), rgba(217,70,239,0.9))"
          icon={svg("M16.5 3.75V16.5L12 14.25L7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9")}
          delay={0.1}
        />
        <Tile
          eyebrow="Today"
          label="Signups (UTC)"
          value={metrics.waitlistToday}
          sub="Since 00:00 UTC"
          delta={todayDelta.delta}
          spark={trend7}
          color="linear-gradient(135deg, rgba(6,182,212,0.9), rgba(59,130,246,0.9))"
          icon={svg("M12 6v6l4 2m-4-8a9 9 0 100 18 9 9 0 000-18z")}
          delay={0.15}
        />
        <Tile
          eyebrow="This week"
          label="Signups"
          value={metrics.waitlistThisWeek}
          sub={`${metrics.waitlistThisMonth.toLocaleString()} this month`}
          delta={weekDelta.delta}
          spark={trend14}
          color="linear-gradient(135deg, rgba(16,185,129,0.9), rgba(6,182,212,0.9))"
          icon={svg("M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5")}
          delay={0.2}
        />
      </div>

      {/* Payments — honest placeholders */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "MRR", s: "Payments not configured" },
          { l: "Active subs", s: "Payments not configured" },
          { l: "Revenue this month", s: "Gross" },
          { l: "Conversion", s: "Needs paid-conversion data" },
        ].map((p, i) => (
          <div
            key={p.l}
            className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.01] p-5 opacity-70"
            style={{ animation: `tile-in 0.55s cubic-bezier(0.22,1,0.36,1) ${0.25 + i * 0.03}s both` }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Revenue</p>
            <p className="mt-1 text-xs text-white/70">{p.l}</p>
            <p className="mt-4 text-3xl font-black tracking-tight text-white/40">—</p>
            <p className="mt-3 text-[11px] text-white/40">{p.s}</p>
          </div>
        ))}
      </div>

      <section className="mt-8" style={{ animation: "tile-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.4s both" }}>
        <GrowthChart data={daily30} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3" style={{ animation: "tile-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.5s both" }}>
          <Heatmap data={daily84} />
        </div>
        <div className="lg:col-span-2" style={{ animation: "tile-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.55s both" }}>
          <ActivityFeed limit={10} />
        </div>
      </div>

      {/* Recent signups table */}
      <section className="mt-8" style={{ animation: "tile-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.6s both" }}>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
              Waitlist
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">Recent signups</h2>
          </div>
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
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
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

      <style>{`
        @keyframes tile-in {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hero-orb {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(20px,-16px,0) scale(1.15); }
        }
      `}</style>
    </div>
  );
}
