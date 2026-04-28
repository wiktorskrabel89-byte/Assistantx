export type OAuthProvider = "google" | "github";

export type GitHubFileSummary = {
  path: string;
  size: number;
  language: string;
};

export type ImportedFilePayload = {
  name: string;
  mimeType: string;
  base64: string;
  prompt: string;
  sourceLabel: string;
};

const GITHUB_IMPORTABLE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "csv",
  "env",
  "go",
  "graphql",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "md",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const PLAIN_TEXT_BASENAMES = new Set([
  "dockerfile",
  "license",
  "makefile",
  "readme",
  "readme.md",
  "changelog",
  "changelog.md",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  csv: "csv",
  go: "go",
  graphql: "graphql",
  h: "c",
  hpp: "cpp",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  md: "markdown",
  mjs: "javascript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  svg: "svg",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  css: "text/css",
  html: "text/html",
  js: "text/javascript",
  json: "application/json",
  jsx: "text/plain",
  md: "text/markdown",
  pdf: "application/pdf",
  py: "text/x-python",
  sql: "text/plain",
  svg: "image/svg+xml",
  ts: "text/plain",
  tsx: "text/plain",
  txt: "text/plain",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
};

export const GOOGLE_DRIVE_EXPORTS: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": { mimeType: "text/plain", extension: ".txt" },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", extension: ".pdf" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "text/csv", extension: ".csv" },
};

const PROVIDER_COOKIE_NAMES: Record<OAuthProvider, string> = {
  google: "assistantx_google_provider_token",
  github: "assistantx_github_provider_token",
};

const PROVIDER_SCOPES: Record<OAuthProvider, string> = {
  google: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].join(" "),
  github: "read:user repo",
};

export function getOAuthScopes(provider: OAuthProvider) {
  return PROVIDER_SCOPES[provider];
}

export function getOAuthQueryParams(provider: OAuthProvider) {
  if (provider === "google") {
    return {
      access_type: "offline",
      prompt: "consent",
    };
  }

  return undefined;
}

export function getProviderTokenCookieName(provider: OAuthProvider) {
  return PROVIDER_COOKIE_NAMES[provider];
}

export function getProviderLabel(provider: OAuthProvider) {
  return provider === "google" ? "Google" : "GitHub";
}

export function isOAuthProvider(value: string | null | undefined): value is OAuthProvider {
  return value === "google" || value === "github";
}

export function getLinkedProviders(identities: Array<{ provider?: string | null }> | null | undefined): OAuthProvider[] {
  const providers = new Set<OAuthProvider>();
  for (const identity of identities ?? []) {
    if (isOAuthProvider(identity.provider)) providers.add(identity.provider);
  }
  return Array.from(providers);
}

export function parseGitHubRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/i, "");
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    } catch {
      return null;
    }
  }

  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function isGitHubImportablePath(path: string) {
  const normalized = path.trim().toLowerCase();
  if (!normalized || normalized.endsWith("/")) return false;
  const basename = normalized.split("/").pop() ?? normalized;
  if (PLAIN_TEXT_BASENAMES.has(basename)) return true;
  const extension = basename.includes(".") ? basename.split(".").pop() ?? "" : "";
  return GITHUB_IMPORTABLE_EXTENSIONS.has(extension);
}

export function guessLanguageFromPath(path: string) {
  const basename = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  if (PLAIN_TEXT_BASENAMES.has(basename)) return "text";
  const extension = basename.includes(".") ? basename.split(".").pop() ?? "" : "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}

export function inferMimeType(fileName: string, fallback = "text/plain") {
  const extension = fileName.toLowerCase().includes(".") ? fileName.toLowerCase().split(".").pop() ?? "" : "";
  return MIME_BY_EXTENSION[extension] ?? fallback;
}

export function ensureExtension(fileName: string, extension: string) {
  return fileName.toLowerCase().endsWith(extension.toLowerCase()) ? fileName : `${fileName}${extension}`;
}

export function parseGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const idParam = url.searchParams.get("id");
    if (idParam) return idParam;

    const match = url.pathname.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (match) return match[1];
  } catch {
    return null;
  }

  return null;
}

export function isLikelyImportableMime(mimeType: string, fileName: string) {
  if (!mimeType) return isGitHubImportablePath(fileName);
  if (mimeType.startsWith("image/")) return true;
  if (mimeType === "application/pdf") return true;
  if (mimeType === "application/json" || mimeType === "application/xml") return true;
  if (mimeType.startsWith("text/")) return true;
  return isGitHubImportablePath(fileName);
}