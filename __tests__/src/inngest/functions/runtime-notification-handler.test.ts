/**
 * Unit tests for runtime-notification-handler
 *
 * Verifies that each terminal runtime event type produces a correctly-shaped
 * notification write, and that events without a userId are silently skipped.
 *
 * The notification-service module is mocked so no real Supabase calls are made.
 */

jest.mock("@/src/core/notifications/notification-service", () => ({
  writeNotification: jest.fn().mockResolvedValue(undefined),
}));

// Mock the inngest client so createFunction works without credentials.
jest.mock("@/src/core/events/inngest-client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      handler: (ctx: unknown) => Promise<unknown>
    ) => ({ __handler: handler }),
    send: jest.fn().mockResolvedValue(undefined),
  },
  inngestClient: {
    isReady: () => false,
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { writeNotification } from "@/src/core/notifications/notification-service";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";

// Dynamically import after mocks are in place.
// The function itself is the Inngest-registered object; we call its internal
// handler via the __handler property attached by the mock above.
import { runtimeNotificationHandlerFunction } from "@/src/inngest/functions/runtime-notification-handler";

const mockWrite = writeNotification as jest.MockedFunction<typeof writeNotification>;

// Helper: simulate Inngest calling the function with an event.
async function invokeHandler(eventName: string, data: Record<string, unknown>) {
  const fn = runtimeNotificationHandlerFunction as unknown as {
    __handler: (ctx: {
      event: { name: string; data: unknown };
      step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
    }) => Promise<unknown>;
  };

  // Simulate step.run by immediately calling the callback.
  const step = {
    run: async (_name: string, cb: () => Promise<unknown>) => cb(),
  };

  return fn.__handler({ event: { name: eventName, data }, step });
}

describe("runtimeNotificationHandlerFunction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── WORKFLOW_COMPLETED ────────────────────────────────────────────────────

  it("writes a success notification for WORKFLOW_COMPLETED", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED, {
      executionId: "exec-1",
      workflow: "my-workflow",
      actorUserId: "user-a",
      organizationId: null,
      timestamp: new Date().toISOString(),
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        kind: "success",
        source: "inngest",
        dedupKey: "exec-1:WORKFLOW_COMPLETED",
        executionId: "exec-1",
        speechText: expect.stringContaining("my-workflow"),
      })
    );
  });

  it("skips WORKFLOW_COMPLETED when actorUserId is null", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED, {
      executionId: "exec-2",
      actorUserId: null,
      timestamp: new Date().toISOString(),
    });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  // ── WORKFLOW_FAILED ───────────────────────────────────────────────────────

  it("writes a warning notification for WORKFLOW_FAILED", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.WORKFLOW_FAILED, {
      executionId: "exec-3",
      workflow: "fail-flow",
      actorUserId: "user-b",
      organizationId: "org-1",
      payload: { error: "tool policy denied" },
      timestamp: new Date().toISOString(),
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-b",
        kind: "warning",
        dedupKey: "exec-3:WORKFLOW_FAILED",
        speechText: expect.stringContaining("fail-flow"),
        metadata: expect.objectContaining({ error: "tool policy denied" }),
      })
    );
  });

  // ── WORKFLOW_CANCELLED ────────────────────────────────────────────────────

  it("writes an info notification with null speechText for WORKFLOW_CANCELLED", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.WORKFLOW_CANCELLED, {
      executionId: "exec-4",
      workflow: "cancel-flow",
      actorUserId: "user-c",
      timestamp: new Date().toISOString(),
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-c",
        kind: "info",
        speechText: null,
        dedupKey: "exec-4:WORKFLOW_CANCELLED",
      })
    );
  });

  // ── TASK_COMPLETED ────────────────────────────────────────────────────────

  it("writes a silent info notification for TASK_COMPLETED", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.TASK_COMPLETED, {
      taskId: "task-99",
      executionId: "exec-5",
      role: "coder",
      summary: "Wrote tests.",
      actorUserId: "user-d",
      timestamp: new Date().toISOString(),
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-d",
        kind: "info",
        speechText: null,
        taskId: "task-99",
        dedupKey: "task-99:TASK_COMPLETED",
        body: expect.stringContaining("coder"),
      })
    );
  });

  it("skips TASK_COMPLETED when actorUserId is null", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.TASK_COMPLETED, {
      taskId: "task-x",
      executionId: "exec-6",
      actorUserId: null,
      timestamp: new Date().toISOString(),
    });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  // ── APPROVAL_REQUESTED ────────────────────────────────────────────────────

  it("writes a warning+speech notification for APPROVAL_REQUESTED", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED, {
      executionId: "exec-7",
      approvalId: "appr-1",
      toolId: "file.delete",
      requestedBy: "user-e",
      actorUserId: "user-e",
      reason: "Deletes production data",
      timestamp: new Date().toISOString(),
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-e",
        kind: "warning",
        dedupKey: "appr-1:APPROVAL_REQUESTED",
        speechText: expect.stringContaining("file.delete"),
        metadata: expect.objectContaining({ approvalId: "appr-1" }),
      })
    );
  });

  it("falls back to requestedBy when actorUserId is absent", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED, {
      executionId: "exec-8",
      approvalId: "appr-2",
      requestedBy: "user-f",
      actorUserId: null,
      timestamp: new Date().toISOString(),
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-f" })
    );
  });

  it("skips APPROVAL_REQUESTED when both actorUserId and requestedBy are absent", async () => {
    await invokeHandler(RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED, {
      executionId: "exec-9",
      approvalId: "appr-3",
      actorUserId: null,
      timestamp: new Date().toISOString(),
    });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  // ── Unknown event ─────────────────────────────────────────────────────────

  it("does not write for an unrecognised event type", async () => {
    await invokeHandler("SOME_UNKNOWN_EVENT", {
      actorUserId: "user-z",
      executionId: "exec-z",
      timestamp: new Date().toISOString(),
    });
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
