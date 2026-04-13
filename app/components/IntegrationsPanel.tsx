"use client";

import { useMemo, useState } from "react";
import type { GitHubFileSummary, OAuthProvider } from "@/lib/integrations";

const PROVIDER_COPY: Record<OAuthProvider, { title: string; description: string }> = {
  google: {
    title: "Google",
    description: "Link Google with Drive read access so you can pull files straight into the chat.",
  },
  github: {
    title: "GitHub",
    description: "Link GitHub for private repo access, or browse public repos directly from the app.",
  },
};

type GitHubRepoResponse = {
  repo: string;
  ref: string;
  defaultBranch: string;
  description: string | null;
  isPrivate: boolean;
  truncated: boolean;
  files: GitHubFileSummary[];
};

type ImportedFileResponse = {
  name: string;
  mimeType: string;
  base64: string;
  prompt: string;
  sourceLabel: string;
};

function base64ToFile(base64: string, name: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: mimeType });
}

function providerBadge(isConnected: boolean, dark: boolean) {
  if (isConnected) {
    return dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-800";
  }
  return dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700";
}

export function IntegrationsPanel({
  dark,
  linkedProviders,
  authProvider,
  oauthLoading,
  copied,
  hasArtifacts,
  onConnectProvider,
  onImportFile,
  onCopyVsCodePrompt,
  onDownloadVsCodeBundle,
}: {
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
  oauthLoading: OAuthProvider | null;
  copied: string | null;
  hasArtifacts: boolean;
  onConnectProvider: (provider: OAuthProvider) => void;
  onImportFile: (file: File, prompt: string) => void;
  onCopyVsCodePrompt: () => void;
  onDownloadVsCodeBundle: () => void;
}) {
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubRefInput, setGithubRefInput] = useState("");
  const [githubFilter, setGithubFilter] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubImportingPath, setGithubImportingPath] = useState<string | null>(null);
  const [githubError, setGithubError] = useState("");
  const [githubMessage, setGithubMessage] = useState("");
  const [githubRepo, setGithubRepo] = useState<GitHubRepoResponse | null>(null);
  const [driveInput, setDriveInput] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveMessage, setDriveMessage] = useState("");

  const filteredFiles = useMemo(() => {
    if (!githubRepo) return [];
    const query = githubFilter.trim().toLowerCase();
    const files = query
      ? githubRepo.files.filter((file) => file.path.toLowerCase().includes(query))
      : githubRepo.files;
    return files.slice(0, 20);
  }, [githubFilter, githubRepo]);

  async function loadGitHubRepo() {
    if (!githubRepoInput.trim()) {
      setGithubError("Enter a GitHub repo like owner/repo or paste the repo URL.");
      return;
    }

    setGithubLoading(true);
    setGithubError("");
    setGithubMessage("");

    try {
      const params = new URLSearchParams({ repo: githubRepoInput.trim() });
      if (githubRefInput.trim()) params.set("ref", githubRefInput.trim());
      const response = await fetch(`/api/integrations/github?${params.toString()}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to load the GitHub repository.");
      }

      setGithubRepo(data as GitHubRepoResponse);
      setGithubMessage(`Loaded ${(data as GitHubRepoResponse).files.length} importable files from ${(data as GitHubRepoResponse).repo}.`);
    } catch (error) {
      setGithubRepo(null);
      setGithubError(error instanceof Error ? error.message : "Failed to load the GitHub repository.");
    } finally {
      setGithubLoading(false);
    }
  }

  async function importGitHubFile(path: string) {
    setGithubImportingPath(path);
    setGithubError("");
    setGithubMessage("");

    try {
      const response = await fetch("/api/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubRepoInput.trim(),
          ref: githubRepo?.ref ?? githubRefInput.trim(),
          path,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to import the GitHub file.");
      }

      const imported = data as ImportedFileResponse;
      onImportFile(base64ToFile(imported.base64, imported.name, imported.mimeType), imported.prompt);
      setGithubMessage(`Imported ${path} into the file analysis flow.`);
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : "Failed to import the GitHub file.");
    } finally {
      setGithubImportingPath(null);
    }
  }

  async function importDriveFile() {
    if (!driveInput.trim()) {
      setDriveError("Paste a Google Drive share link or file ID first.");
      return;
    }

    setDriveLoading(true);
    setDriveError("");
    setDriveMessage("");

    try {
      const response = await fetch("/api/integrations/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: driveInput.trim() }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to import the Google Drive file.");
      }

      const imported = data as ImportedFileResponse;
      onImportFile(base64ToFile(imported.base64, imported.name, imported.mimeType), imported.prompt);
      setDriveMessage(`Imported ${imported.name} from Google Drive.`);
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : "Failed to import the Google Drive file.");
    } finally {
      setDriveLoading(false);
    }
  }

  return (
    <section className={`rounded-3xl border p-4 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div>
        <h2 className="text-sm font-semibold">Integrations</h2>
        <p className="mt-1 text-xs text-gray-500">Google Drive import, GitHub repo browsing, and a VS Code handoff for the active chat.</p>
      </div>

      <div className="mt-4 space-y-3">
        {(["google", "github"] as const).map((provider) => {
          const isConnected = linkedProviders.includes(provider) || authProvider === provider;
          return (
            <div
              key={provider}
              className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{PROVIDER_COPY[provider].title}</div>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{PROVIDER_COPY[provider].description}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${providerBadge(isConnected, dark)}`}>
                  {isConnected ? "Connected" : "Available"}
                </span>
              </div>

              <button
                onClick={() => onConnectProvider(provider)}
                disabled={oauthLoading !== null}
                className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-medium transition ${
                  dark
                    ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50"
                    : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                }`}
              >
                {oauthLoading === provider ? `Redirecting to ${PROVIDER_COPY[provider].title}...` : isConnected ? `Refresh ${PROVIDER_COPY[provider].title} access` : `Connect ${PROVIDER_COPY[provider].title}`}
              </button>
            </div>
          );
        })}

        <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">GitHub repo import</div>
              <p className="mt-1 text-xs leading-5 text-gray-500">Load a repo tree, then import a source file directly into the chat as a staged upload.</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${linkedProviders.includes("github") || authProvider === "github" ? providerBadge(true, dark) : providerBadge(false, dark)}`}>
              {linkedProviders.includes("github") || authProvider === "github" ? "Private repos ready" : "Public repos only"}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <input
              value={githubRepoInput}
              onChange={(event) => setGithubRepoInput(event.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            <div className="flex gap-2">
              <input
                value={githubRefInput}
                onChange={(event) => setGithubRefInput(event.target.value)}
                placeholder="Branch or tag (optional)"
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
              />
              <button
                onClick={() => void loadGitHubRepo()}
                disabled={githubLoading}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
              >
                {githubLoading ? "Loading..." : "Load repo"}
              </button>
            </div>

            {githubRepo && (
              <>
                <div className="text-[11px] leading-5 text-gray-500">
                  {githubRepo.repo} on {githubRepo.ref}
                  {githubRepo.description ? ` • ${githubRepo.description}` : ""}
                  {githubRepo.truncated ? " • Tree truncated by GitHub API" : ""}
                </div>
                <input
                  value={githubFilter}
                  onChange={(event) => setGithubFilter(event.target.value)}
                  placeholder="Filter files"
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                />
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.path}
                      className={`rounded-xl border px-3 py-2 ${dark ? "border-gray-800 bg-gray-900/80" : "border-gray-200 bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{file.path}</div>
                          <div className="mt-1 text-[11px] text-gray-500">{file.language} • {Math.max(1, Math.round(file.size / 1024))} KB</div>
                        </div>
                        <button
                          onClick={() => void importGitHubFile(file.path)}
                          disabled={githubImportingPath !== null}
                          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${dark ? "bg-cyan-900 text-cyan-100 hover:bg-cyan-800 disabled:opacity-50" : "bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"}`}
                        >
                          {githubImportingPath === file.path ? "Importing..." : "Import"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {githubError && <div className="text-xs text-rose-400">{githubError}</div>}
            {githubMessage && <div className="text-xs text-emerald-400">{githubMessage}</div>}
          </div>
        </div>

        <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Google Drive import</div>
              <p className="mt-1 text-xs leading-5 text-gray-500">Paste a Drive link or file ID to stage that file in the existing upload and analysis flow.</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${linkedProviders.includes("google") || authProvider === "google" ? providerBadge(true, dark) : providerBadge(false, dark)}`}>
              {linkedProviders.includes("google") || authProvider === "google" ? "Drive ready" : "Link Google"}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <input
              value={driveInput}
              onChange={(event) => setDriveInput(event.target.value)}
              placeholder="https://drive.google.com/file/... or file ID"
              className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            <button
              onClick={() => void importDriveFile()}
              disabled={driveLoading}
              className={`w-full rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
            >
              {driveLoading ? "Importing..." : "Import from Drive"}
            </button>
            {driveError && <div className="text-xs text-rose-400">{driveError}</div>}
            {driveMessage && <div className="text-xs text-emerald-400">{driveMessage}</div>}
          </div>
        </div>

        <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">VS Code</div>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Copy or download the active chat with artifacts so you can continue inside VS Code or GitHub Copilot Chat.
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${dark ? "bg-cyan-950 text-cyan-200" : "bg-cyan-100 text-cyan-800"}`}>
              {hasArtifacts ? "Artifacts ready" : "Prompt ready"}
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={onCopyVsCodePrompt}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100"}`}
            >
              {copied === "vscode-prompt" ? "Copied" : "Copy VS Code prompt"}
            </button>
            <button
              onClick={onDownloadVsCodeBundle}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-cyan-900 text-cyan-100 hover:bg-cyan-800" : "bg-cyan-600 text-white hover:bg-cyan-500"}`}
            >
              Download bundle
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}