"use client";

import { useMemo, useState } from "react";
import type { GitHubFileSummary, OAuthProvider } from "@/lib/integrations";
import { Calendar, ChevronDown, GitBranch, GitPullRequest, Mail, Plus, RefreshCw, Sparkles, Upload } from "lucide-react";

type UserRepo = {
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
};

type GmailMessageSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
};

type CalendarEventSummary = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location: string;
  htmlLink: string;
  allDay: boolean;
};

const PROVIDER_COPY: Record<OAuthProvider, { title: string; description: string }> = {
  google: {
    title: "Google",
    description: "Link Google for Drive, Gmail, and Calendar access directly in the chat.",
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
  onSendGoogleContext,
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
  /** Called with a context string to inject into the next chat message */
  onSendGoogleContext?: (context: string) => void;
}) {
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubRefInput, setGithubRefInput] = useState("");
  const [githubFilter, setGithubFilter] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubImportingPath, setGithubImportingPath] = useState<string | null>(null);
  const [githubError, setGithubError] = useState("");
  const [githubMessage, setGithubMessage] = useState("");
  const [githubRepo, setGithubRepo] = useState<GitHubRepoResponse | null>(null);

  // User's own repos (private + public)
  const [userRepos, setUserRepos] = useState<UserRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  // Multi-file selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Commit panel
  const [showCommitPanel, setShowCommitPanel] = useState(false);
  const [commitBranch, setCommitBranch] = useState("");
  const [commitPath, setCommitPath] = useState("");
  const [commitContent, setCommitContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  // PR panel
  const [showPrPanel, setShowPrPanel] = useState(false);
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prLoading, setPrLoading] = useState(false);
  const [prResult, setPrResult] = useState<{ ok?: boolean; prUrl?: string; error?: string } | null>(null);

  const [driveInput, setDriveInput] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveMessage, setDriveMessage] = useState("");

  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState("");
  const [gmailAnalysis, setGmailAnalysis] = useState<string | null>(null);
  const [gmailAnalyzing, setGmailAnalyzing] = useState(false);
  const [gmailAnalysisQuery, setGmailAnalysisQuery] = useState("");

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  // Create event form
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const [createEventLoading, setCreateEventLoading] = useState(false);
  const [createEventResult, setCreateEventResult] = useState<{ ok?: boolean; htmlLink?: string; error?: string } | null>(null);

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

  async function fetchGmailMessages() {
    setGmailLoading(true);
    setGmailError("");

    try {
      const response = await fetch("/api/integrations/gmail?maxResults=20");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to fetch Gmail messages.");
      }

      setGmailMessages((data as { messages: GmailMessageSummary[] }).messages);
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : "Failed to fetch Gmail messages.");
    } finally {
      setGmailLoading(false);
    }
  }

  async function analyzeGmail() {
    setGmailAnalyzing(true);
    setGmailError("");
    setGmailAnalysis(null);

    try {
      const response = await fetch("/api/integrations/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxResults: 20,
          query: gmailAnalysisQuery.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        messages?: GmailMessageSummary[];
        analysis?: string | null;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "Analysis failed.");

      if (data.messages) setGmailMessages(data.messages);

      if (data.analysis) {
        setGmailAnalysis(data.analysis);
        // Also inject into chat context if callback is available
        const emailList = (data.messages ?? [])
          .map((m) => `Subject: ${m.subject} | From: ${m.from}`)
          .join("\n");
        onSendGoogleContext?.(
          `Gmail inbox (${(data.messages ?? []).length} emails):\n${emailList}\n\nAI analysis:\n${data.analysis}`
        );
      }
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setGmailAnalyzing(false);
    }
  }

  async function fetchCalendarEvents() {
    setCalendarLoading(true);
    setCalendarError("");

    try {
      const response = await fetch("/api/integrations/google-calendar?maxResults=10&daysAhead=7");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to fetch calendar events.");
      }

      setCalendarEvents((data as { events: CalendarEventSummary[] }).events);
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Failed to fetch calendar events.");
    } finally {
      setCalendarLoading(false);
    }
  }

  async function createCalendarEvent() {
    setCreateEventLoading(true);
    setCreateEventResult(null);

    try {
      const response = await fetch("/api/integrations/google-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEventTitle.trim() || "New Event",
          description: newEventDesc.trim(),
          location: newEventLocation.trim(),
          startDateTime: newEventStart,
          endDateTime: newEventEnd || undefined,
          allDay: newEventAllDay,
        }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; htmlLink?: string; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Failed to create event.");

      setCreateEventResult({ ok: true, htmlLink: data.htmlLink });
      // Refresh calendar events
      void fetchCalendarEvents();
      // Reset form
      setNewEventTitle(""); setNewEventStart(""); setNewEventEnd(""); setNewEventDesc(""); setNewEventLocation("");
    } catch (error) {
      setCreateEventResult({ error: error instanceof Error ? error.message : "Failed to create event." });
    } finally {
      setCreateEventLoading(false);
    }
  }

  function formatGmailDate(isoDate: string) {
    if (!isoDate) return "";
    try {
      return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoDate;
    }
  }

  function formatCalendarDate(isoDate: string, allDay: boolean) {
    if (!isoDate) return "";
    try {
      if (allDay) return new Date(isoDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      return new Date(isoDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoDate;
    }
  }

  const googleConnected = linkedProviders.includes("google") || authProvider === "google";

  return (
    <section className={`rounded-3xl border p-4 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div>
        <h2 className="text-sm font-semibold">Integrations</h2>
        <p className="mt-1 text-xs text-gray-500">Google Drive, Gmail, Calendar, GitHub, and VS Code tools for this chat.</p>
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
              <p className="mt-1 text-xs leading-5 text-gray-500">Browse private and public repos, select files, and import them into the chat.</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${linkedProviders.includes("github") || authProvider === "github" ? providerBadge(true, dark) : providerBadge(false, dark)}`}>
              {linkedProviders.includes("github") || authProvider === "github" ? "Private repos ready" : "Public repos only"}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {/* My repos picker — only when GitHub is connected */}
            {(linkedProviders.includes("github") || authProvider === "github") && (
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

            {/* Manual repo input */}
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
                {/* Multi-select action bar */}
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
                      <div className="min-w-0 flex-1" onClick={() => toggleFilePath(file.path)} role="button" tabIndex={-1} onKeyDown={() => {}}>
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
                  <input
                    value={commitBranch}
                    onChange={(e) => setCommitBranch(e.target.value)}
                    placeholder="Branch (e.g. main)"
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                  />
                  <input
                    value={commitPath}
                    onChange={(e) => setCommitPath(e.target.value)}
                    placeholder="File path (e.g. src/index.ts)"
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                  />
                  <textarea
                    value={commitContent}
                    onChange={(e) => setCommitContent(e.target.value)}
                    placeholder="File content…"
                    rows={4}
                    className={`w-full rounded-xl border px-3 py-2 font-mono text-xs resize-none ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                  />
                  <input
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message (optional)"
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                  />
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
                    <input
                      value={prHead}
                      onChange={(e) => setPrHead(e.target.value)}
                      placeholder="Head branch (feature)"
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                    />
                    <input
                      value={prBase}
                      onChange={(e) => setPrBase(e.target.value)}
                      placeholder="Base branch (main)"
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                    />
                  </div>
                  <input
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="PR title"
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                  />
                  <textarea
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                    placeholder="PR description (optional)"
                    rows={3}
                    className={`w-full rounded-xl border px-3 py-2 text-sm resize-none ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                  />
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
              id="drive-input"
              name="driveInput"
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
            <div className="flex items-start gap-2">
              <Mail className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-blue-400" : "text-blue-600"}`} />
              <div>
                <div className="text-sm font-medium">Gmail</div>
                <p className="mt-1 text-xs leading-5 text-gray-500">View and analyze your inbox with AI. Connect Google to enable Gmail access.</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${googleConnected ? providerBadge(true, dark) : providerBadge(false, dark)}`}>
              {googleConnected ? "Gmail ready" : "Link Google"}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => void fetchGmailMessages()}
                disabled={gmailLoading || !googleConnected}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${gmailLoading ? "animate-spin" : ""}`} />
                {gmailLoading ? "Loading..." : "Load emails"}
              </button>
              <button
                onClick={() => void analyzeGmail()}
                disabled={gmailAnalyzing || !googleConnected}
                title="AI analyzes your inbox and tells you which emails are important"
                aria-label="Analyze inbox with AI"
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-blue-900/70 text-blue-200 hover:bg-blue-800 disabled:opacity-50" : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"}`}
              >
                <Sparkles className={`h-3.5 w-3.5 ${gmailAnalyzing ? "animate-spin" : ""}`} />
                {gmailAnalyzing ? "Analyzing..." : "Analyze with AI"}
              </button>
            </div>

            <input
              type="text"
              value={gmailAnalysisQuery}
              onChange={(e) => setGmailAnalysisQuery(e.target.value)}
              placeholder="Custom question (e.g. which emails need urgent reply?)"
              disabled={!googleConnected}
              className={`w-full rounded-xl border px-3 py-2 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"} disabled:opacity-50`}
            />

            {gmailAnalysis && (
              <div className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${dark ? "border-blue-900 bg-blue-950/40 text-blue-100" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
                <div className="mb-1 font-semibold">AI inbox analysis</div>
                <div className="whitespace-pre-wrap">{gmailAnalysis}</div>
              </div>
            )}

            {gmailMessages.length > 0 && (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {gmailMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl border px-3 py-2 ${dark ? "border-gray-800 bg-gray-900/80" : "border-gray-200 bg-white"}`}
                  >
                    <div className="truncate text-sm font-medium">{msg.subject}</div>
                    <div className="mt-0.5 truncate text-[11px] text-gray-500">{msg.from}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{msg.snippet}</div>
                    {msg.date && <div className="mt-1 text-[10px] text-gray-500">{formatGmailDate(msg.date)}</div>}
                  </div>
                ))}
              </div>
            )}

            {gmailError && <div className="text-xs text-rose-400">{gmailError}</div>}
          </div>
        </div>

        <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Calendar className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-green-400" : "text-green-600"}`} />
              <div>
                <div className="text-sm font-medium">Google Calendar</div>
                <p className="mt-1 text-xs leading-5 text-gray-500">View and create events in your primary calendar.</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${googleConnected ? providerBadge(true, dark) : providerBadge(false, dark)}`}>
              {googleConnected ? "Calendar ready" : "Link Google"}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => void fetchCalendarEvents()}
                disabled={calendarLoading || !googleConnected}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${calendarLoading ? "animate-spin" : ""}`} />
                {calendarLoading ? "Loading..." : "Load events"}
              </button>
              <button
                onClick={() => { setShowCreateEvent((v) => !v); setCreateEventResult(null); }}
                disabled={!googleConnected}
                title="Create a new calendar event"
                aria-label="Create calendar event"
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-green-900/70 text-green-200 hover:bg-green-800 disabled:opacity-50" : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"}`}
              >
                <Plus className="h-3.5 w-3.5" />
                Create event
              </button>
            </div>

            {showCreateEvent && googleConnected && (
              <div className={`space-y-2 rounded-xl border px-3 py-3 ${dark ? "border-gray-700 bg-gray-900/60" : "border-gray-300 bg-white"}`}>
                <div className="text-xs font-semibold">New event</div>
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="Event title"
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={newEventAllDay} onChange={(e) => setNewEventAllDay(e.target.checked)} />
                    All day
                  </label>
                </div>
                <input
                  type={newEventAllDay ? "date" : "datetime-local"}
                  value={newEventStart}
                  onChange={(e) => setNewEventStart(e.target.value)}
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`}
                />
                <input
                  type={newEventAllDay ? "date" : "datetime-local"}
                  value={newEventEnd}
                  onChange={(e) => setNewEventEnd(e.target.value)}
                  placeholder="End (optional)"
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                />
                <input
                  type="text"
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  placeholder="Location (optional)"
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                />
                <textarea
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs resize-none ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
                />
                <button
                  onClick={() => void createCalendarEvent()}
                  disabled={createEventLoading || !newEventStart}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-green-900 text-green-100 hover:bg-green-800 disabled:opacity-50" : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"}`}
                >
                  {createEventLoading ? "Creating..." : "Save to Google Calendar"}
                </button>
                {createEventResult?.ok && (
                  <div className="text-xs text-emerald-400">
                    Event created!{" "}
                    {createEventResult.htmlLink && (
                      <a href={createEventResult.htmlLink} target="_blank" rel="noopener noreferrer" className="underline">Open in Calendar</a>
                    )}
                  </div>
                )}
                {createEventResult?.error && <div className="text-xs text-rose-400">{createEventResult.error}</div>}
              </div>
            )}

            {calendarEvents.length > 0 && (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {calendarEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`rounded-xl border px-3 py-2 ${dark ? "border-gray-800 bg-gray-900/80" : "border-gray-200 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{event.title}</div>
                        <div className="mt-0.5 text-[11px] text-gray-500">{formatCalendarDate(event.start, event.allDay)}</div>
                        {event.location && <div className="mt-0.5 truncate text-[11px] text-gray-400">{event.location}</div>}
                      </div>
                      {event.htmlLink && (
                        <a
                          href={event.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium transition ${dark ? "bg-green-900/60 text-green-200 hover:bg-green-800" : "bg-green-100 text-green-800 hover:bg-green-200"}`}
                        >
                          Open
                        </a>
                      )}
                    </div>
                    {event.description && <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{event.description}</div>}
                  </div>
                ))}
              </div>
            )}

            {calendarEvents.length === 0 && !calendarLoading && !calendarError && googleConnected && (
              <div className="text-xs text-gray-500">No upcoming events loaded yet.</div>
            )}

            {calendarError && <div className="text-xs text-rose-400">{calendarError}</div>}
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