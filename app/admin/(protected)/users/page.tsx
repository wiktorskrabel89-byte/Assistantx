import Link from "next/link";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Users" };

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

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Users
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Waitlist signups
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          {total.toLocaleString()} rows · newest first. Emails are masked by default to reduce shoulder-surfing risk.
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name or email…"
          className="flex-1 min-w-[200px] rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50"
        />
        <label className="inline-flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" name="reveal" value="1" defaultChecked={reveal} className="accent-violet-500" />
          Reveal emails
        </label>
        <button className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition">
          Search
        </button>
      </form>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r) => (
                <tr key={r.id}>
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
                  <td className="px-4 py-3 text-white/50 text-xs">
                    {new Date(r.created_at).toLocaleString(undefined, { hour12: false })}
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
                href={{ pathname: "/admin/users", query: { q, page: page - 1, ...(reveal ? { reveal: 1 } : {}) } }}
                className="rounded-full border border-white/10 px-3 py-1 hover:border-white/20"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={{ pathname: "/admin/users", query: { q, page: page + 1, ...(reveal ? { reveal: 1 } : {}) } }}
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
