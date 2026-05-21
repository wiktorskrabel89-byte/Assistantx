import { createClient as createBearerClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/server";

type TaskUserClientResult = {
  user: { id: string; is_anonymous?: boolean | null };
  client: SupabaseClient;
};

export type JarvisTaskCategory = "ai_request" | "system_action";

export const JARVIS_SYSTEM_ACTION_ALLOWLIST = [
  "launch_roblox",
  "system_file_list",
  "system_status_ping",
] as const;

export type JarvisSystemAction = (typeof JARVIS_SYSTEM_ACTION_ALLOWLIST)[number];

export async function getTaskUserClient(request: Request): Promise<TaskUserClientResult | null> {
  const server = await createServerClient();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const authResult = token
    ? await server.auth.getUser(token)
    : await server.auth.getUser();

  const user = authResult.data.user;
  if (authResult.error || !user) {
    return null;
  }

  if (!token) {
    return { user, client: server as unknown as SupabaseClient };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase is not configured.");
  }

  const client = createBearerClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  return { user, client };
}

export function mapTaskStatusToUiLabel(task: {
  status?: string | null;
  category?: string | null;
  action_type?: string | null;
}) {
  if (task.status === "pending") {
    return "Queued on local device...";
  }

  if (task.status === "pending_approval") {
    return "Waiting for your approval on this device action...";
  }

  if (task.status === "approved") {
    return "Approved — waiting for local device execution...";
  }

  if (task.status === "rejected") {
    return "Local device action was rejected.";
  }

  if (task.status === "processing") {
    if (task.category === "system_action") {
      if (task.action_type === "launch_roblox") return "Launching Roblox on local device...";
      if (task.action_type === "system_file_list") return "Listing files on local device...";
      if (task.action_type === "system_status_ping") return "Reading local device status...";
    }
    return "Processing on local device...";
  }

  if (task.status === "completed") {
    return "Done";
  }

  if (task.status === "failed") {
    return "Local device task failed.";
  }

  return "Waiting for local device...";
}
