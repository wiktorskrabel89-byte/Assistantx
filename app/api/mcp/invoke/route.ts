import { handleMcpServerRequest } from "@/src/mcp/server/server";
import { authorizeMcpRequest } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type McpInvokeBody = {
  toolName?: string;
  input?: Record<string, unknown>;
};

const RUFLO_HIGH_RISK_CAPABILITY_TOKENS = ["spawn", "train", "memory"];

function isRufloHighRiskInvocation(toolName: string, input: Record<string, unknown>) {
  const normalizedTool = toolName.toLowerCase();
  if (!normalizedTool.startsWith("ruflo/") && !normalizedTool.startsWith("ruflo.")) {
    return false;
  }
  if (RUFLO_HIGH_RISK_CAPABILITY_TOKENS.some((token) => normalizedTool.includes(token))) {
    return true;
  }
  const action = String(input.action ?? "").toLowerCase();
  return RUFLO_HIGH_RISK_CAPABILITY_TOKENS.some((token) => action.includes(token));
}

export async function POST(request: Request) {
  const auth = await authorizeMcpRequest(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null) as McpInvokeBody | null;
  if (!body || typeof body.toolName !== "string" || !body.toolName.trim()) {
    return Response.json({ error: "toolName is required." }, { status: 400 });
  }
  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return Response.json({ error: "input must be an object." }, { status: 400 });
  }

  const toolName = body.toolName.trim();
  if (isRufloHighRiskInvocation(toolName, body.input)) {
    if (auth.authMode !== "supabase" || !auth.actorUserId) {
      return Response.json(
        { error: "High-risk Ruflo actions require Supabase-authenticated actor attribution." },
        { status: 403 },
      );
    }
    if (!auth.actorOrganizationId) {
      return Response.json(
        { error: "High-risk Ruflo actions require organization-scoped execution." },
        { status: 403 },
      );
    }
    if (typeof body.input.approvalToken !== "string" || !body.input.approvalToken.trim()) {
      return Response.json(
        { error: "High-risk Ruflo actions require an explicit approvalToken." },
        { status: 403 },
      );
    }
  }

  const result = await handleMcpServerRequest(
    toolName,
    {
      ...body.input,
      _requestedByUserId: auth.actorUserId,
      _requestedByOrganizationId: auth.actorOrganizationId,
      _requestAuthMode: auth.authMode,
    },
    auth.actorUserId,
    auth.actorOrganizationId,
  );

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
