export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isSupabaseClientSetupMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("supabaseurl is required")
    || normalized.includes("supabasekey is required")
    || normalized.includes("url is required")
    || normalized.includes("invalid url")
    || normalized.includes("your project's url and key are required")
    || normalized.includes("required to create a supabase client")
    || normalized.includes("cannot use import statement outside a module")
    || normalized.includes("unexpected token 'export'")
    || normalized.includes("@supabase/ssr");
}

export function isSupabaseClientSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return isSupabaseClientSetupMessage(message);
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
