/**
 * @jest-environment node
 */

jest.mock("@/src/core/auth/actor-resolver", () => ({
  extractBearerToken: jest.fn().mockReturnValue("token"),
  resolveActor: jest.fn().mockResolvedValue({
    ok: true,
    actor: {
      userId: "user-1",
      organizationId: "org-1",
      sessionId: "session-1",
    },
  }),
}));

jest.mock("@/src/core/persistence/runtime-db", () => ({
  listWorkflowRuns: jest.fn().mockResolvedValue([
    {
      execution_id: "exec-1",
      workflow_id: "ruflo_swarm",
      status: "completed",
      created_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:10.000Z",
      output: {
        orchestrator: "ruflo",
        runPhase: "queen_synthesis_completed",
      },
    },
  ]),
}));

describe("GET /api/v1/runs Ruflo summary mapping", () => {
  let GET: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/v1/runs/route"));
  });

  it("includes orchestrator and run phase in response", async () => {
    const request = new Request("http://localhost/api/v1/runs", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.runs?.[0]?.orchestrator).toBe("ruflo");
    expect(json.runs?.[0]?.runPhase).toBe("queen_synthesis_completed");
  });
});

