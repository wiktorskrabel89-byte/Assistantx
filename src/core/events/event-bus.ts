import { inngestClient } from "@/src/core/events/inngest-client";
import type { RuntimeEvent } from "@/src/core/events/types";

export type EventBus = {
  publish: (event: RuntimeEvent) => Promise<void>;
};

class InngestEventBus implements EventBus {
  // Routes runtime events to Inngest and persists to the replayable events
  // ledger.  Gracefully degrades when INNGEST_EVENT_KEY is absent so
  // development and CI remain unaffected.
  async publish(event: RuntimeEvent): Promise<void> {
    // Persist to the replayable runtime_events ledger (best-effort).
    try {
      const { persistRuntimeEvent } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await persistRuntimeEvent({
        event_type: event.type,
        user_id: event.actorUserId ?? null,
        organization_id: event.organizationId ?? null,
        execution_id: event.executionId ?? null,
        payload: event.payload,
      });
    } catch {
      // Observability write failure must never block the main runtime path.
    }

    // Forward to Inngest for durable orchestration when key is configured.
    await inngestClient.send({
      name: event.type,
      data: {
        timestamp: event.timestamp,
        actorUserId: event.actorUserId ?? null,
        organizationId: event.organizationId ?? null,
        executionId: event.executionId ?? null,
        payload: event.payload,
      },
    });
  }
}

// Inngest is the locked-in orchestration backbone — no fallback.
export function createEventBus(): EventBus {
  return new InngestEventBus();
}
