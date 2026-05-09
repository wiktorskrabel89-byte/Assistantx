import { createClient } from "@/lib/server";

export const maxDuration = 60;

type WorkspaceSyncErrorPayload = {
  code: string;
  error: string;
  hint?: string;
};

type StoredStatePayload = {
  workspaces: unknown[];
  activeWorkspaceId: string;
  dark: boolean;
};

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

function isStoredStatePayload(value: unknown): value is StoredStatePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.workspaces)
    && typeof candidate.activeWorkspaceId === "string"
    && typeof candidate.dark === "boolean";
}

function getErrorProperty(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function buildWorkspaceSyncError(error: unknown, fallbackMessage: string): { status: number; payload: WorkspaceSyncErrorPayload } {
  const code = getErrorProperty(error, "code");
  const message = getErrorProperty(error, "message") ?? (error instanceof Error ? error.message : fallbackMessage);
  const normalizedMessage = message.toLowerCase();

  // PostgREST error codes that indicate a missing or unconfigured table.
  // 42P01  — PostgreSQL "relation does not exist"
  // PGRST116 — The result contains 0 rows (may indicate missing table when used with maybeSingle)
  // PGRST200 — relationship not found in schema cache
  // PGRST201 — ambiguous foreign key in schema cache
  // PGRST202 — not found in schema cache (column)
  // PGRST204 — column not found
  // PGRST205 — could not find a foreign-key constraint in schema cache
  const postgrestMissingCodes = new Set(["42P01", "PGRST116", "PGRST200", "PGRST201", "PGRST202", "PGRST204", "PGRST205"]);
  const missingWorkspaceTable = (code !== null && postgrestMissingCodes.has(code))
    || normalizedMessage.includes("does not exist")
    || (normalizedMessage.includes("workspace_states") && normalizedMessage.includes("not found"));

  if (missingWorkspaceTable) {
    return {
      status: 503,
      payload: {
        code: "workspace_sync_not_configured",
        error: "Cloud sync is not configured in Supabase yet.",
        hint: "Run supabase/migrations/20260413_auth_workspace_sync.sql to create workspace_states and its RLS policies.",
      },
    };
  }

  const missingConfig = normalizedMessage.includes("supabaseurl is required")
    || normalizedMessage.includes("supabasekey is required")
    || normalizedMessage.includes("url is required")
    || normalizedMessage.includes("invalid url")
    || normalizedMessage.includes("your project's url and key are required")
    || normalizedMessage.includes("required to create a supabase client");

  if (missingConfig) {
    return {
      status: 503,
      payload: {
        code: "workspace_sync_not_configured",
        error: "Supabase is not configured. Cloud sync is unavailable.",
        hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file.",
      },
    };
  }

  const missingPolicies = code === "42501"
    || normalizedMessage.includes("row-level security")
    || normalizedMessage.includes("permission denied");

  if (missingPolicies) {
    return {
      status: 503,
      payload: {
        code: "workspace_sync_not_configured",
        error: "Cloud sync is blocked by Supabase permissions.",
        hint: "Run the workspace sync migration so the signed-in user can read and write workspace_states.",
      },
    };
  }

  return {
    status: 500,
    payload: {
      code: "workspace_sync_failed",
      error: fallbackMessage,
    },
  };
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Swallow expected auth errors (expired session, invalid JWT, missing session — typically
    // status 401/403). Re-throw unexpected operational failures so buildWorkspaceSyncError
    // can surface an appropriate 5xx instead of silently converting them into 401s.
    const status = typeof error === "object" && error !== null && "status" in error
      ? (error as { status: unknown }).status
      : undefined;
    if (typeof status === "number" && status !== 401 && status !== 403) throw error;
    return { supabase, user: null };
  }
  if (!data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

export async function GET() {
  if (!hasSupabaseConfig()) {
    return Response.json(
      {
        code: "workspace_sync_not_configured",
        error: "Supabase is not configured. Cloud sync is unavailable.",
        hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file.",
      },
      { status: 503 }
    );
  }

  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      console.error("[GET /api/workspaces/state] No user authenticated");
      return Response.json({ code: "unauthorized", error: "Sign in to load your cloud workspace." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("workspace_states")
      .select("state_json, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/workspaces/state] Supabase error:", error);
      throw error;
    }

    return Response.json({
      state: data?.state_json ?? null,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    console.error("[GET /api/workspaces/state] Exception:", error);
    const { status, payload } = buildWorkspaceSyncError(error, "Failed to load cloud workspace state.");
    return Response.json(payload, { status });
  }
}

export async function PUT(request: Request) {
  if (!hasSupabaseConfig()) {
    return Response.json(
      {
        code: "workspace_sync_not_configured",
        error: "Supabase is not configured. Cloud sync is unavailable.",
        hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file.",
      },
      { status: 503 }
    );
  }

  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to save your cloud workspace." }, { status: 401 });
    }

    const payload = await request.json();
    if (!isStoredStatePayload(payload)) {
      return Response.json({ code: "invalid_workspace_payload", error: "Invalid workspace payload." }, { status: 400 });
    }

    const { error } = await supabase
      .from("workspace_states")
      .upsert(
        {
          user_id: user.id,
          state_json: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    const { status, payload } = buildWorkspaceSyncError(error, "Failed to save cloud workspace state.");
    return Response.json(payload, { status });
  }
}
