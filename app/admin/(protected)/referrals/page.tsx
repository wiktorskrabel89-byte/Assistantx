import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Referrals" };

type Row = {
  id: string;
  name: string | null;
  email: string;
  referral_code: string | null;
  referral_count: number;
  status: string | null;
  created_at: string;
};

async function listLeaderboard(): Promise<Row[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("waitlist_signups")
    .select("id, name, email, referral_code, referral_count, status, created_at")
    .order("referral_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []) as Row[];
}

async function stats(): Promise<{ withRef: number; total: number }> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { withRef: 0, total: 0 };
  const [total, withRef] = await Promise.all([
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }),
    supabase.from("waitlist_signups").select("*", { count: "exact", head: true }).not("referred_by", "is", null),
  ]);
  return { total: total.count ?? 0, withRef: withRef.count ?? 0 };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

export default async function AdminReferrals() {
  const [rows, s] = await Promise.all([listLeaderboard(), stats()]);
  const pct = s.total ? Math.round((s.withRef / s.total) * 1000) / 10 : 0;

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Referrals
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Leaderboard
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          {s.total.toLocaleString()} signups · <strong className="text-white/70">{s.withRef.toLocaleString()}</strong> came via a referral link ({pct.toFixed(1)}% share).
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/40">
          No signups yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Referrals</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/40 tabular-nums text-xs">{i + 1}</td>
                  <td className="px-4 py-3 text-white/80">{r.name || "—"}</td>
                  <td className="px-4 py-3 text-white/60 font-mono text-xs">{maskEmail(r.email)}</td>
                  <td className="px-4 py-3">
                    {r.referral_count > 0 ? (
                      <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                        {r.referral_count.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-white/30 text-xs">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs font-mono">{r.referral_code || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        r.status === "confirmed"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/30"
                          : "bg-amber-500/10 text-amber-200 border border-amber-400/30"
                      }`}
                    >
                      {r.status || "confirmed"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString(undefined, { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
