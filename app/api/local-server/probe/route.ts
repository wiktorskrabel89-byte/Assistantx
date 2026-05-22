import { createClient } from "@/lib/server";
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

type ProbeApiType = "ollama" | "lmstudio" | "openai-compat";

type ProbeBody = {
  baseUrl?: string;
  apiType?: ProbeApiType;
};

function normalizeBaseUrl(input: string): string | null {
  try {
    const parsed = new URL(input.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    const allowedHost = normalizeAllowedLoopbackHost(parsed.hostname);
    if (!allowedHost) return null;
    if (parsed.port && !/^\d{1,5}$/.test(parsed.port)) return null;
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${allowedHost}${port}`;
  } catch {
    return null;
  }
}

function normalizeAllowedLoopbackHost(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();
  if (host === "localhost") return "localhost";
  if (host === "127.0.0.1") return "127.0.0.1";
  if (host === "::1" || host === "[::1]") return "[::1]";
  return null;
}

async function ensureAuthenticatedUser() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

function parseModels(apiType: ProbeApiType, payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as Record<string, unknown>;
  if (apiType === "ollama") {
    const models = Array.isArray(candidate.models) ? candidate.models : [];
    return models
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        return String((item as Record<string, unknown>).name ?? "").trim();
      })
      .filter(Boolean);
  }
  const data = Array.isArray(candidate.data) ? candidate.data : [];
  return data
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      return String((item as Record<string, unknown>).id ?? "").trim();
    })
    .filter(Boolean);
}

export async function POST(req: Request) {
  const rl = checkRateLimit(getRateLimitKey(req, "local-server-probe"), 1, 10_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const user = await ensureAuthenticatedUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: ProbeBody;
  try {
    body = await req.json() as ProbeBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const apiType = body.apiType;
  if (apiType !== "ollama" && apiType !== "lmstudio" && apiType !== "openai-compat") {
    return Response.json({ error: "Invalid apiType." }, { status: 400 });
  }
  const baseUrl = typeof body.baseUrl === "string" ? normalizeBaseUrl(body.baseUrl) : null;
  if (!baseUrl) {
    return Response.json({ error: "Invalid baseUrl. Only localhost/127.0.0.1/[::1] loopback URLs are allowed." }, { status: 400 });
  }

  const endpoint = apiType === "ollama" ? `${baseUrl}/api/tags` : `${baseUrl}/v1/models`;
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return Response.json({
        error: "Probe request failed.",
        status: response.status,
        models: [],
        latencyMs,
      }, { status: 502 });
    }

    const payload = await response.json();
    const models = parseModels(apiType, payload);
    return Response.json({ models: Array.from(new Set(models)), latencyMs });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Probe request failed.",
      models: [],
      latencyMs: Date.now() - startedAt,
    }, { status: 502 });
  }
}
