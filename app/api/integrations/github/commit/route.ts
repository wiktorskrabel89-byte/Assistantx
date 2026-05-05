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
 * POST /api/integrations/github/commit
 * Body: { repo: "owner/repo", branch: string, path: string, content: string, message: string }
 * Creates or updates a file in the given branch.
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getProviderTokenCookieName("github"))?.value ?? null;

    if (!token) {
      return Response.json({ error: "GitHub is not connected. Connect your GitHub account first." }, { status: 401 });
    }

    const body = await request.json() as {
      repo?: string;
      branch?: string;
      path?: string;
      content?: string;
      message?: string;
    };

    const repo = body.repo?.trim() ?? "";
    const branch = body.branch?.trim() ?? "";
    const path = body.path?.trim() ?? "";
    const content = body.content ?? "";
    const message = body.message?.trim() || "Update via AssistantX";

    if (!repo || !branch || !path) {
      return Response.json({ error: "repo, branch, and path are required." }, { status: 400 });
    }

    // Validate repo format (owner/name) to prevent URL injection
    if (!/^[\w.\-]+\/[\w.\-]+$/.test(repo)) {
      return Response.json({ error: "Invalid repo format. Use owner/repo." }, { status: 400 });
    }

    // Validate path doesn't traverse directories or start with slash
    if (path.startsWith("/") || path.includes("..")) {
      return Response.json({ error: "Invalid file path." }, { status: 400 });
    }

    // Try to get the current file SHA (needed for updates)
    let sha: string | undefined;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    try {
      const existing = await githubFetch(
        `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
        token
      );
      const existingData = await existing.json() as { sha?: string };
      sha = existingData.sha;
    } catch {
      // File doesn't exist yet — that's fine, we'll create it
    }

    const base64Content = Buffer.from(content, "utf-8").toString("base64");
    const payload: Record<string, unknown> = { message, content: base64Content, branch };
    if (sha) payload.sha = sha;

    await githubFetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, token, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    return Response.json({
      ok: true,
      url: `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${path}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to commit to GitHub.";
    return Response.json({ error: message }, { status: 500 });
  }
}
