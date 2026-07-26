import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  provider: string | null;
};

type ListRes = {
  users: AuthUserRow[];
  total: number | null;
  nextPage: number | null;
};

/**
 * Wraps supabase.auth.admin.listUsers with a page-based interface and a
 * defensive shape (the SDK's return varies slightly by version).
 */
export async function listAuthUsers(page = 1, perPage = 25): Promise<ListRes> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { users: [], total: null, nextPage: null };

  try {
    const res = await (supabase.auth as unknown as {
      admin: {
        listUsers: (opts: { page: number; perPage: number }) => Promise<{
          data?: {
            users?: Array<{
              id: string;
              email?: string | null;
              created_at: string;
              last_sign_in_at?: string | null;
              app_metadata?: { provider?: string };
              identities?: Array<{ provider?: string }>;
            }>;
            total?: number;
            nextPage?: number | null;
          };
          error?: { message: string } | null;
        }>;
        deleteUser?: (id: string) => Promise<{ error?: { message: string } | null }>;
      };
    }).admin.listUsers({ page, perPage });

    if (res.error) return { users: [], total: null, nextPage: null };
    const raw = res.data?.users ?? [];
    const users: AuthUserRow[] = raw.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      provider: u.app_metadata?.provider || u.identities?.[0]?.provider || null,
    }));
    return {
      users,
      total: typeof res.data?.total === "number" ? res.data.total : null,
      nextPage: res.data?.nextPage ?? null,
    };
  } catch {
    return { users: [], total: null, nextPage: null };
  }
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
