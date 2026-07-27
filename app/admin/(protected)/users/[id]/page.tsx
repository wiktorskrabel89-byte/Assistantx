import Link from "next/link";
import { notFound } from "next/navigation";
import { getWaitlistDetail } from "@/app/lib/admin-user-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · User detail" };

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

function relative(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reveal?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const reveal = sp.reveal === "1";

  const data = await getWaitlistDetail(id);
  if (!data || !data.signup) notFound();

  const s = data.signup!;
  const emailShown = reveal ? s.email : maskEmail(s.email);
  const site = process.env.WAITLIST_PUBLIC_URL || "https://assistantx.pl";
  const shareLink = s.referral_code ? `${site}/?ref=${s.referral_code}` : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 text-xs">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to waitlist
        </Link>
        <Link
          href={{ pathname: `/admin/users/${id}`, query: reveal ? {} : { reveal: 1 } }}
          className={`rounded-full border px-3 py-1.5 transition ${
            reveal
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20"
          }`}
        >
          {reveal ? "Hide email" : "Reveal email"}
        </Link>
      </div>

      <header className="mb-6 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">User</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            {s.name || "Anonymous"}
          </span>
        </h1>
        <p className="mt-1 font-mono text-sm text-white/60">{emailShown}</p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Status</dt>
            <dd className="mt-1 text-sm text-white/80">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  s.status === "confirmed"
                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/30"
                    : "bg-amber-500/10 text-amber-200 border border-amber-400/30"
                }`}
              >
                {s.status || "confirmed"}
              </span>
              {data.suppressed && (
                <span className="ml-2 inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-300">
                  unsubscribed
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Joined</dt>
            <dd className="mt-1 text-sm text-white/80">
              {new Date(s.created_at).toLocaleString(undefined, { hour12: false })}
            </dd>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Confirmed at</dt>
            <dd className="mt-1 text-sm text-white/80">
              {s.confirmed_at ? new Date(s.confirmed_at).toLocaleString(undefined, { hour12: false }) : "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Source</dt>
            <dd className="mt-1 text-sm text-white/80">{s.source || "—"}</dd>
          </div>
        </dl>
      </header>

      <section className="mb-6 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">Referrals</p>
        <h2 className="mt-1 text-lg font-bold tracking-tight">Their invite graph</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-widest text-white/40">Invited by</p>
            {data.referredByRow ? (
              <p className="mt-1 text-sm text-white/80">
                {data.referredByRow.name || "—"}{" "}
                <span className="text-xs text-white/50 font-mono">({maskEmail(data.referredByRow.email)})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/40">Nobody — signed up directly</p>
            )}
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-widest text-white/40">Referrals sent</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{s.referral_count.toLocaleString()}</p>
          </div>
          {shareLink && (
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-4 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-widest text-violet-300/80">Their share link</p>
              <p className="mt-1 break-all font-mono text-xs text-white/80">{shareLink}</p>
            </div>
          )}
        </div>

        {data.referredRows.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.referredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white/70 font-mono text-xs">{maskEmail(r.email)}</td>
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
      </section>

      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">Events</p>
        <h2 className="mt-1 text-lg font-bold tracking-tight">Recent activity</h2>
        <p className="mt-2 text-xs text-white/40">
          Matched by <code className="text-white/60">properties.email_domain</code> — this is a best-effort join because
          analytics_events don&apos;t store raw addresses.
        </p>
        {data.events.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-sm text-white/40">
            No matching events.
          </p>
        ) : (
          <ol className="mt-6 space-y-2">
            {data.events.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5"
              >
                <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-mono text-violet-300">
                  {e.event_name}
                </span>
                <span className="text-xs text-white/50 whitespace-nowrap" title={new Date(e.at).toLocaleString()}>
                  {relative(e.at)}
                </span>
                <span className="ml-auto truncate text-[10px] font-mono text-white/40">
                  {Object.keys(e.properties || {}).length ? JSON.stringify(e.properties) : "—"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
