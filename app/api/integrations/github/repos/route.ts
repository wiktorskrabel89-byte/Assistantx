import { getProviderTokenCookieName } from "@/lib/integrations";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

type GitHubApiError = { message?: string };

async function githubFetch(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "AssistantX",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}) as GitHubApiError);
    throw new Error(data.message ?? `GitHub request failed (${response.status}).`);
  }
  return response;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getProviderTokenCookieName("github"))?.value ?? null;

    if (!token) {
      return Response.json({ error: "GitHub is not connected. Connect your GitHub account first." }, { status: 401 });
    }

    const response = await githubFetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
      token
    );
    const data = await response.json() as Array<{
      id: number;
      full_name: string;
      name: string;
      private: boolean;
      default_branch: string;
      description: string | null;
      pushed_at: string | null;
    }>;

    const repos = data.map((r) => ({
      fullName: r.full_name,
      name: r.name,
      private: r.private,
      defaultBranch: r.default_branch,
      description: r.description ?? null,
      pushedAt: r.pushed_at ?? null,
    }));

    return Response.json({ repos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list GitHub repositories.";
    return Response.json({ error: message }, { status: 500 });
  }
}
