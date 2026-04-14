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

  const missingWorkspaceTable = code === "42P01"
    || code === "PGRST205"
    || (normalizedMessage.includes("workspace_states") && (normalizedMessage.includes("does not exist") || normalizedMessage.includes("not found")));

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
  if (error) throw error;
  if (!data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to load your cloud workspace." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("workspace_states")
      .select("state_json, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    return Response.json({
      state: data?.state_json ?? null,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    const { status, payload } = buildWorkspaceSyncError(error, "Failed to load cloud workspace state.");
    return Response.json(payload, { status });
  }
}

export async function PUT(request: Request) {
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