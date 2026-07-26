import Link from "next/link";
import { listAuthUsers } from "@/app/lib/admin-auth-users";
import { DeleteAuthUserButton } from "@/app/admin/(protected)/auth-users/delete-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Auth users" };

const PAGE_SIZE = 25;

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

function displayEmail(u: { email: string | null; phone: string | null }, reveal: boolean): string {
  if (u.email) return reveal ? u.email : maskEmail(u.email);
  if (u.phone) return reveal ? u.phone : `••••${u.phone.slice(-3)}`;
  return "—";
}

export default async function AdminAuthUsers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; reveal?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const reveal = sp.reveal === "1";
  const { users, total, hasMore } = await listAuthUsers({ page, perPage: PAGE_SIZE });

  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const base: Record<string, string | number> = {};
    if (page > 1) base.page = page;
    if (reveal) base.reveal = 1;
    return { ...base, ...overrides };
  };

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Auth users
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Authorized accounts
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Real Supabase <code className="text-white/70">auth.users</code>. {total.toLocaleString()} account(s). Guest / anonymous sessions are hidden from this view.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={{ pathname: "/admin/auth-users", query: buildQuery({ page: 1, reveal: reveal ? undefined : 1 }) }}
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

      {users.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/60">No real accounts to show yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">Identifier</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/80 font-mono text-xs">
                    {displayEmail(u, reveal)}
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">{u.provider || "email"}</td>
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {new Date(u.created_at).toLocaleString(undefined, { hour12: false })}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString(undefined, { hour12: false }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/30 text-[10px] font-mono">{u.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteAuthUserButton id={u.id} email={u.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-white/50">
        <span>Page {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={{ pathname: "/admin/auth-users", query: buildQuery({ page: page - 1 }) }}
              className="rounded-full border border-white/10 px-3 py-1 hover:border-white/20"
            >
              ← Prev
            </Link>
          )}
          {hasMore && (
            <Link
              href={{ pathname: "/admin/auth-users", query: buildQuery({ page: page + 1 }) }}
              className="rounded-full border border-white/10 px-3 py-1 hover:border-white/20"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
