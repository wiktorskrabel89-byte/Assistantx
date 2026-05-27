import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  fetchUpdateManifest,
  getManifestPlatformEntry,
  getUpdateChannel,
  isAllowedHttpsUrl,
  resolveManifestDownloadUrl,
} from "@/app/api/jarvis/_lib/update-manifest";

const BUILD_COMMAND =
  "cd jarvis/desktop && npm install && npm run dist:win:all && npm run publish:download";
const BUILD_MAC_COMMAND = "cd jarvis/desktop && npm install && npm run dist:mac";
const BUILD_LINUX_COMMAND = "cd jarvis/desktop && npm install && npm run dist:linux";
const ANDROID_BUILD_COMMAND =
  "cd jarvis/android/android && ./gradlew assembleRelease";

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
        instructions: `Build and publish the Android APK first:\n  ${ANDROID_BUILD_COMMAND}\nThen upload/copy it as Jarvis-android.apk (or JarvisAndroid.apk) to updates.assistantx.pl.`,
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

  for (const filename of target.filenames) {
    const localPath = path.join(process.cwd(), "public", "jarvis", filename);
    try {
      await fs.promises.access(localPath);
      const fileStream = fs.createReadStream(localPath);
      const webStream = Readable.toWeb(fileStream) as ReadableStream;
      return new Response(webStream, {
        headers: {
          "Content-Type": target.contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {}
  }

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

  return Response.json(
    {
      error: target.missingError,
      platform: target.platform,
      arch: target.arch,
      reason: "manifest-platform-entry-missing",
      instructions:
        `${target.instructions}\n\n` +
        "Confirm updates.assistantx.pl/versions.json includes this platform and architecture.",
    },
    { status: 503 },
  );
}
