/**
 * @jest-environment node
 */

describe("Ruflo ecosystem adapter config", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...envBackup };
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it("maps zero_trust boundary to BFT consensus", async () => {
    process.env.RUFLO_ENABLED = "true";
    process.env.RUFLO_TRAINING_ENABLED = "true";
    process.env.RUFLO_TRUST_BOUNDARY = "zero_trust";
    process.env.RUFLO_MEMORY_NAMESPACE = "assistantx/test";

    const { getRufloHealthSnapshot } = await import("@/src/ecosystem/ruflo");
    const snapshot = getRufloHealthSnapshot();

    expect(snapshot.enabled).toBe(true);
    expect(snapshot.consensusMode).toBe("bft");
    expect(snapshot.memoryNamespace).toBe("assistantx/test");
  });

  it("returns Path B lifecycle commands", async () => {
    process.env.RUFLO_WORKSPACE_PATH = "/tmp/project";
    const { getRufloWorkspaceLifecycle } = await import("@/src/ecosystem/ruflo");
    const lifecycle = getRufloWorkspaceLifecycle();

    expect(lifecycle.initCommand).toContain("npx ruvflo init");
    expect(lifecycle.registerMcpCommand).toContain("claude mcp add ruflo");
  });
});

