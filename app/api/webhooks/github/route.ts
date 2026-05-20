import { createHmac, timingSafeEqual } from "node:crypto";
import { executeRuntimeRequest } from "@/src/backend/runtime/runtime-facade";

export const runtime = "nodejs";
export const maxDuration = 30;

const HANDLED_PULL_REQUEST_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(signatureHeader);
  const digest = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actual = Buffer.from(digest);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "GITHUB_WEBHOOK_SECRET is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, secret)) {
    return Response.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");
  if (eventName !== "pull_request") {
    return Response.json({ ok: true, ignored: true, reason: "unsupported_event" });
  }

  const payload = JSON.parse(rawBody) as {
    action?: string;
    repository?: { full_name?: string | null };
    pull_request?: {
      number?: number;
      diff_url?: string | null;
      head?: { sha?: string | null };
    };
  };

  const action = payload.action ?? "";
  if (!HANDLED_PULL_REQUEST_ACTIONS.has(action)) {
    return Response.json({ ok: true, ignored: true, reason: "unsupported_action", action });
  }

  const repo = payload.repository?.full_name ?? "";
  const pullNumber = payload.pull_request?.number ?? 0;
  const diffUrl = payload.pull_request?.diff_url ?? null;
  const headSha = payload.pull_request?.head?.sha ?? "";
  if (!repo || !pullNumber || !headSha) {
    return Response.json({ error: "Malformed pull_request webhook payload." }, { status: 400 });
  }

  const result = await executeRuntimeRequest({
    workflow: "pr_review",
    input: {
      repo,
      pullNumber,
      diffUrl,
      headSha,
      action,
    },
    actor: {
      userId: null,
      organizationId: null,
      sessionId: null,
    },
  });

  return Response.json({
    ok: true,
    executionId: result.executionId,
    status: result.status,
  });
}
