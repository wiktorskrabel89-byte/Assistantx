import { buildMcpServerToolList } from "@/src/mcp/server/server";
import { authorizeMcpRequest } from "./_auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await authorizeMcpRequest(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const tools = await buildMcpServerToolList();
  return Response.json({
    server: "assistantx",
    version: 1,
    authMode: auth.authMode,
    toolsCount: tools.length,
    endpoints: {
      discover: "/api/mcp",
      tools: "/api/mcp/tools",
      invoke: "/api/mcp/invoke",
      rufloHealth: "/api/mcp/ruflo/health",
    },
  });
}
