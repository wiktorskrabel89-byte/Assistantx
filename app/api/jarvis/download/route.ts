import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  fetchUpdateManifest,
  getManifestPlatformEntry,
  getUpdateChannel,
  getUpdateSource,
  isAllowedHttpsUrl,
  resolveManifestDownloadUrl,
} from "@/app/api/jarvis/_lib/update-manifest";

const REPO = "wiktorskrabel89-byte/Assistantx";
const RELEASE_TAG = "jarvis-latest";
const RELEASE_DOWNLOAD_TIMEOUT_MS = 30_000;
const BUILD_COMMAND =
  "cd jarvis/desktop && npm install && npm run dist:win:all && npm run publish:download";
const BUILD_MAC_COMMAND = "cd jarvis/desktop && npm install && npm run dist:mac";
const BUILD_LINUX_COMMAND = "cd jarvis/desktop && npm install && npm run dist:linux";
const ANDROID_BUILD_COMMAND =
  "cd jarvis/android/android && ./gradlew assembleRelease";

type GithubReleaseAsset = {
  name: string;
  url: string;
  browser_download_url: string;
};

function getGithubToken(): string | null {
  // Prefer a Jarvis-specific token, then fall back to common GitHub runtime
  // token env vars used in different hosting environments.
  return process.env.JARVIS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

/** Fetch the GitHub Release asset metadata for the given filename. */
type ReleaseLookupResult = {
  asset: GithubReleaseAsset | null;
  lookupFailed: boolean;
};

async function getGithubReleaseAsset(filenames: string[]): Promise<ReleaseLookupResult> {
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
    if (!res.ok) {
      return { asset: null, lookupFailed: true };
    }
    const release = (await res.json()) as { assets: GithubReleaseAsset[] };
    return {
      asset: release.assets.find((asset) => filenames.includes(asset.name)) ?? null,
      lookupFailed: false,
    };
  } catch {
    return { asset: null, lookupFailed: true };
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
  platform: "windows" | "mac" | "linux" | "android";
  arch?: "x64" | "arm64";
  filenames: string[];
  contentType: string;
  missingError: string;
  instructions: string;
};

async function resolveManifestDownloadTarget(target: DownloadTarget): Promise<string | null> {
  const manifest = await fetchUpdateManifest();
  const channel = getUpdateChannel();
  const manifestEntry = getManifestPlatformEntry(manifest, target.platform, channel);
  if (!manifestEntry) return null;
  const url = resolveManifestDownloadUrl({
    entry: manifestEntry,
    platform: target.platform,
    arch: target.arch,
  });
  if (!url) return null;
  if (!isAllowedHttpsUrl(url)) {
    throw new Error("manifest-download-url-not-allowed");
  }
  return url;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawPlatform = searchParams.get("platform");
  const platform =
    rawPlatform === "android" || rawPlatform === "mac" || rawPlatform === "linux"
      ? rawPlatform
      : "windows";

  const target: DownloadTarget = (() => {
    if (platform === "android") {
      return {
        platform: "android",
        filenames: ["Jarvis-android.apk", "JarvisAndroid.apk"],
        contentType: "application/vnd.android.package-archive",
        missingError: "Android installer not yet available",
        instructions: `Build and publish the Android APK first:\n  ${ANDROID_BUILD_COMMAND}\nThen upload/copy it as Jarvis-android.apk (or JarvisAndroid.apk) to the jarvis-latest release or public/jarvis/.`,
      };
    }
    if (platform === "mac") {
      const rawArch = searchParams.get("arch");
      const arch = rawArch === "arm64" ? "arm64" : "x64";
      return {
        platform: "mac",
        arch,
        filenames: [`JarvisSetup-${arch}.dmg`],
        contentType: "application/x-apple-diskimage",
        missingError: "macOS installer not yet available",
        instructions: `Build and publish the macOS installer first:\n  ${BUILD_MAC_COMMAND}\nOr trigger the "Build Jarvis Desktop" GitHub Actions workflow from the Actions tab.`,
      };
    }
    if (platform === "linux") {
      return {
        platform: "linux",
        arch: "x64",
        filenames: ["Jarvis-x64.AppImage"],
        contentType: "application/octet-stream",
        missingError: "Linux installer not yet available",
        instructions: `Build and publish the Linux AppImage first:\n  ${BUILD_LINUX_COMMAND}\nOr trigger the "Build Jarvis Desktop" GitHub Actions workflow from the Actions tab.`,
      };
    }
    const rawArch = searchParams.get("arch");
    const arch = rawArch === "arm64" ? "arm64" : "x64";
    return {
      platform: "windows",
      arch,
      filenames: [`JarvisSetup-${arch}.exe`],
      contentType: "application/octet-stream",
      missingError: "Installer not yet available",
      instructions: `Build and publish the installer first:\n  ${BUILD_COMMAND}\nOr trigger the "Build Jarvis Desktop" GitHub Actions workflow from the Actions tab.`,
    };
  })();

  const updateSource = getUpdateSource();

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

  // 2. Manifest-first mode: redirect to canonical public update asset URL.
  if (updateSource === "manifest") {
    try {
      const manifestUrl = await resolveManifestDownloadTarget(target);
      if (manifestUrl) {
        return Response.redirect(manifestUrl, 307);
      }
    } catch (error) {
      return Response.json(
        {
          error: "Installer is temporarily unavailable",
          platform: target.platform,
          arch: target.arch,
          reason: "manifest-download-resolution-failed",
          details: error instanceof Error ? error.message : "manifest-resolution-failed",
          instructions:
            `${target.instructions}\n\n` +
            "Verify versions.json platform mapping and allowed HTTPS host configuration.",
        },
        { status: 503 },
      );
    }
  }

  // 3. Private release downloads require server-side GitHub credentials.
  const githubToken = getGithubToken();
  if (!githubToken) {
    return Response.json(
      {
        error: "Installer is temporarily unavailable",
        platform: target.platform,
        arch: target.arch,
        reason: "private_release_requires_server_token",
        instructions:
          `${target.instructions}\n\n` +
          "This repository is private. Configure one of JARVIS_GITHUB_TOKEN, GITHUB_TOKEN, or GH_TOKEN on the web runtime, " +
          "or publish the installer file to public/jarvis/.",
      },
      { status: 503 },
    );
  }

  // 4. Try to stream the latest GitHub Release asset with authenticated GitHub API access.
  const releaseLookup = await getGithubReleaseAsset(target.filenames);
  const releaseAsset = releaseLookup.asset;
  if (releaseAsset) {
    const proxiedAsset = await proxyGithubReleaseAsset(releaseAsset);
    if (proxiedAsset) {
      return proxiedAsset;
    }

    return Response.json(
      {
        error: "Installer is temporarily unavailable",
        platform: target.platform,
        arch: target.arch,
        reason: "private_release_proxy_failed",
        instructions:
          "GitHub asset lookup succeeded but authenticated download failed. Verify the configured GitHub token has Contents: Read access " +
          `to ${REPO} and try again.`,
      },
      { status: 503 },
    );
  }

  if (releaseLookup.lookupFailed) {
    console.warn(`[jarvis/download] Release lookup failed for ${target.filenames.join(", ")}.`);
    return Response.json(
      {
        error: "Installer is temporarily unavailable",
        platform: target.platform,
        arch: target.arch,
        reason: "private_release_lookup_failed",
        instructions:
          "Authenticated release lookup failed. Verify the configured GitHub token has Contents: Read access " +
          `to ${REPO} and that release tag ${RELEASE_TAG} exists.`,
      },
      { status: 503 },
    );
  }

  // 5. Release exists but target asset is missing.
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
