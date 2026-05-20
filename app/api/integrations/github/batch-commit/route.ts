import { ensureBranchExists, getGitHubToken, githubFetch, isValidRepo, isValidRepoPath } from "../shared";

export const runtime = "nodejs";
export const maxDuration = 60;

type BatchCommitRequest = {
  repo?: string;
  branch?: string;
  baseBranch?: string;
  message?: string;
  files?: Array<{ path?: string; content?: string }>;
};

export async function POST(request: Request) {
  try {
    const token = await getGitHubToken();
    if (!token) {
      return Response.json({ error: "GitHub is not connected. Connect your GitHub account first." }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as BatchCommitRequest | null;
    const repo = body?.repo?.trim() ?? "";
    const branch = body?.branch?.trim() ?? "";
    const baseBranch = body?.baseBranch?.trim() ?? "";
    const message = body?.message?.trim() || "Batch update via AssistantX";
    const files = Array.isArray(body?.files) ? body?.files : [];

    if (!repo || !branch || !baseBranch || files.length === 0) {
      return Response.json({ error: "repo, branch, baseBranch, and files are required." }, { status: 400 });
    }
    if (!isValidRepo(repo)) {
      return Response.json({ error: "Invalid repo format. Use owner/repo." }, { status: 400 });
    }

    for (const file of files) {
      const path = file.path?.trim() ?? "";
      if (!path || !isValidRepoPath(path) || typeof file.content !== "string") {
        return Response.json({ error: `Invalid batch file entry for '${path || "unknown"}'.` }, { status: 400 });
      }
    }

    await ensureBranchExists(repo, branch, baseBranch, token);

    const commitUrls: string[] = [];
    for (const file of files) {
      const path = file.path!.trim();
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      let sha: string | undefined;
      try {
        const existing = await githubFetch(
          `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
          token,
        );
        const existingData = await existing.json() as { sha?: string };
        sha = existingData.sha;
      } catch {
        // new file on branch
      }

      const payload: Record<string, unknown> = {
        message,
        content: Buffer.from(file.content ?? "", "utf-8").toString("base64"),
        branch,
      };
      if (sha) payload.sha = sha;

      await githubFetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, token, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      commitUrls.push(`https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${path}`);
    }

    return Response.json({
      ok: true,
      branch,
      commitUrls,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to batch commit to GitHub.";
    return Response.json({ error: message }, { status: 500 });
  }
}
