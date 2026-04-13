import { createClient } from "@/lib/server";

export const maxDuration = 60;

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
      return Response.json({ error: "Unauthorized" }, { status: 401 });
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
    const message = error instanceof Error ? error.message : "Failed to load cloud workspace state.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    if (!isStoredStatePayload(payload)) {
      return Response.json({ error: "Invalid workspace payload." }, { status: 400 });
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
    const message = error instanceof Error ? error.message : "Failed to save cloud workspace state.";
    return Response.json({ error: message }, { status: 500 });
  }
}