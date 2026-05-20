"use client";

import { ChevronDown, GitBranch, GitPullRequest, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { GitHubFileSummary, OAuthProvider } from "@/lib/integrations";

type UserRepo = {
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
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

type GitHubIntegrationProps = {
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
  onImportFile: (file: File, prompt: string) => void;
  highlightCard?: boolean;
};

export function GitHubIntegration({ dark, linkedProviders, authProvider, onImportFile, highlightCard = false }: GitHubIntegrationProps) {
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubRefInput, setGithubRefInput] = useState("");
  const [githubFilter, setGithubFilter] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubImportingPath, setGithubImportingPath] = useState<string | null>(null);
  const [githubError, setGithubError] = useState("");
  const [githubMessage, setGithubMessage] = useState("");
  const [githubRepo, setGithubRepo] = useState<GitHubRepoResponse | null>(null);

  const [userRepos, setUserRepos] = useState<UserRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const [showCommitPanel, setShowCommitPanel] = useState(false);
  const [commitBranch, setCommitBranch] = useState("");
  const [commitPath, setCommitPath] = useState("");
  const [commitContent, setCommitContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  const [showPrPanel, setShowPrPanel] = useState(false);
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prLoading, setPrLoading] = useState(false);
  const [prResult, setPrResult] = useState<{ ok?: boolean; prUrl?: string; error?: string } | null>(null);

  const filteredFiles = useMemo(() => {
    if (!githubRepo) return [];
    const query = githubFilter.trim().toLowerCase();
    const files = query
      ? githubRepo.files.filter((file) => file.path.toLowerCase().includes(query))
      : githubRepo.files;
    return files.slice(0, 50);
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

  async function loadUserRepos() {
    setReposLoading(true);
    setReposError("");
    try {
      const response = await fetch("/api/integrations/github/repos");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to list repositories.");
      setUserRepos((data as { repos: UserRepo[] }).repos ?? []);
      setShowRepoDropdown(true);
    } catch (error) {
      setReposError(error instanceof Error ? error.message : "Failed to list repositories.");
    } finally {
      setReposLoading(false);
    }
  }

  function pickUserRepo(repo: UserRepo) {
    setGithubRepoInput(repo.fullName);
    setGithubRefInput(repo.defaultBranch);
    setCommitBranch(repo.defaultBranch);
    setPrBase(repo.defaultBranch);
    setShowRepoDropdown(false);
    setSelectedPaths(new Set());
    setGithubRepo(null);
  }

  function toggleFilePath(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function importSelectedFiles() {
    if (selectedPaths.size === 0) return;
    setGithubError("");
    setGithubMessage("");
    const paths = Array.from(selectedPaths);
    let imported = 0;
    for (const path of paths) {
      setGithubImportingPath(path);
      try {
        const response = await fetch("/api/integrations/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo: githubRepoInput.trim(), ref: githubRepo?.ref ?? githubRefInput.trim(), path }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to import file.");
        const file = data as ImportedFileResponse;
        onImportFile(base64ToFile(file.base64, file.name, file.mimeType), file.prompt);
        imported += 1;
      } catch { /* skip individual failures */ }
    }
    setGithubImportingPath(null);
    setGithubMessage(`Imported ${imported} of ${paths.length} selected files into the chat.`);
    setSelectedPaths(new Set());
  }

  async function commitToGitHub() {
    setCommitLoading(true);
    setCommitResult(null);
    try {
      const response = await fetch("/api/integrations/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubRepoInput.trim(),
          branch: commitBranch.trim(),
          path: commitPath.trim(),
          content: commitContent,
          message: commitMessage.trim() || "Update via AssistantX",
        }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Commit failed.");
      setCommitResult({ ok: true, url: data.url });
    } catch (error) {
      setCommitResult({ error: error instanceof Error ? error.message : "Commit failed." });
    } finally {
      setCommitLoading(false);
    }
  }

  async function createPullRequest() {
    setPrLoading(true);
    setPrResult(null);
    try {
      const response = await fetch("/api/integrations/github/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubRepoInput.trim(),
          head: prHead.trim(),
          base: prBase.trim(),
          title: prTitle.trim() || "Changes from AssistantX",
          body: prBody.trim(),
        }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; prUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to create PR.");
      setPrResult({ ok: true, prUrl: data.prUrl });
    } catch (error) {
      setPrResult({ error: error instanceof Error ? error.message : "Failed to create PR." });
    } finally {
      setPrLoading(false);
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

  const isGithubConnected = linkedProviders.includes("github") || authProvider === "github";

  return (
    <div className={`rounded-2xl border px-3 py-3 transition-shadow ${highlightCard ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-background shadow-[0_0_0_1px_rgba(56,189,248,0.35)]" : ""} ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">GitHub repo import</div>
          <p className="mt-1 text-xs leading-5 text-gray-500">Browse private and public repos, select files, and import them into the chat.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${providerBadge(isGithubConnected, dark)}`}>
          {isGithubConnected ? "Private repos ready" : "Public repos only"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {isGithubConnected && (
          <div className="relative">
            <button
              onClick={() => { void loadUserRepos(); }}
              disabled={reposLoading}
              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition ${dark ? "border-gray-700 bg-gray-900 text-gray-100 hover:bg-gray-800 disabled:opacity-50" : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50"}`}
            >
              <span className="truncate text-left">
                {githubRepoInput || (reposLoading ? "Loading repos…" : "My repositories")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>
            {showRepoDropdown && userRepos.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowRepoDropdown(false)} />
                <div className={`absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border shadow-lg ${dark ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
                  {userRepos.map((repo) => (
                    <button
                      key={repo.fullName}
                      onClick={() => pickUserRepo(repo)}
                      className={`flex w-full flex-col items-start px-3 py-2.5 text-left transition ${dark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {repo.private && <span className="rounded bg-gray-700 px-1 py-0.5 text-[10px] text-gray-300">private</span>}
                        {repo.fullName}
                      </div>
                      {repo.description && <div className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{repo.description}</div>}
                    </button>
                  ))}
                </div>
              </>
            )}
            {reposError && <div className="mt-1 text-xs text-rose-400">{reposError}</div>}
          </div>
        )}

        <input
          id="github-repo-input"
          name="githubRepoInput"
          value={githubRepoInput}
          onChange={(event) => setGithubRepoInput(event.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
          className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
        />
        <div className="flex gap-2">
          <input
            id="github-ref-input"
            name="githubRefInput"
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
              id="github-file-filter"
              name="githubFileFilter"
              value={githubFilter}
              onChange={(event) => setGithubFilter(event.target.value)}
              placeholder="Filter files by path…"
              className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            {selectedPaths.size > 0 && (
              <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${dark ? "bg-cyan-950 text-cyan-200" : "bg-cyan-50 text-cyan-800"}`}>
                <span className="text-xs">{selectedPaths.size} file{selectedPaths.size !== 1 ? "s" : ""} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedPaths(new Set())} className="text-xs underline opacity-70 hover:opacity-100">Clear</button>
                  <button
                    onClick={() => void importSelectedFiles()}
                    disabled={githubImportingPath !== null}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${dark ? "bg-cyan-800 text-white hover:bg-cyan-700 disabled:opacity-50" : "bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"}`}
                  >
                    {githubImportingPath ? "Importing…" : "Import selected"}
                  </button>
                </div>
              </div>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {filteredFiles.map((file) => (
                <div
                  key={file.path}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${selectedPaths.has(file.path) ? (dark ? "border-cyan-700 bg-cyan-950/60" : "border-cyan-300 bg-cyan-50") : (dark ? "border-gray-800 bg-gray-900/80" : "border-gray-200 bg-white")}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${file.path}`}
                    checked={selectedPaths.has(file.path)}
                    onChange={() => toggleFilePath(file.path)}
                    className="h-3.5 w-3.5 shrink-0 accent-cyan-500"
                  />
                  <div className="min-w-0 flex-1" onClick={() => toggleFilePath(file.path)} role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFilePath(file.path); } }}>
                    <div className="truncate text-sm font-medium cursor-pointer">{file.path}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{file.language} • {Math.max(1, Math.round(file.size / 1024))} KB</div>
                  </div>
                  <button
                    onClick={() => void importGitHubFile(file.path)}
                    disabled={githubImportingPath !== null}
                    className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium transition ${dark ? "bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50" : "bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"}`}
                  >
                    {githubImportingPath === file.path ? "…" : "↑"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {githubError && <div className="text-xs text-rose-400">{githubError}</div>}
        {githubMessage && <div className="text-xs text-emerald-400">{githubMessage}</div>}

        {/* Commit panel */}
        <div className={`rounded-xl border ${dark ? "border-gray-800" : "border-gray-200"}`}>
          <button
            onClick={() => setShowCommitPanel((v) => !v)}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium transition ${dark ? "text-gray-300 hover:text-white" : "text-gray-700 hover:text-gray-900"}`}
          >
            <Upload className="h-3.5 w-3.5 text-emerald-400" />
            Commit to GitHub
            <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showCommitPanel ? "rotate-180" : ""}`} />
          </button>
          {showCommitPanel && (
            <div className={`space-y-2 border-t px-3 pb-3 pt-2 ${dark ? "border-gray-800" : "border-gray-200"}`}>
              <p className="text-[11px] text-gray-500">Creates or updates a file in your repository directly from AssistantX.</p>
              <input id="commit-branch" name="commitBranch" value={commitBranch} onChange={(e) => setCommitBranch(e.target.value)} placeholder="Branch (e.g. main)" className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              <input id="commit-path" name="commitPath" value={commitPath} onChange={(e) => setCommitPath(e.target.value)} placeholder="File path (e.g. src/index.ts)" className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              <textarea id="commit-content" name="commitContent" value={commitContent} onChange={(e) => setCommitContent(e.target.value)} placeholder="File content…" rows={4} className={`w-full rounded-xl border px-3 py-2 font-mono text-xs resize-none ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              <input id="commit-message" name="commitMessage" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message (optional)" className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              <button
                onClick={() => void commitToGitHub()}
                disabled={commitLoading || !githubRepoInput.trim() || !commitBranch.trim() || !commitPath.trim()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-emerald-900 text-emerald-100 hover:bg-emerald-800 disabled:opacity-50" : "bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"}`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {commitLoading ? "Committing…" : "Commit file"}
              </button>
              {commitResult?.ok && (
                <div className="text-xs text-emerald-400">
                  Committed! {commitResult.url && <a href={commitResult.url} target="_blank" rel="noopener noreferrer" className="underline">View on GitHub ↗</a>}
                </div>
              )}
              {commitResult?.error && <div className="text-xs text-rose-400">{commitResult.error}</div>}
            </div>
          )}
        </div>

        {/* Pull Request panel */}
        <div className={`rounded-xl border ${dark ? "border-gray-800" : "border-gray-200"}`}>
          <button
            onClick={() => setShowPrPanel((v) => !v)}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium transition ${dark ? "text-gray-300 hover:text-white" : "text-gray-700 hover:text-gray-900"}`}
          >
            <GitPullRequest className="h-3.5 w-3.5 text-violet-400" />
            Create Pull Request
            <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showPrPanel ? "rotate-180" : ""}`} />
          </button>
          {showPrPanel && (
            <div className={`space-y-2 border-t px-3 pb-3 pt-2 ${dark ? "border-gray-800" : "border-gray-200"}`}>
              <p className="text-[11px] text-gray-500">Open a pull request in your repository. Commit changes to a branch first.</p>
              <div className="flex gap-2">
                <input id="pr-head" name="prHead" value={prHead} onChange={(e) => setPrHead(e.target.value)} placeholder="Head branch (feature)" className={`flex-1 rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
                <input id="pr-base" name="prBase" value={prBase} onChange={(e) => setPrBase(e.target.value)} placeholder="Base branch (main)" className={`flex-1 rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              </div>
              <input id="pr-title" name="prTitle" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} placeholder="PR title" className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              <textarea id="pr-body" name="prBody" value={prBody} onChange={(e) => setPrBody(e.target.value)} placeholder="PR description (optional)" rows={3} className={`w-full rounded-xl border px-3 py-2 text-sm resize-none ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`} />
              <button
                onClick={() => void createPullRequest()}
                disabled={prLoading || !githubRepoInput.trim() || !prHead.trim() || !prBase.trim()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-violet-900 text-violet-100 hover:bg-violet-800 disabled:opacity-50" : "bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"}`}
              >
                <GitPullRequest className="h-3.5 w-3.5" />
                {prLoading ? "Creating PR…" : "Create pull request"}
              </button>
              {prResult?.ok && (
                <div className="text-xs text-emerald-400">
                  PR created!{" "}
                  {prResult.prUrl && <a href={prResult.prUrl} target="_blank" rel="noopener noreferrer" className="underline">View PR ↗</a>}
                </div>
              )}
              {prResult?.error && <div className="text-xs text-rose-400">{prResult.error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
