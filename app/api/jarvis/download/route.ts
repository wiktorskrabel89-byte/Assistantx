import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const REPO = "wiktorskrabel89-byte/Assistantx";
const RELEASE_TAG = "jarvis-latest";
const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}`;
const RELEASE_DOWNLOAD_TIMEOUT_MS = 30_000;
const BUILD_COMMAND =
  "cd jarvis/desktop && npm install && npm run dist:win:all && npm run publish:download";
const ANDROID_BUILD_COMMAND =
  "cd jarvis/android/android && ./gradlew assembleRelease";

type GithubReleaseAsset = {
  name: string;
  url: string;
  browser_download_url: string;
};

function getGithubToken(): string | null {
  return process.env.JARVIS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

/** Fetch the GitHub Release asset metadata for the given filename. */
async function getGithubReleaseAsset(filenames: string[]): Promise<GithubReleaseAsset | null> {
  try {
    const token = getGithubToken();
    const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
    const res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const release = (await res.json()) as { assets: GithubReleaseAsset[] };
    return release.assets.find((asset) => filenames.includes(asset.name)) ?? null;
  } catch {
    return null;
  }
}

async function proxyGithubReleaseAsset(asset: GithubReleaseAsset): Promise<Response | null> {
  const token = getGithubToken();
  if (!token) return null;

  try {
    const res = await fetch(asset.url, {
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(RELEASE_DOWNLOAD_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok || !res.body) return null;

    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.name}"`,
      },
    });
  } catch {
    return null;
  }
}

type DownloadTarget = {
  platform: "windows" | "android";
  arch?: "x64" | "arm64";
  filenames: string[];
  contentType: string;
  missingError: string;
  instructions: string;
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") === "android" ? "android" : "windows";

  const target: DownloadTarget = platform === "android"
    ? {
        platform: "android",
        filenames: ["Jarvis-android.apk", "JarvisAndroid.apk"],
        contentType: "application/vnd.android.package-archive",
        missingError: "Android installer not yet available",
        instructions: `Build and publish the Android APK first:\n  ${ANDROID_BUILD_COMMAND}\nThen upload/copy it as Jarvis-android.apk (or JarvisAndroid.apk) to the jarvis-latest release or public/jarvis/.`,
      }
    : (() => {
        const rawArch = searchParams.get("arch");
        const arch = rawArch === "arm64" ? "arm64" : "x64";
        return {
          platform: "windows" as const,
          arch,
          filenames: [`JarvisSetup-${arch}.exe`],
          contentType: "application/octet-stream",
          missingError: "Installer not yet available",
          instructions: `Build and publish the installer first:\n  ${BUILD_COMMAND}\nOr trigger the "Build Jarvis Desktop" GitHub Actions workflow from the Actions tab.`,
        };
      })();

  // 1. Try to serve a locally published file first (built via `npm run dist:win:public`)
  for (const filename of target.filenames) {
    const localPath = path.join(process.cwd(), "public", "jarvis", filename);
    try {
      await fs.promises.access(localPath);
      // Stream the file to avoid buffering a large binary in memory
      const fileStream = fs.createReadStream(localPath);
      const webStream = Readable.toWeb(fileStream) as ReadableStream;
      return new Response(webStream, {
        headers: {
          "Content-Type": target.contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {
      // local file not available — fall through
    }
  }

  // 2. Try to stream the latest GitHub Release asset when the runtime has
  // access to a GitHub token (required for private releases).
  const releaseAsset = await getGithubReleaseAsset(target.filenames);
  if (releaseAsset) {
    const proxiedAsset = await proxyGithubReleaseAsset(releaseAsset);
    if (proxiedAsset) {
      return proxiedAsset;
    }

    return Response.redirect(releaseAsset.browser_download_url, 302);
  }

  // 3. Fall back to the deterministic GitHub Releases URL so logged-in users
  // can still download assets from the private repository even when the server
  // runtime does not have a GitHub token configured.
  const fallbackFilename = target.filenames[0];
  if (!getGithubToken() && fallbackFilename) {
    return Response.redirect(`${RELEASE_DOWNLOAD_BASE}/${encodeURIComponent(fallbackFilename)}`, 302);
  }

  // 4. Neither available — return actionable error
  return Response.json(
    {
      error: target.missingError,
      platform: target.platform,
      arch: target.arch,
      instructions: target.instructions,
    },
    { status: 503 },
  );
}
