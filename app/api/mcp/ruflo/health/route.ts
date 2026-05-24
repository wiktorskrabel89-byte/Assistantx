import { authorizeMcpRequest } from "@/app/api/mcp/_auth";
import { getRufloHealthSnapshot, getRufloWorkspaceLifecycle } from "@/src/ecosystem/ruflo";
import { getMcpServer } from "@/src/mcp/client/registry";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await authorizeMcpRequest(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const [snapshot, lifecycle, registered] = await Promise.all([
    Promise.resolve(getRufloHealthSnapshot()),
    Promise.resolve(getRufloWorkspaceLifecycle()),
    getMcpServer("ruflo"),
  ]);

  return Response.json({
    ok: true,
    orchestrator: "ruflo",
    authMode: auth.authMode,
    actorUserId: auth.actorUserId,
    actorOrganizationId: auth.actorOrganizationId,
    health: snapshot,
    lifecycle,
    mcpRegistration: {
      found: Boolean(registered),
      enabled: registered?.enabled ?? false,
      trustLevel: registered?.trustLevel ?? null,
      capabilities: registered?.capabilities?.map((capability) => capability.name) ?? [],
    },
    diagnostics: {
      mcpConnectivity: registered?.enabled ? "ready" : "not_registered",
      memorySyncLagMs: null,
      swarmHealth: snapshot.workspaceReady && snapshot.mcpConfigured ? "healthy" : "degraded",
    },
  });
}
