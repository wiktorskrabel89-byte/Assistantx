import { PLATFORM_DECISIONS } from "@/src/core/config/platform";
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
  // Intentionally no direct Inngest SDK dependency yet.
  // This boundary keeps route handlers runtime-agnostic and migration-safe.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async publish(_event: RuntimeEvent): Promise<void> {
    // Temporary adapter stub. This method is the single place where
    // Inngest dispatch will be implemented in the next migration step.
    return;
  }
}

export function createEventBus(): EventBus {
  if (PLATFORM_DECISIONS.workflowOrchestrator === "inngest") {
    return new InngestEventBus();
  }
  return new InMemoryEventBus();
}
