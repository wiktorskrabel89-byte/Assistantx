import Link from "next/link";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Audit log" };

const PAGE_SIZE = 50;

type Row = {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  ip_hash: string | null;
  user_agent: string | null;
};

async function listLogs(page: number, action: string): Promise<{ rows: Row[]; total: number }> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { rows: [], total: 0 };
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let q = supabase
    .from("admin_audit_logs")
    .select("id, at, actor, action, target, metadata, ip_hash, user_agent", { count: "exact" })
    .order("at", { ascending: false })
    .range(from, to);
  if (action) q = q.eq("action", action);
  const { data, count } = await q;
  return { rows: (data ?? []) as Row[], total: count ?? 0 };
}

export default async function AdminAuditLogs({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const action = (sp.action || "").trim();
  const { rows, total } = await listLogs(page, action);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Audit log
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Admin activity
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Every admin action is recorded here. IPs are stored only as a salted SHA-256 hash.
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          name="action"
          defaultValue={action}
          placeholder="Filter by action (e.g. launch.sent)"
          className="flex-1 min-w-[240px] rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50"
        />
        <button className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/40">
          No log entries.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Metadata</th>
                <th className="px-4 py-3 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {new Date(r.at).toLocaleString(undefined, { hour12: false })}
                  </td>
                  <td className="px-4 py-3 text-white/80 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-3 text-white/60 font-mono text-xs">
                    {r.target ? r.target.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs max-w-md truncate">
                    {Object.keys(r.metadata || {}).length ? JSON.stringify(r.metadata) : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs font-mono">
                    {r.actor.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-white/50">
          <span>Page {page} / {pageCount}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ pathname: "/admin/audit-logs", query: { ...(action ? { action } : {}), page: page - 1 } }}
                className="rounded-full border border-white/10 px-3 py-1 hover:border-white/20"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={{ pathname: "/admin/audit-logs", query: { ...(action ? { action } : {}), page: page + 1 } }}
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
