import {
  fetchUpdateManifest,
  getManifestPlatformEntry,
  getUpdateChannel,
  resolveManifestDownloadUrl,
} from "@/app/api/jarvis/_lib/update-manifest";

const RELEASE_DOWNLOAD_BASE = "https://updates.assistantx.pl";

function buildUnavailableVersionPayload(error: string) {
  return {
    available: false,
    error,
    source: "none",
    tag: "manifest",
    releaseId: null,
    version: null,
    releaseNotes: "",
    publishedAt: null,
    updatedAt: null,
    downloadUrlWindows: `${RELEASE_DOWNLOAD_BASE}/windows/JarvisSetup-x64.exe`,
    downloadUrlMacIntel: `${RELEASE_DOWNLOAD_BASE}/mac/JarvisSetup-x64.dmg`,
    downloadUrlMacArm64: `${RELEASE_DOWNLOAD_BASE}/mac/JarvisSetup-arm64.dmg`,
    downloadUrlLinux: `${RELEASE_DOWNLOAD_BASE}/linux/Jarvis-x64.AppImage`,
    downloadUrlAndroid: `${RELEASE_DOWNLOAD_BASE}/android/Jarvis-android.apk`,
  };
}

async function getFromManifest() {
  const manifest = await fetchUpdateManifest();
  const channel = getUpdateChannel();
  const windows = getManifestPlatformEntry(manifest, "windows", channel);
  const mac = getManifestPlatformEntry(manifest, "mac", channel);
  const linux = getManifestPlatformEntry(manifest, "linux", channel);
  const android = getManifestPlatformEntry(manifest, "android", channel);

  if (!windows && !mac && !linux && !android) {
    throw new Error("manifest-platforms-missing");
  }

  const preferred = windows ?? mac ?? linux ?? android;
  return {
    available: true,
    source: "manifest",
    releaseId: null,
    version: preferred?.latestVersion || null,
    releaseNotes: preferred?.releaseNotes || "",
    publishedAt: preferred?.publishedAt || null,
    updatedAt: preferred?.publishedAt || null,
    downloadUrlWindows: windows
      ? resolveManifestDownloadUrl({ entry: windows, platform: "windows", arch: "x64" })
      : `${RELEASE_DOWNLOAD_BASE}/windows/JarvisSetup-x64.exe`,
    downloadUrlMacIntel: mac
      ? resolveManifestDownloadUrl({ entry: mac, platform: "mac", arch: "x64" })
      : `${RELEASE_DOWNLOAD_BASE}/mac/JarvisSetup-x64.dmg`,
    downloadUrlMacArm64: mac
      ? resolveManifestDownloadUrl({ entry: mac, platform: "mac", arch: "arm64" })
      : `${RELEASE_DOWNLOAD_BASE}/mac/JarvisSetup-arm64.dmg`,
    downloadUrlLinux: linux
      ? resolveManifestDownloadUrl({ entry: linux, platform: "linux", arch: "x64" })
      : `${RELEASE_DOWNLOAD_BASE}/linux/Jarvis-x64.AppImage`,
    downloadUrlAndroid: android
      ? resolveManifestDownloadUrl({ entry: android, platform: "android" })
      : `${RELEASE_DOWNLOAD_BASE}/android/Jarvis-android.apk`,
  };
}

export async function GET(): Promise<Response> {
  try {
    const manifestData = await getFromManifest();
    return Response.json(manifestData, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch release info";
    return Response.json(buildUnavailableVersionPayload(message), {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    });
  }
}
