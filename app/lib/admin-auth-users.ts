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
  anonymousCount: number;
  hasMore: boolean;
};

/**
 * Best-effort field mapping. Supabase returns:
 *   - user.email                          — real email (magic-link, or OAuth handoff)
 *   - user.app_metadata.provider          — provider name for the primary identity
 *   - user.identities[]                   — every linked identity, each with
 *                                            provider + identity_data (may hold email)
 *   - user.is_anonymous                   — guest session (no login yet)
 */
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
 * Server-side paginated list of auth users. The Supabase Admin SDK doesn't
 * support filtering, so we page a larger batch and filter/paginate here.
 *
 * `showAnonymous=false` (default) hides guest sessions — those are Supabase
 * anon-auth rows created before a visitor identifies themselves and clutter
 * the admin view. Everything else is included.
 */
export async function listAuthUsers({
  page = 1,
  perPage = 25,
  showAnonymous = false,
}: {
  page?: number;
  perPage?: number;
  showAnonymous?: boolean;
}): Promise<ListRes> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { users: [], total: 0, anonymousCount: 0, hasMore: false };

  // Fetch everything (Supabase caps at ~1000/page). For accounts with more
  // users we'd need proper server-side filtering — good enough for now.
  const BATCH = 200;
  const collected: AuthUserRow[] = [];
  let anonymousCount = 0;
  let hasMore = false;

  try {
    for (let p = 1; p <= 25; p++) {
      const res = await (supabase.auth as unknown as {
        admin: {
          listUsers: (opts: { page: number; perPage: number }) => Promise<{
            data?: { users?: RawUser[]; nextPage?: number | null };
            error?: { message: string } | null;
          }>;
        };
      }).admin.listUsers({ page: p, perPage: BATCH });
      if (res.error) break;
      const raw = res.data?.users ?? [];
      for (const u of raw) {
        const norm = normalize(u);
        if (norm.is_anonymous) anonymousCount++;
        if (showAnonymous || !norm.is_anonymous) collected.push(norm);
      }
      if (!raw.length || raw.length < BATCH || !res.data?.nextPage) break;
    }
  } catch {
    /* fall through with partial results */
  }

  const total = collected.length;
  const from = (page - 1) * perPage;
  const to = from + perPage;
  hasMore = to < total;
  return {
    users: collected.slice(from, to),
    total,
    anonymousCount,
    hasMore,
  };
}

export async function deleteAuthUser(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { ok: false, error: "supabase-not-configured" };
  try {
    const del = (supabase.auth as unknown as {
      admin: {
        deleteUser?: (id: string) => Promise<{ error?: { message: string } | null }>;
      };
    }).admin.deleteUser;
    if (!del) return { ok: false, error: "deleteUser-unavailable" };
    const res = await del(id);
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: msg };
  }
}
