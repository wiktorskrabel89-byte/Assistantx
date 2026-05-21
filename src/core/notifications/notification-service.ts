/**
 * Notification Service — cloud-first multi-tenant notification writer.
 *
 * Writes event-driven notifications to the Supabase `notifications` table.
 * Every row is keyed by `user_id` and protected by RLS so tenants never see
 * each other's notifications.
 *
 * Idempotency: when `dedupKey` is provided the function inserts the row and
 * silently absorbs a unique-constraint violation (Postgres error 23505).  The
 * unique partial index `notifications_dedup_key_idx` ensures that the same
 * execution event never produces a duplicate notification even when Inngest
 * retries the function.
 *
 * Delivery model (cloud-first):
 *   - Always writes to Supabase.  The realtime hook in useNotifications picks
 *     it up and updates the UI without a page refresh.
 *   - `speech_text` is carried in the row and consumed client-side (browser
 *     TTS / Electron sidecar).  The server never synthesises audio.
 *   - Web Push is handled by the existing push-subscription infrastructure
 *     and is out of scope for this module.
 */

export type NotificationSeverity = "info" | "success" | "warning";

export type NotificationSource = "inngest" | "runtime-facade" | "worker";

export type NotificationWritePayload = {
  /** Supabase user UUID — required for RLS. */
  userId: string;
  organizationId?: string | null;
  kind: NotificationSeverity;
  title: string;
  body: string;
  /** Who emitted the notification. */
  source: NotificationSource;
  /** workflow_runs.execution_id — links the notification to a run. */
  executionId?: string | null;
  /** agent_tasks.task_id — links the notification to a sub-task. */
  taskId?: string | null;
  /** Relative URL for the UI to navigate to the run or task detail. */
  deepLink?: string | null;
  /** Arbitrary structured context stored alongside the notification. */
  metadata?: Record<string, unknown>;
  /**
   * Short text for client-side TTS.  Null means "silent" — the event is
   * recorded in the inbox but should not be spoken aloud.
   */
  speechText?: string | null;
  /**
   * Idempotency key.  Convention: `${executionId}:${EVENT_TYPE}`.
   * When set, a duplicate insert for the same (user_id, dedup_key) pair is
   * silently ignored (unique partial index + 23505 absorption).
   */
  dedupKey?: string | null;
};

/**
 * Write a notification row to Supabase.
 *
 * Idempotent when `dedupKey` is provided — a second write with the same
 * (userId, dedupKey) pair is silently ignored so Inngest retries are safe.
 */
export async function writeNotification(
  payload: NotificationWritePayload,
): Promise<void> {
  const { createClient } = await import("@/lib/server");
  const supabase = await createClient();

  const row = {
    user_id: payload.userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    source: payload.source,
    execution_id: payload.executionId ?? null,
    task_id: payload.taskId ?? null,
    deep_link: payload.deepLink ?? null,
    metadata: payload.metadata ?? {},
    speech_text: payload.speechText ?? null,
    dedup_key: payload.dedupKey ?? null,
    read: false,
  };

  const { error } = await supabase.from("notifications").insert(row as never);

  if (!error) return;

  // Postgres unique-constraint violation — this is an idempotent duplicate.
  // Silently discard so Inngest retry loops don't surface spurious errors.
  const pgCode = (error as { code?: string }).code;
  if (pgCode === "23505") return;

  throw new Error(`writeNotification: ${error.message}`);
}
