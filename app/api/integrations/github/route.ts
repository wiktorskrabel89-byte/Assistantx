import {
  getProviderTokenCookieName,
  guessLanguageFromPath,
  inferMimeType,
  isGitHubImportablePath,
  parseGitHubRepoInput,
} from "@/lib/integrations";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

type GitHubApiError = {
  message?: string;
};

async function githubFetch(url: string, token: string | null) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Moje AI",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}) as GitHubApiError);
    const suffix = data.message ? ` ${data.message}` : "";

    if (response.status === 404) {
      throw new Error(token ? `GitHub resource not found.${suffix}` : `GitHub repo not found or requires private access.${suffix}`);
    }

    if (response.status === 403) {
      throw new Error(`GitHub access was denied or rate limited.${suffix}`);
    }

    throw new Error(`GitHub request failed (${response.status}).${suffix}`);
  }

  return response;
}

async function getGitHubToken() {
  const cookieStore = await cookies();
  return cookieStore.get(getProviderTokenCookieName("github"))?.value ?? null;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const repoInput = requestUrl.searchParams.get("repo") ?? "";
    const refInput = requestUrl.searchParams.get("ref")?.trim() ?? "";
    const parsed = parseGitHubRepoInput(repoInput);

    if (!parsed) {
      return Response.json({ error: "Enter a valid GitHub repo like owner/repo or a GitHub URL." }, { status: 400 });
    }

    const token = await getGitHubToken();
    const repoResponse = await githubFetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, token);
    const repoData = await repoResponse.json() as {
      default_branch?: string;
      description?: string | null;
      private?: boolean;
    };

    const ref = refInput || repoData.default_branch || "main";
    const treeResponse = await githubFetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      token
    );
    const treeData = await treeResponse.json() as {
      truncated?: boolean;
      tree?: Array<{ path?: string; size?: number; type?: string }>;
    };

    const files = (treeData.tree ?? [])
      .filter((item) => item.type === "blob" && typeof item.path === "string" && isGitHubImportablePath(item.path))
      .filter((item) => typeof item.size !== "number" || item.size <= 600_000)
      .map((item) => ({
        path: item.path!,
        size: item.size ?? 0,
        language: guessLanguageFromPath(item.path!),
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
      .slice(0, 160);

    return Response.json({
      repo: `${parsed.owner}/${parsed.repo}`,
      ref,
      defaultBranch: repoData.default_branch ?? "main",
      description: repoData.description ?? null,
      isPrivate: Boolean(repoData.private),
      truncated: Boolean(treeData.truncated),
      files,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load GitHub repository.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { repo?: string; ref?: string; path?: string };
    const parsed = parseGitHubRepoInput(payload.repo ?? "");
    const path = payload.path?.trim() ?? "";

    if (!parsed || !path || !isGitHubImportablePath(path)) {
      return Response.json({ error: "Choose a valid importable file from GitHub." }, { status: 400 });
    }

    const ref = payload.ref?.trim() ?? "";
    const token = await getGitHubToken();
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const contentsResponse = await githubFetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${encodedPath}${refQuery}`,
      token
    );
    const data = await contentsResponse.json() as {
      type?: string;
      content?: string;
      encoding?: string;
      name?: string;
      size?: number;
    };

    if (data.type !== "file" || data.encoding !== "base64" || typeof data.content !== "string") {
      return Response.json({ error: "That GitHub item cannot be imported as a file." }, { status: 400 });
    }

    if ((data.size ?? 0) > 600_000) {
      return Response.json({ error: "That GitHub file is too large to import into the chat." }, { status: 413 });
    }

    const bytes = Buffer.from(data.content.replace(/\n/g, ""), "base64");
    const name = data.name ?? path.split("/").pop() ?? "github-file.txt";

    return Response.json({
      name,
      mimeType: inferMimeType(name),
      base64: bytes.toString("base64"),
      prompt: `Review or explain this GitHub file from ${parsed.owner}/${parsed.repo}: ${path}`,
      sourceLabel: `${parsed.owner}/${parsed.repo}:${path}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import the GitHub file.";
    return Response.json({ error: message }, { status: 500 });
  }
}