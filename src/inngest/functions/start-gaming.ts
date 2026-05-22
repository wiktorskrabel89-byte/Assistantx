/**
 * Inngest Function: start-gaming
 *
 * Sprint-1 workflow skeleton:
 *   wake -> wait online -> verify runtime -> launch apps
 *
 * This intentionally keeps launch steps as placeholders while establishing the
 * durable checkpointed execution path and run-state transitions.
 */

import { inngest } from "@/src/core/events/inngest-client";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";

export type StartGamingRequestedEvent = {
  name: typeof RUNTIME_EVENT_TYPES.START_GAMING_REQUESTED;
  data: {
    executionId: string;
    workflow: string;
    input: Record<string, unknown>;
    actorUserId: string | null;
    organizationId: string | null;
    timestamp: string;
    payload: Record<string, unknown>;
  };
};

export const startGamingFunction = inngest.createFunction(
  {
    id: "workflow-start-gaming",
    name: "Start Gaming Workflow",
    triggers: [{ event: RUNTIME_EVENT_TYPES.START_GAMING_REQUESTED }],
    retries: 2,
    cancelOn: [{ event: RUNTIME_EVENT_TYPES.WORKFLOW_CANCELLED, match: "data.executionId" }],
  },
  async ({ event, step }) => {
    const { executionId, actorUserId, organizationId, input } = event.data;

    await step.run("mark-running", async () => {
      const { updateWorkflowRun } = await import("@/src/core/persistence/runtime-db");
      await updateWorkflowRun(executionId, { status: "running" });
    });

    await step.run("checkpoint-wake", async () => {
      const targetDeviceId = typeof input.targetDeviceId === "string" ? input.targetDeviceId : null;
      const {
        listDeviceWakeCandidates,
        upsertWorkflowCheckpoint,
        updateDeviceWakeResult,
      } = await import("@/src/core/persistence/runtime-db");
      const { executeWakeChain } = await import("@/src/core/wake/coordinator");

      if (!targetDeviceId) {
        await upsertWorkflowCheckpoint({
          execution_id: executionId,
          workflow_id: "start_gaming",
          user_id: actorUserId,
          organization_id: organizationId,
          step_key: "wake_target_device",
          status: "failed",
          payload: {
            action: "wake_on_lan",
            reason: "missing_target_device_id",
          },
          error: "targetDeviceId is required for wake flow.",
        });
        throw new Error("targetDeviceId is required.");
      }

      const candidates = await listDeviceWakeCandidates({ deviceId: targetDeviceId });
      const candidate = candidates[0];
      if (!candidate) {
        await upsertWorkflowCheckpoint({
          execution_id: executionId,
          workflow_id: "start_gaming",
          user_id: actorUserId,
          organization_id: organizationId,
          step_key: "wake_target_device",
          status: "failed",
          payload: {
            action: "wake_on_lan",
            reason: "no_wake_candidate",
          },
          error: "No wake candidate available.",
        });
        throw new Error("No wake candidate available for target device.");
      }

      const wakeResult = await executeWakeChain({
        candidate: {
          deviceId: targetDeviceId,
          macAddress: candidate.mac_address,
          ipv6: candidate.ipv6,
          udpPort: candidate.udp_port,
          provider: candidate.provider,
          eligibleForWake: candidate.eligible_for_wake,
          lastSeenAt: candidate.last_seen_at,
        },
      });

      const persistedMethod = wakeResult.method ?? null;
      await updateDeviceWakeResult({
        deviceId: targetDeviceId,
        method: persistedMethod,
        success: wakeResult.ok,
      }).catch(() => null);

      await upsertWorkflowCheckpoint({
        execution_id: executionId,
        workflow_id: "start_gaming",
        user_id: actorUserId,
        organization_id: organizationId,
        step_key: "wake_target_device",
        status: wakeResult.ok ? "completed" : "failed",
        payload: {
          action: "wake_chain",
          attempts: wakeResult.attempts,
          selectedMethod: wakeResult.method,
        },
        error: wakeResult.ok ? null : "Wake chain failed for all methods.",
      });

      if (!wakeResult.ok) {
        throw new Error("Wake chain failed for target device.");
      }
    });

    await step.run("wait-for-runtime-online", async () => {
      const { getDeviceById } = await import("@/src/core/persistence/runtime-db");
      const targetDeviceId = typeof input.targetDeviceId === "string" ? input.targetDeviceId : null;
      if (!targetDeviceId) {
        return { observedOnline: false, reason: "no_target_device_id" };
      }

      const maxAttempts = 10;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const target = await getDeviceById(targetDeviceId);
        if (target?.last_seen_at && Date.now() - new Date(target.last_seen_at).getTime() < 30_000) {
          return { observedOnline: true, attempt };
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return { observedOnline: false, reason: "timeout_waiting_for_presence" };
    });

    await step.run("checkpoint-runtime-ready", async () => {
      const { upsertWorkflowCheckpoint } = await import("@/src/core/persistence/runtime-db");
      await upsertWorkflowCheckpoint({
        execution_id: executionId,
        workflow_id: "start_gaming",
        user_id: actorUserId,
        organization_id: organizationId,
        step_key: "runtime_authenticated",
        status: "completed",
        payload: {
          action: "runtime_online_check",
          note: "Presence and auth verification hooks land in next iteration.",
        },
      });
    });

    const launchApps = Array.isArray(input.apps)
      ? (input.apps as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 10)
      : ["Discord", "Roblox", "Spotify"];

    await step.run("checkpoint-launch-sequence", async () => {
      const { upsertWorkflowCheckpoint } = await import("@/src/core/persistence/runtime-db");
      await upsertWorkflowCheckpoint({
        execution_id: executionId,
        workflow_id: "start_gaming",
        user_id: actorUserId,
        organization_id: organizationId,
        step_key: "launch_apps",
        status: "completed",
        payload: {
          action: "launch_sequence",
          apps: launchApps,
          note: "Execution is delegated to desktop runtime once command routing is wired.",
        },
      });
    });

    await step.run("complete-run", async () => {
      const { updateWorkflowRun } = await import("@/src/core/persistence/runtime-db");
      await updateWorkflowRun(executionId, {
        status: "completed",
        output: {
          workflow: "start_gaming",
          state: "skeleton_completed",
          plannedApps: launchApps,
          checkpoints: [
            "wake_target_device",
            "runtime_authenticated",
            "launch_apps",
          ],
        },
        completed_at: new Date().toISOString(),
      });
    });

    await step.run("emit-workflow-completed", async () => {
      await inngest.send({
        name: RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED,
        data: {
          executionId,
          workflow: "start_gaming",
          actorUserId,
          organizationId,
          payload: { workflow: "start_gaming", skeleton: true },
          timestamp: new Date().toISOString(),
        },
      });
    });

    return { executionId, workflow: "start_gaming", launchApps };
  },
);
