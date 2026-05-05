import { getProviderTokenCookieName } from "@/lib/integrations";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

type GitHubApiError = { message?: string };

async function githubFetch(url: string, token: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "AssistantX",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(options?.headers as Record<string, string> ?? {}),
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}) as GitHubApiError);
    throw new Error(data.message ?? `GitHub request failed (${response.status}).`);
  }
  return response;
}

/**
 * POST /api/integrations/github/pr
 * Body: { repo: "owner/repo", head: string, base: string, title: string, body?: string }
 * Creates a pull request from head → base.
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getProviderTokenCookieName("github"))?.value ?? null;

    if (!token) {
      return Response.json({ error: "GitHub is not connected. Connect your GitHub account first." }, { status: 401 });
    }

    const payload = await request.json() as {
      repo?: string;
      head?: string;
      base?: string;
      title?: string;
      body?: string;
    };

    const repo = payload.repo?.trim() ?? "";
    const head = payload.head?.trim() ?? "";
    const base = payload.base?.trim() ?? "";
    const title = payload.title?.trim() || "Changes from AssistantX";
    const body = payload.body?.trim() ?? "";

    if (!repo || !head || !base) {
      return Response.json({ error: "repo, head branch, and base branch are required." }, { status: 400 });
    }

    const response = await githubFetch(`https://api.github.com/repos/${repo}/pulls`, token, {
      method: "POST",
      body: JSON.stringify({ title, body, head, base }),
    });
    const data = await response.json() as { html_url?: string; number?: number };

    return Response.json({
      ok: true,
      prUrl: data.html_url ?? `https://github.com/${repo}/pulls`,
      prNumber: data.number ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create GitHub pull request.";
    return Response.json({ error: message }, { status: 500 });
  }
}
