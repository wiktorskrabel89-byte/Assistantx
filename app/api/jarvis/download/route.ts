import fs from "node:fs/promises";
import path from "node:path";

const REPO = "wiktorskrabel89-byte/nextjs-boilerplate";
const RELEASE_TAG = "jarvis-latest";
const BUILD_COMMAND =
  "cd jarvis/desktop && npm install && npm run dist:win:all && npm run publish:download";

/** Fetch the GitHub Release asset download URL for the given filename. */
async function getGithubReleaseUrl(filename: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const release = (await res.json()) as { assets: { name: string; browser_download_url: string }[] };
    const asset = release.assets.find((a) => a.name === filename);
    return asset?.browser_download_url ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawArch = searchParams.get("arch");
  const arch = rawArch === "arm64" ? "arm64" : "x64";
  const filename = `JarvisSetup-${arch}.exe`;

  // 1. Try to serve a locally published file first (built via `npm run dist:win:public`)
  const localPath = path.join(process.cwd(), "public", "jarvis", filename);
  try {
    await fs.access(localPath);
    const fileBuffer = await fs.readFile(localPath);
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(fileBuffer.byteLength),
      },
    });
  } catch {
    // local file not available — fall through
  }

  // 2. Try to redirect to the latest GitHub Release asset
  const releaseUrl = await getGithubReleaseUrl(filename);
  if (releaseUrl) {
    return Response.redirect(releaseUrl, 302);
  }

  // 3. Neither available — return actionable error
  return Response.json(
    {
      error: "Installer not yet available",
      arch,
      instructions: `Build and publish the installer first:\n  ${BUILD_COMMAND}\nOr trigger the "Build Jarvis Desktop" GitHub Actions workflow from the Actions tab.`,
    },
    { status: 503 },
  );
}
