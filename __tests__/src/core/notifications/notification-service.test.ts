/**
 * Unit tests for notification-service.writeNotification
 *
 * Mocks the Supabase server client and verifies:
 *   - correct row shape is inserted
 *   - unique-constraint violations (code 23505) are silently absorbed
 *   - other DB errors are rethrown
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { writeNotification } from "@/src/core/notifications/notification-service";
import { createClient } from "@/lib/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function buildSupabaseMock(insertResult: { error: unknown }) {
  const insertMock = jest.fn().mockResolvedValue(insertResult);
  const fromMock = jest.fn().mockReturnValue({ insert: insertMock });
  return { supabase: { from: fromMock }, insertMock, fromMock };
}

describe("writeNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("inserts a notification row with the correct shape", async () => {
    const { supabase, insertMock, fromMock } = buildSupabaseMock({ error: null });
    mockCreateClient.mockResolvedValue(supabase as never);

    await writeNotification({
      userId: "user-123",
      kind: "success",
      title: "Workflow completed",
      body: "Workflow foo finished.",
      source: "inngest",
      executionId: "exec-abc",
      deepLink: "/api/v1/runs?executionId=exec-abc",
      metadata: { workflow: "foo" },
      speechText: "Done. Workflow foo completed.",
      dedupKey: "exec-abc:WORKFLOW_COMPLETED",
    });

    expect(fromMock).toHaveBeenCalledWith("notifications");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        kind: "success",
        title: "Workflow completed",
        body: "Workflow foo finished.",
        source: "inngest",
        execution_id: "exec-abc",
        dedup_key: "exec-abc:WORKFLOW_COMPLETED",
        speech_text: "Done. Workflow foo completed.",
        read: false,
      })
    );
  });

  it("silently ignores unique-constraint violations (code 23505)", async () => {
    const { supabase } = buildSupabaseMock({ error: { code: "23505", message: "duplicate key value" } });
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(
      writeNotification({
        userId: "user-123",
        kind: "info",
        title: "Duplicate",
        body: "Duplicate notification.",
        source: "inngest",
        dedupKey: "exec-abc:WORKFLOW_COMPLETED",
      })
    ).resolves.toBeUndefined();
  });

  it("rethrows non-23505 database errors", async () => {
    const { supabase } = buildSupabaseMock({ error: { code: "500", message: "Internal error" } });
    mockCreateClient.mockResolvedValue(supabase as never);

    await expect(
      writeNotification({
        userId: "user-123",
        kind: "warning",
        title: "Failed",
        body: "Something failed.",
        source: "inngest",
      })
    ).rejects.toThrow("writeNotification: Internal error");
  });

  it("sets null fields for absent optional fields", async () => {
    const { supabase, insertMock } = buildSupabaseMock({ error: null });
    mockCreateClient.mockResolvedValue(supabase as never);

    await writeNotification({
      userId: "user-456",
      kind: "info",
      title: "Simple",
      body: "Simple notification.",
      source: "runtime-facade",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_id: null,
        task_id: null,
        deep_link: null,
        speech_text: null,
        dedup_key: null,
        metadata: {},
      })
    );
  });
});
