/**
 * @jest-environment node
 */
import {
  parseGitHubRepoInput,
  isGitHubImportablePath,
  guessLanguageFromPath,
  inferMimeType,
  parseGoogleDriveFileId,
  isLikelyImportableMime,
  isOAuthProvider,
  getLinkedProviders,
  getOAuthScopes,
  getProviderLabel,
  ensureExtension,
} from "@/lib/integrations";

// ---------------------------------------------------------------------------
// parseGitHubRepoInput
// ---------------------------------------------------------------------------
describe("parseGitHubRepoInput", () => {
  it("parses owner/repo shorthand", () => {
    expect(parseGitHubRepoInput("vercel/next.js")).toEqual({ owner: "vercel", repo: "next.js" });
  });

  it("parses a full HTTPS GitHub URL", () => {
    expect(parseGitHubRepoInput("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("strips trailing .git from URL", () => {
    expect(parseGitHubRepoInput("https://github.com/vercel/next.js.git")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("strips trailing .git from shorthand", () => {
    expect(parseGitHubRepoInput("vercel/next.js.git")).toEqual({ owner: "vercel", repo: "next.js" });
  });

  it("returns null for empty string", () => {
    expect(parseGitHubRepoInput("")).toBeNull();
    expect(parseGitHubRepoInput("   ")).toBeNull();
  });

  it("returns null when there is more than one slash (no URL)", () => {
    expect(parseGitHubRepoInput("foo/bar/baz")).toBeNull();
  });

  it("returns null for a single segment with no slash", () => {
    expect(parseGitHubRepoInput("justarepo")).toBeNull();
  });

  it("handles URL with extra path segments by taking first two", () => {
    const result = parseGitHubRepoInput("https://github.com/vercel/next.js/tree/main");
    expect(result).toEqual({ owner: "vercel", repo: "next.js" });
  });
});

// ---------------------------------------------------------------------------
// isGitHubImportablePath
// ---------------------------------------------------------------------------
describe("isGitHubImportablePath", () => {
  it("returns true for common code extensions", () => {
    expect(isGitHubImportablePath("src/index.ts")).toBe(true);
    expect(isGitHubImportablePath("app/page.tsx")).toBe(true);
    expect(isGitHubImportablePath("script.py")).toBe(true);
    expect(isGitHubImportablePath("main.go")).toBe(true);
  });

  it("returns true for well-known plain-text basenames", () => {
    expect(isGitHubImportablePath("Makefile")).toBe(true);
    expect(isGitHubImportablePath("Dockerfile")).toBe(true);
    expect(isGitHubImportablePath("LICENSE")).toBe(true);
    expect(isGitHubImportablePath("README.md")).toBe(true);
  });

  it("returns false for binary or unknown extensions", () => {
    expect(isGitHubImportablePath("image.png")).toBe(false);
    expect(isGitHubImportablePath("archive.zip")).toBe(false);
    expect(isGitHubImportablePath("binary.exe")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isGitHubImportablePath("")).toBe(false);
  });

  it("returns false for directory-like paths (trailing slash)", () => {
    expect(isGitHubImportablePath("src/")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// guessLanguageFromPath
// ---------------------------------------------------------------------------
describe("guessLanguageFromPath", () => {
  it("returns correct language for known extensions", () => {
    expect(guessLanguageFromPath("app.ts")).toBe("typescript");
    expect(guessLanguageFromPath("app.tsx")).toBe("tsx");
    expect(guessLanguageFromPath("script.py")).toBe("python");
    expect(guessLanguageFromPath("main.go")).toBe("go");
    expect(guessLanguageFromPath("style.css")).toBe("css");
    expect(guessLanguageFromPath("data.json")).toBe("json");
    expect(guessLanguageFromPath("query.sql")).toBe("sql");
  });

  it("returns 'text' for well-known plain-text basenames", () => {
    expect(guessLanguageFromPath("Dockerfile")).toBe("text");
    expect(guessLanguageFromPath("Makefile")).toBe("text");
  });

  it("returns 'text' for unknown extensions", () => {
    expect(guessLanguageFromPath("binary.xyz")).toBe("text");
  });

  it("uses the last segment of the path as the filename", () => {
    expect(guessLanguageFromPath("src/utils/helpers.ts")).toBe("typescript");
  });
});

// ---------------------------------------------------------------------------
// inferMimeType
// ---------------------------------------------------------------------------
describe("inferMimeType", () => {
  it("returns the correct MIME for known extensions", () => {
    expect(inferMimeType("file.json")).toBe("application/json");
    expect(inferMimeType("file.csv")).toBe("text/csv");
    expect(inferMimeType("page.html")).toBe("text/html");
    expect(inferMimeType("app.js")).toBe("text/javascript");
    expect(inferMimeType("notes.md")).toBe("text/markdown");
  });

  it("returns text/plain fallback for unknown extensions", () => {
    expect(inferMimeType("file.xyz")).toBe("text/plain");
  });

  it("accepts a custom fallback", () => {
    expect(inferMimeType("file.xyz", "application/octet-stream")).toBe("application/octet-stream");
  });

  it("is case-insensitive for the extension", () => {
    expect(inferMimeType("FILE.JSON")).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// parseGoogleDriveFileId
// ---------------------------------------------------------------------------
describe("parseGoogleDriveFileId", () => {
  it("returns a bare file ID as-is", () => {
    const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms";
    expect(parseGoogleDriveFileId(id)).toBe(id);
  });

  it("parses the file ID from an /open?id= URL", () => {
    const url = "https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms";
    expect(parseGoogleDriveFileId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms");
  });

  it("parses the file ID from a /file/d/ URL", () => {
    const url = "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/view";
    expect(parseGoogleDriveFileId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms");
  });

  it("returns null for an empty string", () => {
    expect(parseGoogleDriveFileId("")).toBeNull();
    expect(parseGoogleDriveFileId("   ")).toBeNull();
  });

  it("returns null for a short non-URL string", () => {
    expect(parseGoogleDriveFileId("short")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isOAuthProvider
// ---------------------------------------------------------------------------
describe("isOAuthProvider", () => {
  it('returns true for "google" and "github"', () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("github")).toBe(true);
  });

  it("returns false for other strings", () => {
    expect(isOAuthProvider("twitter")).toBe(false);
    expect(isOAuthProvider("")).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isOAuthProvider(null)).toBe(false);
    expect(isOAuthProvider(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLinkedProviders
// ---------------------------------------------------------------------------
describe("getLinkedProviders", () => {
  it("extracts linked OAuth providers from identities", () => {
    const identities = [{ provider: "google" }, { provider: "github" }];
    const providers = getLinkedProviders(identities);
    expect(providers).toContain("google");
    expect(providers).toContain("github");
    expect(providers).toHaveLength(2);
  });

  it("deduplicates providers", () => {
    const identities = [{ provider: "google" }, { provider: "google" }];
    expect(getLinkedProviders(identities)).toHaveLength(1);
  });

  it("ignores non-OAuth providers", () => {
    const identities = [{ provider: "twitter" }, { provider: "google" }];
    const providers = getLinkedProviders(identities);
    expect(providers).toEqual(["google"]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(getLinkedProviders(null)).toEqual([]);
    expect(getLinkedProviders(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getOAuthScopes
// ---------------------------------------------------------------------------
describe("getOAuthScopes", () => {
  it("returns a non-empty scope string for google", () => {
    const scopes = getOAuthScopes("google");
    expect(typeof scopes).toBe("string");
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes).toContain("email");
  });

  it("returns a non-empty scope string for github", () => {
    const scopes = getOAuthScopes("github");
    expect(typeof scopes).toBe("string");
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes).toContain("repo");
  });
});

// ---------------------------------------------------------------------------
// getProviderLabel
// ---------------------------------------------------------------------------
describe("getProviderLabel", () => {
  it('returns "Google" for google', () => {
    expect(getProviderLabel("google")).toBe("Google");
  });

  it('returns "GitHub" for github', () => {
    expect(getProviderLabel("github")).toBe("GitHub");
  });
});

// ---------------------------------------------------------------------------
// ensureExtension
// ---------------------------------------------------------------------------
describe("ensureExtension", () => {
  it("leaves the filename unchanged if it already has the extension", () => {
    expect(ensureExtension("report.pdf", ".pdf")).toBe("report.pdf");
  });

  it("appends the extension when missing", () => {
    expect(ensureExtension("report", ".pdf")).toBe("report.pdf");
  });

  it("is case-insensitive when checking the extension", () => {
    expect(ensureExtension("report.PDF", ".pdf")).toBe("report.PDF");
  });
});

// ---------------------------------------------------------------------------
// isLikelyImportableMime
// ---------------------------------------------------------------------------
describe("isLikelyImportableMime", () => {
  it("returns true for text/* MIME types", () => {
    expect(isLikelyImportableMime("text/plain", "file.txt")).toBe(true);
    expect(isLikelyImportableMime("text/html", "file.html")).toBe(true);
  });

  it("returns true for application/json and application/xml", () => {
    expect(isLikelyImportableMime("application/json", "data.json")).toBe(true);
    expect(isLikelyImportableMime("application/xml", "data.xml")).toBe(true);
  });

  it("returns true for image/* MIME types", () => {
    expect(isLikelyImportableMime("image/png", "photo.png")).toBe(true);
    expect(isLikelyImportableMime("image/svg+xml", "icon.svg")).toBe(true);
  });

  it("returns true for application/pdf", () => {
    expect(isLikelyImportableMime("application/pdf", "doc.pdf")).toBe(true);
  });

  it("falls back to path-based check when mimeType is empty", () => {
    expect(isLikelyImportableMime("", "script.py")).toBe(true);
    expect(isLikelyImportableMime("", "binary.exe")).toBe(false);
  });
});
