import { randomUUID } from "node:crypto";

export type TrajectoryAttemptEvent = {
  executionId: string;
  workflowId: string;
  stage: string;
  attempt: number;
  success: boolean;
  score?: number | null;
  actorUserId?: string | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function ingestTrajectoryAttempt(event: TrajectoryAttemptEvent): Promise<void> {
  const { insertTrainingTrajectory, insertAuditLog } = await import("@/src/core/persistence/runtime-db");
  await insertTrainingTrajectory({
    id: randomUUID(),
    execution_id: event.executionId,
    workflow_id: event.workflowId,
    stage: event.stage,
    attempt: event.attempt,
    success: event.success,
    score: event.score ?? null,
    user_id: event.actorUserId ?? null,
    organization_id: event.organizationId ?? null,
    source: "runtime",
    metadata: event.metadata ?? {},
  }).catch(async () => {
    await insertAuditLog({
      event_type: "trajectory_attempt",
      user_id: event.actorUserId ?? null,
      organization_id: event.organizationId ?? null,
      execution_id: event.executionId,
      target_type: "training_dataset",
      target_id: randomUUID(),
      payload: {
        workflowId: event.workflowId,
        stage: event.stage,
        attempt: event.attempt,
        success: event.success,
        score: event.score ?? null,
        metadata: event.metadata ?? {},
      },
    });
  });
}
