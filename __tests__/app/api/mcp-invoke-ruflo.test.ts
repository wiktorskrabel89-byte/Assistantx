/**
 * @jest-environment node
 */

jest.mock("@/app/api/mcp/_auth", () => ({
  authorizeMcpRequest: jest.fn().mockResolvedValue({
    ok: true,
    authMode: "supabase",
    actorUserId: "user-1",
    actorOrganizationId: "org-1",
  }),
}));

jest.mock("@/src/mcp/server/server", () => ({
  handleMcpServerRequest: jest.fn().mockResolvedValue({ ok: true, serverSide: true }),
}));

describe("POST /api/mcp/invoke high-risk Ruflo policy", () => {
  let POST: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/mcp/invoke/route"));
  });

  it("rejects high-risk Ruflo calls without approvalToken", async () => {
    const request = new Request("http://localhost/api/mcp/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName: "ruflo/agent_spawn",
        input: {},
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(String(json.error ?? "")).toContain("approvalToken");
  });
});

