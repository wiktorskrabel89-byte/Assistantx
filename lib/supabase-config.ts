export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function workspaceSyncNotConfiguredResponse() {
  return Response.json(
    {
      code: "workspace_sync_not_configured",
      error: "Supabase is not configured. Cloud sync is unavailable.",
      hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file.",
    },
    { status: 503 }
  );
}
