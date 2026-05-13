type SupabaseLike = {
  auth: {
    getUser: (token?: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
};

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const trimmed = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  return trimmed || null;
}

export async function getAuthenticatedUserForSync(
  supabase: SupabaseLike,
  request?: Request,
): Promise<{ user: { id: string } | null; error: unknown }> {
  const token = extractBearerToken(request?.headers.get("authorization") ?? null);
  const { data, error } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();
  return { user: data.user, error };
}

