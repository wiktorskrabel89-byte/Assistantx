import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import { LaunchComposer } from "@/app/admin/(protected)/launch/launch-composer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Launches" };

type Launch = {
  id: string;
  name: string;
  subject: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  recipient_total: number;
  recipient_ok: number;
  recipient_failed: number;
  last_error: string | null;
};

async function listLaunches(): Promise<Launch[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("admin_launches")
    .select("id, name, subject, status, scheduled_for, created_at, updated_at, sent_at, recipient_total, recipient_ok, recipient_failed, last_error")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Launch[];
}

async function getConfirmedAudienceSize(): Promise<number> {
  const supabase = getServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true })
    .eq("status", "confirmed");
  return count ?? 0;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-white/10 text-white/70 border-white/20",
  scheduled: "bg-amber-500/10 text-amber-200 border-amber-400/30",
  sending: "bg-blue-500/10 text-blue-200 border-blue-400/30",
  sent: "bg-emerald-500/10 text-emerald-300 border-emerald-400/30",
  cancelled: "bg-white/5 text-white/40 border-white/10",
  failed: "bg-red-500/10 text-red-300 border-red-400/30",
};

export default async function AdminLaunches() {
  const [launches, audienceSize] = await Promise.all([listLaunches(), getConfirmedAudienceSize()]);
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Launches
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Launch composer
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Compose and send launch emails to the confirmed waitlist. Emails are sent one at a time — recipients never see each other.
        </p>
      </header>

      {!resendConfigured && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          <code>RESEND_API_KEY</code> is not configured. You can save drafts here, but the &ldquo;Send&rdquo; button will refuse until the server can reach Resend.
        </div>
      )}

      <LaunchComposer audienceSize={audienceSize} />

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold tracking-tight">History</h2>
          <span className="text-xs text-white/40">{launches.length} launch(es)</span>
        </div>
        {launches.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/40">
            No launches yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Delivered</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {launches.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 text-white/90 font-medium">{l.name}</td>
                    <td className="px-4 py-3 text-white/60">{l.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_COLORS[l.status] ?? "border-white/10 text-white/60"}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      {l.recipient_ok}/{l.recipient_total}
                      {l.recipient_failed > 0 && <span className="text-red-300"> · {l.recipient_failed} failed</span>}
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">
                      {new Date(l.updated_at).toLocaleString(undefined, { hour12: false })}
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
