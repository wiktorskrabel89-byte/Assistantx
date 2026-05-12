// Inngest client boundary.
// In Phase 2 the client is a typed stub so the runtime can safely import it
// before the INNGEST_EVENT_KEY environment variable is available in CI.
// Replace the stub with the real @inngest/next client when INNGEST_EVENT_KEY is set.

export type InngestEventPayload = {
  name: string;
  data: Record<string, unknown>;
};

class InngestClientStub {
  private readonly ready: boolean;

  constructor() {
    this.ready = Boolean(process.env.INNGEST_EVENT_KEY);
  }

  isReady(): boolean {
    return this.ready;
  }

  async send(events: InngestEventPayload | InngestEventPayload[]): Promise<void> {
    if (!this.ready) {
      // No INNGEST_EVENT_KEY is set — events are intentionally dropped.
      // This is expected behavior in local development and CI environments.
      // Set INNGEST_EVENT_KEY to enable event dispatch.
      return;
    }

    const payload = Array.isArray(events) ? events : [events];
    const key = process.env.INNGEST_EVENT_KEY ?? "";
    const baseUrl = process.env.INNGEST_BASE_URL ?? "https://inn.gs/e";

    await fetch(`${baseUrl}/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}

export const inngestClient = new InngestClientStub();
