import Link from "next/link";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import { DeleteWaitlistRowButton } from "@/app/admin/(protected)/users/delete-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Waitlist" };

const PAGE_SIZE = 25;

type Row = {
  id: string;
  name: string | null;
  email: string;
  status: string | null;
  created_at: string;
  source: string | null;
};

async function listUsers({
  q,
  page,
}: {
  q: string;
  page: number;
}): Promise<{ rows: Row[]; total: number }> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { rows: [], total: 0 };
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from("waitlist_signups")
    .select("id, name, email, status, created_at, source", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  const { data, count } = await query;
  return { rows: (data ?? []) as Row[], total: count ?? 0 };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; reveal?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const reveal = sp.reveal === "1";
  const { rows, total } = await listUsers({ q, page });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const base: Record<string, string | number> = {};
    if (q) base.q = q;
    if (page > 1) base.page = page;
    if (reveal) base.reveal = 1;
    return { ...base, ...overrides };
  };

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Waitlist
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Waitlist signups
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          {total.toLocaleString()} rows · newest first. Emails are masked by default. Reveal is a URL flag, so pagination and search preserve it.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="GET" className="flex flex-1 min-w-[220px] items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            className="flex-1 min-w-[180px] rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50"
          />
          {reveal && <input type="hidden" name="reveal" value="1" />}
          <button className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition">
            Search
          </button>
        </form>
        <Link
          href={{ pathname: "/admin/users", query: buildQuery({ page: 1, reveal: reveal ? undefined : 1 }) }}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${
            reveal
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              : "border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={
                reveal
                  ? "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  : "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.494 7.494L21 21m-3.628-3.628l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"
              }
            />
          </svg>
          {reveal ? "Hide emails" : "Reveal emails"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/40">
          No results.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/80">{r.name || "—"}</td>
                  <td className="px-4 py-3 text-white/60 font-mono text-xs">
                    {reveal ? r.email : maskEmail(r.email)}
                  </td>
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
                  <td className="px-4 py-3 text-white/50 text-xs">{r.source || "—"}</td>
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString(undefined, { hour12: false })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteWaitlistRowButton id={r.id} email={r.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-white/50">
          <span>
            Page {page} / {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ pathname: "/admin/users", query: buildQuery({ page: page - 1 }) }}
                className="rounded-full border border-white/10 px-3 py-1 hover:border-white/20"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={{ pathname: "/admin/users", query: buildQuery({ page: page + 1 }) }}
                className="rounded-full border border-white/10 px-3 py-1 hover:border-white/20"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
