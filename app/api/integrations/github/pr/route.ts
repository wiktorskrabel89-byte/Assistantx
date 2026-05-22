import { getGitHubToken, githubFetch, isValidRepo } from "../shared";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/integrations/github/pr
 * Body: { repo: "owner/repo", head: string, base: string, title: string, body?: string }
 * Creates a pull request from head → base.
 */
export async function POST(request: Request) {
  try {
    const token = await getGitHubToken();

    if (!token) {
      return Response.json({ error: "GitHub is not connected. Connect your GitHub account first." }, { status: 401 });
    }

    const payload = await request.json() as {
      repo?: string;
      head?: string;
      base?: string;
      title?: string;
      body?: string;
      draft?: boolean;
    };

    const repo = payload.repo?.trim() ?? "";
    const head = payload.head?.trim() ?? "";
    const base = payload.base?.trim() ?? "";
    const title = payload.title?.trim() || "Changes from AssistantX";
    const body = payload.body?.trim() ?? "";
    const draft = payload.draft === true;

    if (!repo || !head || !base) {
      return Response.json({ error: "repo, head branch, and base branch are required." }, { status: 400 });
    }

    // Validate repo format (owner/name) to prevent URL injection
    if (!isValidRepo(repo)) {
      return Response.json({ error: "Invalid repo format. Use owner/repo." }, { status: 400 });
    }

    const response = await githubFetch(`https://api.github.com/repos/${repo}/pulls`, token, {
      method: "POST",
      body: JSON.stringify({ title, body, head, base, draft }),
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
