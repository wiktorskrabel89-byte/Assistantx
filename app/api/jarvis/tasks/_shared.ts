import { createClient as createBearerClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/server";
import type { UserPlan } from "@/lib/ai-config";

type TaskUserClientResult = {
  user: { id: string; is_anonymous?: boolean | null };
  client: SupabaseClient;
  userPlan: UserPlan;
};

export type JarvisTaskCategory = "ai_request" | "system_action";
export type JarvisTaskExecutionMode = "direct" | "multi_agent";

export const JARVIS_SYSTEM_ACTION_ALLOWLIST = [
  "launch_roblox",
  "open_app",
  "system_screenshot",
  "system_sleep",
  "system_file_list",
  "system_file_read",
  "system_file_search",
  "system_status_ping",
  "system_repo_status",
  "system_repo_index",
  "system_ignore_update",
  "system_db_query",
] as const;

export type JarvisSystemAction = (typeof JARVIS_SYSTEM_ACTION_ALLOWLIST)[number];

const VALID_USER_PLANS: UserPlan[] = ["free", "pro", "pro+"];

async function getWorkspaceUserPlan(client: SupabaseClient, userId: string): Promise<UserPlan> {
  try {
    const { data } = await client
      .from("workspace_states")
      .select("state_json")
      .eq("user_id", userId)
      .maybeSingle();
    const rawPlan = (data?.state_json as Record<string, unknown> | null | undefined)?.userPlan;
    if (typeof rawPlan === "string" && VALID_USER_PLANS.includes(rawPlan as UserPlan)) {
      return rawPlan as UserPlan;
    }
  } catch {
    // fall back to free
  }
  return "free";
}

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
    const serverClient = server as unknown as SupabaseClient;
    const userPlan = await getWorkspaceUserPlan(serverClient, user.id);
    return { user, client: serverClient, userPlan };
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

  const userPlan = await getWorkspaceUserPlan(client, user.id);
  return { user, client, userPlan };
}

export function mapTaskStatusToUiLabel(task: {
  status?: string | null;
  category?: string | null;
  action_type?: string | null;
  agent_loop_status?: string | null;
}) {
  if (task.status === "pending") {
    return "Queued on local device...";
  }

  if (task.status === "processing") {
    // Surface multi-agent pipeline step when active
    if (task.agent_loop_status && task.agent_loop_status !== "idle" && task.agent_loop_status !== "done") {
      const labels: Record<string, string> = {
        architect: "🕵️ Architect is analysing the codebase...",
        planner: "🕵️ Architect is analysing the codebase...",
        coder:     "💻 Coder is writing the implementation...",
        developer: "💻 Developer is writing the implementation...",
        tester:    "🧪 Tester is verifying syntax & logic...",
        sandbox:   "📦 Sandbox Runner is executing runtime checks...",
        reviewer:  "🔍 Reviewer is validating code quality...",
        debugger:  "🛠️ Debugger is fixing failing checks...",
        devops:    "⚙️ DevOps is preparing branch/CI changes...",
        release_manager: "🚀 Release Manager is preparing PR summary...",
        critic:    "⚖️ Product Critic is scoring final quality...",
        security:  "🛡️ Security agent is scanning the code...",
        ruflo_queen_planning: "👑 Ruflo Queen is planning the swarm topology...",
        ruflo_worker_execution: "🤖 Ruflo workers are executing delegated tasks...",
        ruflo_memory_sync: "🧠 Ruflo shared memory sync is in progress...",
        ruflo_synthesis: "🧩 Ruflo Queen is synthesizing worker outputs...",
      };
      return labels[task.agent_loop_status] ?? `Multi-agent: ${task.agent_loop_status}...`;
    }

    if (task.category === "system_action") {
      if (task.action_type === "launch_roblox") return "Launching Roblox on local device...";
      if (task.action_type === "open_app") return "Opening app on local device...";
      if (task.action_type === "system_screenshot") return "Capturing screenshot on local device...";
      if (task.action_type === "system_sleep") return "Putting local device to sleep...";
      if (task.action_type === "system_file_list") return "Listing files on local device...";
      if (task.action_type === "system_file_read") return "Reading file on local device...";
      if (task.action_type === "system_file_search") return "Searching local workspace...";
      if (task.action_type === "system_status_ping") return "Reading local device status...";
      if (task.action_type === "system_repo_status") return "Inspecting local repository...";
      if (task.action_type === "system_repo_index") return "Refreshing local repository index...";
      if (task.action_type === "system_ignore_update") return "Updating local ignore rules...";
      if (task.action_type === "system_db_query") return "Running local database query...";
    }
    return "Processing on local device...";
  }

  if (task.status === "pending_approval") {
    return "Awaiting your deployment approval...";
  }

  if (task.status === "approved") {
    return "Deployment approved. Waiting for local executor...";
  }

  if (task.status === "completed") {
    return "Done";
  }

  if (task.status === "failed") {
    return "Local device task failed.";
  }

  return "Waiting for local device...";
}
