/**
 * GET /api/jarvis/version
 *
 * Returns metadata about the latest Jarvis release from GitHub so that
 * client apps (desktop renderer, Android) can check for updates without
 * needing a GitHub token embedded in the client binary.
 *
 * This endpoint is intentionally unauthenticated — the data it returns is
 * not sensitive (it is the same information visible on the public Releases
 * page).
 */

const REPO = "wiktorskrabel89-byte/Assistantx";
const RELEASE_TAG = "jarvis-latest";
const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}`;

function getGithubToken(): string | null {
  return (
    process.env.JARVIS_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    null
  );
}

export async function GET(): Promise<Response> {
  try {
    const token = getGithubToken();
    const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;

    const res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(6000),
      // Never cache — callers need the freshest release info
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json(
        { error: "Release not found", tag: RELEASE_TAG },
        { status: 404 }
      );
    }

    const release = (await res.json()) as {
      id: number;
      tag_name: string;
      name: string;
      body: string | null;
      published_at: string;
      updated_at: string;
    };

    return Response.json(
      {
        releaseId: release.id,
        version: release.name ?? release.tag_name,
        releaseNotes: release.body ?? "",
        publishedAt: release.published_at,
        updatedAt: release.updated_at,
        downloadUrlWindows: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.exe`,
        downloadUrlAndroid: `${RELEASE_DOWNLOAD_BASE}/Jarvis-android.apk`,
      },
      {
        headers: {
          // Allow a short CDN/browser cache — 60 s is enough to avoid
          // hammering GitHub while still getting fresh data quickly.
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch release info";
    return Response.json({ error: message }, { status: 503 });
  }
}
