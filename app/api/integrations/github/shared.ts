import { getProviderTokenCookieName } from "@/lib/integrations";
import { cookies } from "next/headers";

type GitHubApiError = { message?: string };

export async function githubFetch(url: string, token: string, options?: RequestInit) {
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

export async function getGitHubToken() {
  const cookieStore = await cookies();
  return cookieStore.get(getProviderTokenCookieName("github"))?.value ?? null;
}

export function isValidRepo(repo: string) {
  return /^[\w.\-]+\/[\w.\-]+$/.test(repo);
}

export function isValidRepoPath(path: string) {
  return !(path.startsWith("/") || path.includes(".."));
}

export async function getBranchSha(repo: string, branch: string, token: string) {
  const response = await githubFetch(
    `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  const data = await response.json() as { object?: { sha?: string } };
  return data.object?.sha ?? null;
}

export async function ensureBranchExists(repo: string, branch: string, baseBranch: string, token: string) {
  try {
    const existing = await getBranchSha(repo, branch, token);
    if (existing) return existing;
  } catch {
    // branch does not exist yet
  }

  const baseSha = await getBranchSha(repo, baseBranch, token);
  if (!baseSha) throw new Error(`Base branch '${baseBranch}' was not found.`);

  await githubFetch(`https://api.github.com/repos/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    }),
  });

  return baseSha;
}
