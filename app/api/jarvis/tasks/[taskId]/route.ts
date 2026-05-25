import { NextRequest, NextResponse } from "next/server";
import { getTaskUserClient, mapTaskStatusToUiLabel } from "@/app/api/jarvis/tasks/_shared";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const context = await getTaskUserClient(request);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const trimmedTaskId = taskId.trim();
  if (!trimmedTaskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  const { data, error } = await context.client
    .from("ai_tasks")
    .select("task_id, user_id, status, prompt, response, output, error, provider, model, routing, category, action_type, payload, created_at, started_at, completed_at, device_id, server_id, task_type, execution_mode, is_agent_generated, agent_loop_status, agent_logs, agent_attempt, critic_score, quota_remaining, quota_max, token_estimate_k")
    .eq("task_id", trimmedTaskId)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({
    taskId: data.task_id,
    task: data,
    runPhase: data.agent_loop_status ?? null,
    uiStatus: mapTaskStatusToUiLabel(data),
  });
}
