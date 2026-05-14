import { createClient } from "@/lib/server";
import { hasSupabaseConfig, isSupabaseClientSetupMessage, workspaceSyncNotConfiguredResponse } from "@/lib/supabase-config";
import { getAuthenticatedUserForSync } from "@/app/lib/sync-auth";
import {
  mergeJarvisIntoWorkspaceState,
  projectWorkspaceStateToJarvisCloud,
} from "@/app/lib/jarvis-sync";

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

  const missingConfig = isSupabaseClientSetupMessage(normalizedMessage);

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

function isJarvisColumnMissingError(error: unknown) {
  const code = getErrorProperty(error, "code");
  const message = (getErrorProperty(error, "message") ?? "").toLowerCase();
  return code === "PGRST204"
    || code === "42703"
    || (message.includes("jarvis_cloud_memory") && message.includes("column"));
}

async function getAuthenticatedUser(request?: Request) {
  const supabase = await createClient();
  const { user, error } = await getAuthenticatedUserForSync(supabase, request);
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
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

export async function GET(request?: Request) {
  if (!hasSupabaseConfig()) {
    return workspaceSyncNotConfiguredResponse();
  }

  try {
    const { supabase, user } = await getAuthenticatedUser(request);
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

    let jarvisState: unknown = null;
    let jarvisSelect: {
      data: Record<string, unknown> | null;
      error: unknown;
    } | null = null;
    try {
      const result = await supabase
        .from("jarvis_cloud_memory")
        .select("preferences, history, tasks, schedules, voice_settings, sync_metadata, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      jarvisSelect = {
        data: result.data as Record<string, unknown> | null,
        error: result.error,
      };
    } catch {
      jarvisSelect = null;
    }

    if (jarvisSelect && !jarvisSelect.error && jarvisSelect.data) {
      jarvisState = {
        preferences: jarvisSelect.data.preferences ?? {},
        history: jarvisSelect.data.history ?? [],
        tasks: (jarvisSelect.data as Record<string, unknown>).tasks ?? [],
        schedules: (jarvisSelect.data as Record<string, unknown>).schedules ?? [],
        voiceSettings: (jarvisSelect.data as Record<string, unknown>).voice_settings ?? {},
        syncMetadata: (jarvisSelect.data as Record<string, unknown>).sync_metadata ?? {},
      };
    } else if (jarvisSelect?.error && !isJarvisColumnMissingError(jarvisSelect.error)) {
      console.error("[GET /api/workspaces/state] jarvis_cloud_memory read error:", jarvisSelect.error);
    }

    const mergedState = data?.state_json
      ? mergeJarvisIntoWorkspaceState(data.state_json, jarvisState)
      : null;

    return Response.json({
      state: mergedState ?? data?.state_json ?? null,
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
    return workspaceSyncNotConfiguredResponse();
  }

  try {
    const { supabase, user } = await getAuthenticatedUser(request);
    if (!user) {
      return Response.json({ code: "unauthorized", error: "Sign in to save your cloud workspace." }, { status: 401 });
    }

    const payload = await request.json();
    if (!isStoredStatePayload(payload)) {
      return Response.json({ code: "invalid_workspace_payload", error: "Invalid workspace payload." }, { status: 400 });
    }

    const mergedPayload = mergeJarvisIntoWorkspaceState(payload, null);
    const { error } = await supabase
      .from("workspace_states")
      .upsert(
        {
          user_id: user.id,
          state_json: mergedPayload,
          sync_metadata: {
            source: "web",
            updatedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;

    const projection = projectWorkspaceStateToJarvisCloud(mergedPayload);
    if (!projection.syncOptions.localOnlyMode && !projection.syncOptions.pauseSync) {
      const jarvisUpsert = await supabase
        .from("jarvis_cloud_memory")
        .upsert(
          {
            user_id: user.id,
            preferences: projection.preferences,
            history: projection.history,
            tasks: projection.tasks,
            schedules: projection.schedules,
            voice_settings: projection.voiceSettings,
            sync_metadata: projection.syncMetadata,
            schema_version: 1,
            last_source: "web",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (jarvisUpsert.error && isJarvisColumnMissingError(jarvisUpsert.error)) {
        await supabase
          .from("jarvis_cloud_memory")
          .upsert(
            {
              user_id: user.id,
              preferences: projection.preferences,
              history: projection.history,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
      } else if (jarvisUpsert.error) {
        console.error("[PUT /api/workspaces/state] jarvis_cloud_memory upsert error:", jarvisUpsert.error);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const { status, payload } = buildWorkspaceSyncError(error, "Failed to save cloud workspace state.");
    return Response.json(payload, { status });
  }
}
