import { PLATFORM_DECISIONS } from "@/src/core/config/platform";
import { inngestClient } from "@/src/core/events/inngest-client";
import type { RuntimeEvent } from "@/src/core/events/types";

export type EventBus = {
  publish: (event: RuntimeEvent) => Promise<void>;
};

class InMemoryEventBus implements EventBus {
  // Phase-1 fallback when Inngest wiring is not yet activated.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async publish(_event: RuntimeEvent): Promise<void> {
    // Temporary no-op sink until the Inngest transport is wired.
    return;
  }
}

class InngestEventBus implements EventBus {
  // Routes runtime events to Inngest. Gracefully degrades when
  // INNGEST_EVENT_KEY is absent so development and CI remain unaffected.
  async publish(event: RuntimeEvent): Promise<void> {
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

export function createEventBus(): EventBus {
  if (PLATFORM_DECISIONS.workflowOrchestrator === "inngest") {
    return new InngestEventBus();
  }
  return new InMemoryEventBus();
}
