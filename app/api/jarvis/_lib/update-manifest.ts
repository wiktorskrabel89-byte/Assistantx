export type UpdateSource = "manifest" | "github";
export type UpdateChannel = "stable" | "beta";
export type UpdatePlatform = "windows" | "mac" | "linux" | "android";
export type UpdateArch = "x64" | "arm64";

type ManifestDesktopMeta = {
  feedUrl?: string;
  releaseNotesUrl?: string;
  minimumAllowedVersion?: string;
  stagingPercentage?: number;
  signatureUrl?: string;
};

export type NormalizedManifestPlatformEntry = {
  latestVersion: string;
  url: string;
  releaseNotes: string;
  publishedAt: string;
  checksum: string;
  signature: string;
  rolloutPercentage: number | null;
  desktop: ManifestDesktopMeta;
  artifacts: Record<string, string>;
};

type UnknownObject = Record<string, unknown>;

export const DEFAULT_UPDATES_HOST = "updates.assistantx.pl";
export const DEFAULT_MANIFEST_URL = `https://${DEFAULT_UPDATES_HOST}/versions.json`;

const DEFAULT_ALLOWED_DOWNLOAD_HOSTS = new Set([
  "updates.assistantx.pl",
  "assistantx.pl",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function asObject(value: unknown): UnknownObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownObject;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChannel(raw: string): UpdateChannel {
  const value = raw.toLowerCase();
  return value === "beta" ? "beta" : "stable";
}

export function getUpdateSource(raw = process.env.JARVIS_UPDATE_SOURCE): UpdateSource {
  return String(raw || "").trim().toLowerCase() === "manifest" ? "manifest" : "github";
}

export function getUpdateChannel(raw = process.env.JARVIS_UPDATE_CHANNEL): UpdateChannel {
  return normalizeChannel(String(raw || "stable"));
}

export function getUpdateManifestUrl(): string {
  const configured = normalizeString(process.env.JARVIS_UPDATE_MANIFEST_URL);
  return configured || DEFAULT_MANIFEST_URL;
}

function getAllowedHostsFromEnv(raw: string | undefined): Set<string> {
  const values = String(raw || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (values.length === 0) return new Set(DEFAULT_ALLOWED_DOWNLOAD_HOSTS);
  return new Set(values);
}

export function isAllowedHttpsUrl(rawUrl: string, allowedHosts = getAllowedHostsFromEnv(process.env.JARVIS_UPDATES_ALLOWED_HOSTS)): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (!allowedHosts.has(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function extractChannelData(manifest: UnknownObject, channel: UpdateChannel): UnknownObject | null {
  const channelsObj = asObject(manifest.channels);
  if (channelsObj) {
    const fromChannels = asObject(channelsObj[channel]);
    if (fromChannels) return fromChannels;
  }

  const directChannel = asObject(manifest[channel]);
  if (directChannel) return directChannel;
  return manifest;
}

export function normalizeManifestPlatformEntry(entry: unknown): NormalizedManifestPlatformEntry | null {
  const obj = asObject(entry);
  if (!obj) return null;

  const latestVersion = normalizeString(obj.latestVersion ?? obj.version);
  const directUrl = normalizeString(obj.url ?? obj.downloadUrl);
  const releaseNotes = normalizeString(obj.releaseNotes ?? obj.notesMarkdown ?? obj.notes);
  const publishedAt = normalizeString(obj.publishedAt ?? obj.updatedAt);
  const checksum = normalizeString(obj.checksum ?? obj.sha512);
  const signature = normalizeString(obj.signature ?? obj.signatureUrl);

  const rolloutObj = asObject(obj.rollout);
  const rolloutPercentageRaw = rolloutObj?.percentage;
  const rolloutPercentage = Number.isFinite(Number(rolloutPercentageRaw))
    ? Math.max(0, Math.min(100, Number(rolloutPercentageRaw)))
    : null;

  const desktopObj = asObject(obj.desktop) ?? {};
  const artifactsObj = asObject(obj.artifacts) ?? {};
  const artifacts: Record<string, string> = {};
  for (const [key, value] of Object.entries(artifactsObj)) {
    const normalized = normalizeString(value);
    if (normalized) artifacts[key] = normalized;
  }

  if (!latestVersion) return null;
  if (!directUrl && Object.keys(artifacts).length === 0) return null;

  return {
    latestVersion,
    url: directUrl,
    releaseNotes,
    publishedAt,
    checksum,
    signature,
    rolloutPercentage,
    desktop: {
      feedUrl: normalizeString(desktopObj.feedUrl),
      releaseNotesUrl: normalizeString(desktopObj.releaseNotesUrl),
      minimumAllowedVersion: normalizeString(desktopObj.minimumAllowedVersion),
      stagingPercentage: Number.isFinite(Number(desktopObj.stagingPercentage))
        ? Math.max(0, Math.min(100, Number(desktopObj.stagingPercentage)))
        : undefined,
      signatureUrl: normalizeString(desktopObj.signatureUrl),
    },
    artifacts,
  };
}

export function getManifestPlatformEntry(
  manifest: unknown,
  platform: UpdatePlatform,
  channel: UpdateChannel,
): NormalizedManifestPlatformEntry | null {
  const root = asObject(manifest);
  if (!root) return null;
  const channelData = extractChannelData(root, channel);
  if (!channelData) return null;

  const channelPlatforms = asObject(channelData.platforms);
  const fromPlatforms = channelPlatforms ? channelPlatforms[platform] : undefined;
  const direct = channelData[platform];
  return normalizeManifestPlatformEntry(fromPlatforms ?? direct);
}

export function resolveManifestDownloadUrl({
  entry,
  platform,
  arch,
}: {
  entry: NormalizedManifestPlatformEntry;
  platform: UpdatePlatform;
  arch?: UpdateArch;
}): string {
  if (platform === "windows") {
    if (arch === "arm64" && entry.artifacts.arm64) return entry.artifacts.arm64;
    if (arch === "x64" && entry.artifacts.x64) return entry.artifacts.x64;
  }
  if (platform === "mac") {
    if (arch === "arm64" && (entry.artifacts.arm64 || entry.artifacts.appleSilicon)) {
      return entry.artifacts.arm64 || entry.artifacts.appleSilicon;
    }
    if (arch === "x64" && (entry.artifacts.x64 || entry.artifacts.intel)) {
      return entry.artifacts.x64 || entry.artifacts.intel;
    }
  }
  if (platform === "linux") {
    if (arch === "arm64" && entry.artifacts.arm64) return entry.artifacts.arm64;
    if (entry.artifacts.x64) return entry.artifacts.x64;
  }
  if (platform === "android" && entry.artifacts.apk) {
    return entry.artifacts.apk;
  }

  return entry.url;
}

export async function fetchUpdateManifest(): Promise<unknown> {
  const manifestUrl = getUpdateManifestUrl();
  if (!isAllowedHttpsUrl(manifestUrl)) {
    throw new Error("manifest-url-not-allowed");
  }
  const response = await fetch(manifestUrl, {
    headers: {
      Accept: "application/json,text/plain,*/*",
    },
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`manifest-fetch-failed:${response.status}`);
  }
  return await response.json();
}
