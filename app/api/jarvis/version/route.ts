import {
  fetchUpdateManifest,
  getManifestPlatformEntry,
  getUpdateChannel,
  getUpdateSource,
  resolveManifestDownloadUrl,
} from "@/app/api/jarvis/_lib/update-manifest";

const REPO = "wiktorskrabel89-byte/Assistantx";
const RELEASE_TAG = "jarvis-latest";
const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}`;

function buildUnavailableVersionPayload(error: string) {
  return {
    available: false,
    error,
    source: "none",
    tag: RELEASE_TAG,
    releaseId: null,
    version: null,
    releaseNotes: "",
    publishedAt: null,
    updatedAt: null,
    downloadUrlWindows: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.exe`,
    downloadUrlMacIntel: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.dmg`,
    downloadUrlMacArm64: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-arm64.dmg`,
    downloadUrlLinux: `${RELEASE_DOWNLOAD_BASE}/Jarvis-x64.AppImage`,
    downloadUrlAndroid: `${RELEASE_DOWNLOAD_BASE}/Jarvis-android.apk`,
  };
}

function getGithubToken(): string | null {
  return process.env.JARVIS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
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
      : `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.exe`,
    downloadUrlMacIntel: mac
      ? resolveManifestDownloadUrl({ entry: mac, platform: "mac", arch: "x64" })
      : `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.dmg`,
    downloadUrlMacArm64: mac
      ? resolveManifestDownloadUrl({ entry: mac, platform: "mac", arch: "arm64" })
      : `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-arm64.dmg`,
    downloadUrlLinux: linux
      ? resolveManifestDownloadUrl({ entry: linux, platform: "linux", arch: "x64" })
      : `${RELEASE_DOWNLOAD_BASE}/Jarvis-x64.AppImage`,
    downloadUrlAndroid: android
      ? resolveManifestDownloadUrl({ entry: android, platform: "android" })
      : `${RELEASE_DOWNLOAD_BASE}/Jarvis-android.apk`,
  };
}

async function getFromGithub() {
  const token = getGithubToken();
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;

  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Release not found");

  const release = (await res.json()) as {
    id: number;
    tag_name: string;
    name: string;
    body: string | null;
    published_at: string;
    updated_at: string;
  };

  return {
    available: true,
    source: "github",
    releaseId: release.id,
    version: release.name ?? release.tag_name,
    releaseNotes: release.body ?? "",
    publishedAt: release.published_at,
    updatedAt: release.updated_at,
    downloadUrlWindows: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.exe`,
    downloadUrlMacIntel: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-x64.dmg`,
    downloadUrlMacArm64: `${RELEASE_DOWNLOAD_BASE}/JarvisSetup-arm64.dmg`,
    downloadUrlLinux: `${RELEASE_DOWNLOAD_BASE}/Jarvis-x64.AppImage`,
    downloadUrlAndroid: `${RELEASE_DOWNLOAD_BASE}/Jarvis-android.apk`,
  };
}

export async function GET(): Promise<Response> {
  try {
    const source = getUpdateSource();
    if (source === "manifest") {
      try {
        const manifestData = await getFromManifest();
        return Response.json(manifestData, {
          headers: {
            "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
          },
        });
      } catch (manifestError) {
        const githubData = await getFromGithub();
        return Response.json(
          {
            ...githubData,
            source: "github-fallback",
            warning: manifestError instanceof Error ? manifestError.message : "manifest-failed",
          },
          {
            headers: {
              "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
            },
          },
        );
      }
    }

    const githubData = await getFromGithub();
    return Response.json(githubData, {
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
