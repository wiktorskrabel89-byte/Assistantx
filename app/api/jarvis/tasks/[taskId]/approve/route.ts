import { NextRequest, NextResponse } from "next/server";
import { getTaskUserClient, mapTaskStatusToUiLabel } from "@/app/api/jarvis/tasks/_shared";

export const runtime = "nodejs";
export const maxDuration = 30;

async function applyDecision(
  request: NextRequest,
  params: Promise<{ taskId: string }>,
  decision: "approved" | "rejected",
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

  const { data, error } = await context.client.rpc("approve_ai_task", {
    p_task_id: trimmedTaskId,
    p_user_id: context.user.id,
    p_decision: decision,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const task = Array.isArray(data) ? data[0] : data;
  if (!task) {
    return NextResponse.json({ error: "Task not found or is no longer awaiting approval." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    task,
    uiStatus: mapTaskStatusToUiLabel(task),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  return applyDecision(request, params, "approved");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  return applyDecision(request, params, "rejected");
}
