import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/server";
import { getAuthenticatedUser, resolveOwnedDevice } from "@/app/api/jarvis/devices/_shared";
import { FEATURE_FLAGS } from "@/src/core/config/feature-flags";
import { insertAuditLog } from "@/src/core/persistence/runtime-db";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_ACTIONS = new Set(["launch_roblox", "system_file_list"]);

function sanitizePayload(actionType: string, payload: Record<string, unknown>) {
  if (actionType === "launch_roblox") {
    const rawGameId = String(payload.gameId ?? payload.game_id ?? "185655149").trim();
    if (!/^\d{3,20}$/.test(rawGameId)) {
      throw new Error("Invalid Roblox gameId.");
    }
    return { game_id: rawGameId };
  }

  if (actionType === "system_file_list") {
    const rawPath = String(payload.path ?? ".").trim();
    if (!rawPath || rawPath.length > 240) {
      throw new Error("Invalid path.");
    }
    return { path: rawPath };
  }

  throw new Error("Unsupported action type.");
}

export async function POST(request: Request) {
  if (!FEATURE_FLAGS.systemActionsBetaEnabled) {
    return Response.json({ error: "System actions beta is disabled." }, { status: 403 });
  }

  const { user } = await getAuthenticatedUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const profile = await supabase
    .from("user_profiles")
    .select("is_beta_tester")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile.data?.is_beta_tester) {
    return Response.json({ error: "System actions are limited to beta testers." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const actionType = typeof body.actionType === "string" ? body.actionType.trim() : "";
  if (!deviceId || !actionType) {
    return Response.json({ error: "deviceId and actionType are required." }, { status: 400 });
  }
  if (!ALLOWED_ACTIONS.has(actionType)) {
    return Response.json({ error: "Action type is not allowed." }, { status: 400 });
  }

  const device = await resolveOwnedDevice({ userId: user.id, deviceId });
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }
  if (device.trust_state !== "trusted") {
    return Response.json({ error: "Device must be trusted before queueing system actions." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = sanitizePayload(actionType, (body.payload && typeof body.payload === "object" ? body.payload : {}) as Record<string, unknown>);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid payload." }, { status: 400 });
  }

  const taskId = randomUUID();
  const { error } = await supabase.from("ai_tasks").insert({
    task_id: taskId,
    user_id: user.id,
    device_id: deviceId,
    prompt: `system_action:${actionType}`,
    status: "pending",
    routing: "local",
    category: "system_action",
    action_type: actionType,
    payload,
    priority: 10,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  try {
    await insertAuditLog({
      event_type: "system_action_queued",
      user_id: user.id,
      organization_id: device.organization_id ?? null,
      target_type: "device",
      target_id: deviceId,
      payload: {
        taskId,
        actionType,
      },
    });
  } catch {
    // best effort
  }

  return Response.json({
    ok: true,
    taskId,
    actionType,
    deviceId,
  });
}
