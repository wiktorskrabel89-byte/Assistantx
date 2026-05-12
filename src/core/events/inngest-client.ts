/**
 * Inngest client — AssistantX runtime backbone.
 *
 * Inngest is the LOCKED-IN orchestration engine for AssistantX.
 * This is NOT a provisional choice. All durable workflows, agent tasks,
 * approvals, and event-driven execution go through this client.
 *
 * The client degrades gracefully when INNGEST_EVENT_KEY is absent
 * (local dev / CI) so the app remains bootable without credentials.
 */

import { Inngest } from "inngest";

export type InngestEventPayload = {
  name: string;
  data: Record<string, unknown>;
};

export const inngest = new Inngest({
  id: "assistantx",
  /**
   * Explicitly set the mode based on environment:
   * - With INNGEST_SIGNING_KEY: production mode, signatures validated.
   * - Without: dev mode, forwards to local Inngest Dev Server.
   */
  ...(process.env.INNGEST_SIGNING_KEY
    ? { signingKey: process.env.INNGEST_SIGNING_KEY }
    : { baseUrl: process.env.INNGEST_DEV_SERVER_URL ?? "http://localhost:8288" }),
});

/**
 * Thin compatibility shim so existing callers of `inngestClient.send()` still
 * work without a large refactor.  New code should import `inngest` directly.
 */
class InngestClientShim {
  isReady(): boolean {
    return Boolean(process.env.INNGEST_EVENT_KEY);
  }

  async send(events: InngestEventPayload | InngestEventPayload[]): Promise<void> {
    const payload = Array.isArray(events) ? events : [events];
    // Use the real SDK to send — it handles auth, retries, and dev mode.
    await inngest.send(payload as Parameters<typeof inngest.send>[0]);
  }
}

export const inngestClient = new InngestClientShim();
