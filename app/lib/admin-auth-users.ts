import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export type AuthUserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  provider: string | null;
  is_anonymous: boolean;
};

type ListRes = {
  users: AuthUserRow[];
  total: number;
  hasMore: boolean;
};

type RawUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  is_anonymous?: boolean;
  app_metadata?: { provider?: string; providers?: string[] };
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }>;
};

function normalize(u: RawUser): AuthUserRow {
  const identityEmail = (() => {
    for (const id of u.identities ?? []) {
      const e = id.identity_data?.["email"];
      if (typeof e === "string" && e.includes("@")) return e;
    }
    return null;
  })();
  return {
    id: u.id,
    email: u.email ?? identityEmail ?? null,
    phone: u.phone ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    provider:
      u.app_metadata?.provider ||
      u.app_metadata?.providers?.[0] ||
      u.identities?.[0]?.provider ||
      null,
    is_anonymous: Boolean(u.is_anonymous),
  };
}

/**
 * Real auth users only — guest / anonymous Supabase sessions are always
 * excluded. The admin page shouldn't show them at all.
 */
export async function listAuthUsers({
  page = 1,
  perPage = 25,
}: {
  page?: number;
  perPage?: number;
}): Promise<ListRes> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { users: [], total: 0, hasMore: false };

  const BATCH = 200;
  const collected: AuthUserRow[] = [];

  try {
    for (let p = 1; p <= 25; p++) {
      const res = await supabase.auth.admin.listUsers({ page: p, perPage: BATCH });
      if (res.error) break;
      const raw = (res.data?.users ?? []) as unknown as RawUser[];
      for (const u of raw) {
        const norm = normalize(u);
        if (!norm.is_anonymous) collected.push(norm);
      }
      if (!raw.length || raw.length < BATCH || !res.data?.nextPage) break;
    }
  } catch {
    /* fall through with partial results */
  }

  const total = collected.length;
  const from = (page - 1) * perPage;
  const to = from + perPage;
  return {
    users: collected.slice(from, to),
    total,
    hasMore: to < total,
  };
}

/**
 * Delete a Supabase auth user. Calls the admin API directly on the
 * receiver so `this` is bound, and falls back to a hard SQL delete on
 * auth.users if the API call fails (occasionally happens with dangling
 * anonymous rows).
 */
export async function deleteAuthUser(id: string): Promise<{ ok: boolean; error?: string; method?: string }> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { ok: false, error: "supabase-not-configured" };

  try {
    const res = await supabase.auth.admin.deleteUser(id);
    if (res.error) {
      const msg = res.error.message || "unknown";
      // Fallback: raw SQL delete via service role.
      const sql = await sqlDelete(id);
      if (sql.ok) return { ok: true, method: "sql-fallback" };
      return { ok: false, error: `admin-api: ${msg}; sql: ${sql.error}` };
    }
    return { ok: true, method: "admin-api" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    // Try the SQL path anyway — the SDK sometimes throws on network hiccups
    // even when the underlying delete would succeed.
    const sql = await sqlDelete(id);
    if (sql.ok) return { ok: true, method: "sql-fallback" };
    return { ok: false, error: `${msg}; sql: ${sql.error}` };
  }
}

async function sqlDelete(id: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "supabase-not-configured" };
  try {
    // The Supabase Data API can't reach auth.users directly, so use the
    // Auth admin REST endpoint — same as what the SDK wraps.
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, error: `${res.status} ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
