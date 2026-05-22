import { extractBearerToken, resolveActor } from "@/src/core/auth/actor-resolver";

export async function authorizeMcpRequest(request: Request): Promise<
  | { ok: true; actorUserId: string | null; authMode: "api_key" | "supabase" }
  | { ok: false; status: number; error: string }
> {
  const token = extractBearerToken(request.headers.get("Authorization"));
  const apiKey = process.env.MCP_API_KEY;

  if (token && apiKey && token === apiKey) {
    return { ok: true, actorUserId: null, authMode: "api_key" };
  }

  if (!token) {
    return { ok: false, status: 401, error: "Authorization header required." };
  }

  const actorResult = await resolveActor({ bearerToken: token });
  if (!actorResult.ok) {
    return { ok: false, status: actorResult.status, error: actorResult.error };
  }

  return {
    ok: true,
    actorUserId: actorResult.actor.userId,
    authMode: "supabase",
  };
}
