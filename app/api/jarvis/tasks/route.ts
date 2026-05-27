import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import {
  getTaskUserClient,
  JARVIS_SYSTEM_ACTION_ALLOWLIST,
  type JarvisTaskCategory,
  type JarvisTaskExecutionMode,
} from "@/app/api/jarvis/tasks/_shared";

export const runtime = "nodejs";
export const maxDuration = 30;

const taskSchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required").max(8000, "prompt is too long"),
  category: z.enum(["ai_request", "system_action"]).default("ai_request"),
  actionType: z.string().trim().max(120).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  deviceId: z.string().uuid().optional(),
  preferMultiAgent: z.boolean().optional(),
  serverId: z.string().uuid().optional(),
});

const PREMIUM_PLANS = new Set(["pro", "pro+"] as const);
const MULTI_AGENT_INTENT_PATTERN = /\b(deploy|release|rollout|refactor|migration|migrate|codebase|pipeline|ci\/cd|ci|cd|infra|devops|production|prod|server fix|incident)\b/i;
const DEPLOY_INTENT_PATTERN = /\b(deploy|release|rollout|production|prod|wdroż|wdróż|deployuj)\b/i;

function resolveTaskType(prompt: string, category: JarvisTaskCategory) {
  if (category === "system_action") return "sysops_command";
  if (DEPLOY_INTENT_PATTERN.test(prompt)) return "deploy_request";
  return "ai_request";
}

export async function POST(request: NextRequest) {
  try {
    const context = await getTaskUserClient(request);
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = taskSchema.parse(await request.json().catch(() => ({})));
    const prompt = body.prompt.trim();
    const category = body.category as JarvisTaskCategory;
    const actionType = body.actionType?.trim() || null;
    const userIsPremium = PREMIUM_PLANS.has(context.userPlan as "pro" | "pro+");
    const inferredMultiAgentIntent = category === "ai_request" && MULTI_AGENT_INTENT_PATTERN.test(prompt);
    const preferMultiAgent = Boolean(body.preferMultiAgent ?? inferredMultiAgentIntent);
    const executionMode: JarvisTaskExecutionMode = (category === "ai_request" && userIsPremium && preferMultiAgent)
      ? "multi_agent"
      : "direct";
    const taskType = resolveTaskType(prompt, category);

    if (category === "system_action" && !actionType) {
      return NextResponse.json({ error: "actionType is required for system_action tasks." }, { status: 400 });
    }

    if (category === "system_action" && actionType && !JARVIS_SYSTEM_ACTION_ALLOWLIST.includes(actionType as typeof JARVIS_SYSTEM_ACTION_ALLOWLIST[number])) {
      return NextResponse.json({ error: "Unsupported system action." }, { status: 400 });
    }

    if (category === "ai_request" && actionType) {
      return NextResponse.json({ error: "actionType is only allowed for system_action tasks." }, { status: 400 });
    }

    if (body.deviceId) {
      const ownedDevice = await resolveOwnedDevice({ userId: context.user.id, deviceId: body.deviceId });
      if (!ownedDevice) {
        return NextResponse.json({ error: "Device not found." }, { status: 404 });
      }
      if (ownedDevice.trust_state !== "trusted") {
        return NextResponse.json({ error: "Device is not trusted for local tasks." }, { status: 403 });
      }
    }

    const taskId = randomUUID();
    const { data, error } = await context.client
      .from("ai_tasks")
      .insert({
        task_id: taskId,
        user_id: context.user.id,
        prompt: body.prompt,
        status: "pending",
        routing: "local",
        category,
        action_type: actionType,
        payload: body.payload,
        device_id: body.deviceId ?? null,
        server_id: body.serverId ?? null,
        task_type: taskType,
        output: null,
        execution_mode: executionMode,
        is_agent_generated: executionMode === "multi_agent",
      })
      .select("task_id, status, category, action_type, device_id, server_id, task_type, execution_mode, is_agent_generated, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      taskId: data.task_id,
      task: data,
      execution: {
        mode: data.execution_mode,
        requestedMultiAgent: preferMultiAgent,
        premiumRequired: preferMultiAgent && !userIsPremium,
        soloDeveloperMode: !userIsPremium,
      },
    }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to enqueue task.",
    }, { status: 500 });
  }
}
