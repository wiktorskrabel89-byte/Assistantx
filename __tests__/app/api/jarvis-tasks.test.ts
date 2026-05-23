/**
 * @jest-environment node
 */

const mockCreateClient = jest.fn();

jest.mock("@/lib/server", () => ({
  createClient: () => mockCreateClient(),
}));

jest.mock("@/app/api/jarvis/devices/_shared", () => ({
  resolveOwnedDevice: jest.fn(),
}));

function buildInsertChain(result: unknown) {
  return {
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue(result),
    }),
  };
}

function buildSelectChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

function buildWorkspaceStateChain(plan: "free" | "pro" | "pro+" = "free") {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { state_json: { userPlan: plan } },
      error: null,
    }),
  };
}

describe("Jarvis task routes", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("enqueues an async local task for the authenticated user", async () => {
    const insertChain = buildInsertChain({
      data: {
        task_id: "task-1",
        status: "pending",
        category: "ai_request",
        action_type: null,
        device_id: null,
        created_at: "2026-05-21T00:00:00Z",
      },
      error: null,
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "workspace_states") {
          return buildWorkspaceStateChain("free");
        }
        if (table === "ai_tasks") {
          return { insert: jest.fn().mockReturnValue(insertChain) };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import("@/app/api/jarvis/tasks/route");
    const response = await POST(new Request("http://localhost/api/jarvis/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Wake up local PC" }),
    }) as never);

    expect(response.status).toBe(202);
    const body = await response.json() as { taskId: string };
    expect(body.taskId).toBe("task-1");
  });

  it("rejects unsupported v1 system actions", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "workspace_states") {
          return buildWorkspaceStateChain("free");
        }
        return {};
      }),
    });

    const { POST } = await import("@/app/api/jarvis/tasks/route");
    const response = await POST(new Request("http://localhost/api/jarvis/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Run admin shell",
        category: "system_action",
        actionType: "run_shell",
      }),
    }) as never);

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/Unsupported system action/i);
  });

  it("returns task status for the owning user", async () => {
    const selectChain = buildSelectChain({
      data: {
        task_id: "task-1",
        user_id: "user-1",
        status: "processing",
        prompt: "Ping",
        response: null,
        error: null,
        provider: null,
        model: null,
        routing: "local",
        category: "system_action",
        action_type: "system_status_ping",
        payload: {},
        created_at: "2026-05-21T00:00:00Z",
        started_at: "2026-05-21T00:00:02Z",
        completed_at: null,
        device_id: null,
      },
      error: null,
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "workspace_states") {
          return buildWorkspaceStateChain("pro");
        }
        if (table === "ai_tasks") {
          return selectChain;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/jarvis/tasks/[taskId]/route");
    const response = await GET(
      new Request("http://localhost/api/jarvis/tasks/task-1", { method: "GET" }) as never,
      { params: Promise.resolve({ taskId: "task-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { uiStatus: string; task: { task_id: string } };
    expect(body.task.task_id).toBe("task-1");
    expect(body.uiStatus).toBe("Reading local device status...");
  });
});
