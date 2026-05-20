"use client";

import { CheckSquare, ChevronRight, Database, File, GitBranch, GitPullRequest, Loader2, RefreshCw, Search, Sparkles, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { APP_FORCED_MODEL_ID, APP_FORCED_THINKING_EFFORT } from "@/lib/ai-config";

type GitHubRepoFile = {
  path: string;
  size: number;
  language: string;
};

type GitHubRepoResponse = {
  repo: string;
  ref: string;
  defaultBranch: string;
  description: string | null;
  isPrivate: boolean;
  truncated: boolean;
  files: GitHubRepoFile[];
};

type FileTreeEntry =
  | { path: string; type: "tree"; size: 0 }
  | { path: string; type: "blob"; size: number };

type ImportedFileResponse = {
  name: string;
  mimeType: string;
  base64: string;
  prompt: string;
  sourceLabel: string;
  error?: string;
};

type LoadedFile = {
  path: string;
  sourceLabel: string;
  content: string;
};

type RefactorPlanFile = {
  path: string;
  summary: string;
  content: string;
  diff?: string;
};

type RefactorPlan = {
  summary: string;
  commitMessage: string;
  prTitle?: string;
  prBody?: string;
  baseBranch?: string;
  headBranch?: string;
  files: RefactorPlanFile[];
};

type CodebaseTabProps = {
  dark: boolean;
  onAskAboutFile?: (prompt: string) => void;
  highlightTour?: boolean;
};

function decodeBase64Utf8(base64: string) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildTree(files: GitHubRepoFile[]): Record<string, FileTreeEntry[]> {
  const tree: Record<string, FileTreeEntry[]> = { "": [] };
  const seen = new Set<string>();

  const addEntry = (dir: string, entry: FileTreeEntry) => {
    const key = `${dir}:${entry.type}:${entry.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(entry);
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let currentDir = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      const nextDir = currentDir ? `${currentDir}/${parts[index]}` : parts[index];
      addEntry(currentDir, { path: nextDir, type: "tree", size: 0 });
      if (!tree[nextDir]) tree[nextDir] = [];
      currentDir = nextDir;
    }
    addEntry(currentDir, { path: file.path, type: "blob", size: file.size });
  }

  for (const dir of Object.keys(tree)) {
    tree[dir].sort((left, right) => {
      if (left.type !== right.type) return left.type === "tree" ? -1 : 1;
      return left.path.localeCompare(right.path);
    });
  }

  return tree;
}

function commonDirectoryPrefix(paths: string[]) {
  if (paths.length === 0) return "";
  const splitPaths = paths.map((path) => path.split("/"));
  const prefix: string[] = [];
  const minLength = Math.min(...splitPaths.map((parts) => parts.length));
  for (let index = 0; index < minLength - 1; index += 1) {
    const candidate = splitPaths[0][index];
    if (splitPaths.every((parts) => parts[index] === candidate)) {
      prefix.push(candidate);
    } else {
      break;
    }
  }
  return prefix.join("/");
}

function extractJsonPayload(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The refactor plan was not returned as JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as RefactorPlan;
}

async function streamAssistantResponse(prompt: string) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      mode: "code",
      userPlan: "free",
      history: [],
      modelId: APP_FORCED_MODEL_ID,
      thinkingEffort: APP_FORCED_THINKING_EFFORT,
      allowedModels: [APP_FORCED_MODEL_ID],
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Failed to generate the refactor plan.");
  }
  if (!response.body) {
    throw new Error("Missing streaming body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return full;
      try {
        const chunk = JSON.parse(raw) as { token?: string };
        if (chunk.token) full += chunk.token;
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return full;
}

function FileTree({
  dir,
  tree,
  depth,
  expandedDirs,
  selectedFile,
  selectedFiles,
  dark,
  onToggleDir,
  onSelectFile,
  onToggleFileSelection,
}: {
  dir: string;
  tree: Record<string, FileTreeEntry[]>;
  depth: number;
  expandedDirs: Set<string>;
  selectedFile: string | null;
  selectedFiles: Set<string>;
  dark: boolean;
  onToggleDir: (dir: string) => void;
  onSelectFile: (path: string) => void;
  onToggleFileSelection: (path: string) => void;
}) {
  const children = tree[dir] ?? [];

  return (
    <ul className="space-y-px">
      {children.map((entry) => {
        const isDir = entry.type === "tree";
        const isExpanded = expandedDirs.has(entry.path);
        const isSelected = entry.path === selectedFile;
        const isChecked = selectedFiles.has(entry.path);
        const label = entry.path.split("/").pop() ?? entry.path;

        return (
          <li key={`${entry.type}:${entry.path}`} style={{ paddingLeft: depth * 12 }}>
            <div
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
                isSelected
                  ? dark ? "bg-sky-900/60 text-sky-200" : "bg-sky-100 text-sky-800"
                  : dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {isDir ? (
                <button
                  type="button"
                  onClick={() => onToggleDir(entry.path)}
                  className="flex items-center"
                  aria-label={isExpanded ? "Collapse directory" : "Expand directory"}
                >
                  <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </button>
              ) : (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleFileSelection(entry.path)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  aria-label={`Select ${label}`}
                />
              )}
              {!isDir ? <File className="h-3 w-3 flex-shrink-0 opacity-50" /> : null}
              <button
                type="button"
                onClick={() => isDir ? onToggleDir(entry.path) : onSelectFile(entry.path)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="truncate">{label}</span>
                {!isDir ? (
                  <span className={`ml-auto flex-shrink-0 text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
                    {entry.size > 1024 ? `${Math.round(entry.size / 1024)}KB` : `${entry.size}B`}
                  </span>
                ) : null}
              </button>
            </div>
            {isDir && isExpanded && tree[entry.path] ? (
              <FileTree
                dir={entry.path}
                tree={tree}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                selectedFile={selectedFile}
                selectedFiles={selectedFiles}
                dark={dark}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                onToggleFileSelection={onToggleFileSelection}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CodebaseTab({ dark, onAskAboutFile, highlightTour = false }: CodebaseTabProps) {
  const [repoInput, setRepoInput] = useState("");
  const [refInput, setRefInput] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repo, setRepo] = useState<GitHubRepoResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [refactorTask, setRefactorTask] = useState("Refactor the selected files to improve maintainability and consistency.");
  const [planning, setPlanning] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [prLoading, setPrLoading] = useState(false);
  const [reviewPlan, setReviewPlan] = useState<RefactorPlan | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [commitResult, setCommitResult] = useState<string>("");
  const [prResult, setPrResult] = useState<string>("");

  async function loadRepo() {
    if (!repoInput.trim()) {
      setError("Enter a GitHub repo like owner/repo.");
      return;
    }
    setLoading(true);
    setError("");
    setReviewError("");
    setRepo(null);
    setSelectedFile(null);
    setSelectedFiles(new Set());
    setReviewPlan(null);
    setCommitResult("");
    setPrResult("");

    try {
      const params = new URLSearchParams({ repo: repoInput.trim() });
      if (refInput.trim()) params.set("ref", refInput.trim());
      const res = await fetch(`/api/integrations/github?${params.toString()}`);
      const data = await res.json().catch(() => ({})) as GitHubRepoResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load repo.");
      setRepo(data);
      setExpandedDirs(new Set([""]));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load repo.");
    } finally {
      setLoading(false);
    }
  }

  const filteredFiles = useMemo(() => {
    if (!repo) return [];
    const query = filter.trim().toLowerCase();
    return query
      ? repo.files.filter((file) => file.path.toLowerCase().includes(query))
      : repo.files;
  }, [filter, repo]);

  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

  const selectedPaths = useMemo(() => {
    if (selectedFiles.size > 0) return Array.from(selectedFiles);
    return selectedFile ? [selectedFile] : [];
  }, [selectedFile, selectedFiles]);

  async function fetchSelectedFiles(paths: string[]) {
    const responses = await Promise.all(paths.map(async (path) => {
      const res = await fetch("/api/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoInput.trim(), ref: repo?.ref ?? refInput.trim(), path }),
      });
      const data = await res.json().catch(() => ({})) as ImportedFileResponse;
      if (!res.ok || typeof data.base64 !== "string") {
        throw new Error(data.error ?? `Failed to load ${path}.`);
      }
      return {
        path,
        sourceLabel: data.sourceLabel,
        content: decodeBase64Utf8(data.base64),
      } satisfies LoadedFile;
    }));

    return responses;
  }

  async function analyzeSelectedFiles() {
    if (!onAskAboutFile || selectedPaths.length === 0 || !repo) return;
    setImporting(true);
    setError("");
    try {
      const files = await fetchSelectedFiles(selectedPaths);
      const directoryContext = commonDirectoryPrefix(files.map((file) => file.path));
      const prompt = [
        `Use GPT OSS 120B to analyze files from ${repo.repo} (${repo.ref}).`,
        directoryContext ? `Primary directory context: ${directoryContext}` : "Primary directory context: repository root.",
        "Review relationships across the selected files, identify risks, and recommend the safest next implementation steps.",
        "",
        ...files.map((file) => `### ${file.sourceLabel}\n\`\`\`\n${file.content}\n\`\`\``),
      ].join("\n");
      onAskAboutFile(prompt);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to import the selected files.");
    } finally {
      setImporting(false);
    }
  }

  async function generateRefactorPlan() {
    if (!repo || selectedPaths.length === 0) return;
    setPlanning(true);
    setReviewError("");
    setReviewPlan(null);
    setCommitResult("");
    setPrResult("");

    try {
      const files = await fetchSelectedFiles(selectedPaths);
      const headBranch = `assistantx/refactor-${Date.now()}`;
      const prompt = [
        "You are preparing a GitHub refactor plan for AssistantX.",
        "Return ONLY JSON, optionally wrapped in ```json fences, with this exact shape:",
        '{"summary":"string","commitMessage":"string","prTitle":"string","prBody":"string","baseBranch":"string","headBranch":"string","files":[{"path":"string","summary":"string","content":"string","diff":"string"}]}',
        "Rules:",
        "- Include only files that should change.",
        "- Each files[].path must match one of the provided repository paths exactly.",
        "- files[].content must contain the full final file contents after the refactor.",
        "- files[].diff should be a unified diff preview string.",
        "- Keep JSON valid and escape newlines inside strings.",
        "",
        `Repository: ${repo.repo}`,
        `Base branch: ${repo.ref}`,
        `Suggested head branch: ${headBranch}`,
        `Task: ${refactorTask.trim()}`,
        "",
        ...files.map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``),
      ].join("\n");

      const rawPlan = await streamAssistantResponse(prompt);
      const parsedPlan = extractJsonPayload(rawPlan);
      const allowedPaths = new Set(files.map((file) => file.path));
      const sanitizedFiles = (parsedPlan.files ?? []).filter((file) => allowedPaths.has(file.path) && typeof file.content === "string");
      if (sanitizedFiles.length === 0) {
        throw new Error("The model did not return any valid file updates.");
      }
      setReviewPlan({
        ...parsedPlan,
        baseBranch: parsedPlan.baseBranch || repo.ref,
        headBranch: parsedPlan.headBranch || headBranch,
        files: sanitizedFiles,
      });
    } catch (nextError) {
      setReviewError(nextError instanceof Error ? nextError.message : "Failed to generate the refactor plan.");
    } finally {
      setPlanning(false);
    }
  }

  async function applyPlan() {
    if (!repo || !reviewPlan) return;
    setApplyLoading(true);
    setReviewError("");
    setCommitResult("");
    try {
      const response = await fetch("/api/integrations/github/batch-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repo.repo,
          branch: reviewPlan.headBranch,
          baseBranch: reviewPlan.baseBranch || repo.ref,
          files: reviewPlan.files.map((file) => ({ path: file.path, content: file.content })),
          message: reviewPlan.commitMessage,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; branch?: string; commitUrls?: string[] };
      if (!response.ok) throw new Error(data.error ?? "Failed to apply the plan.");
      setCommitResult(`Committed ${reviewPlan.files.length} file(s) to ${data.branch ?? reviewPlan.headBranch}.`);
    } catch (nextError) {
      setReviewError(nextError instanceof Error ? nextError.message : "Failed to apply the plan.");
    } finally {
      setApplyLoading(false);
    }
  }

  async function createDraftPr() {
    if (!repo || !reviewPlan) return;
    setPrLoading(true);
    setReviewError("");
    setPrResult("");
    try {
      if (!commitResult) {
        await applyPlan();
      }

      const response = await fetch("/api/integrations/github/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repo.repo,
          head: reviewPlan.headBranch,
          base: reviewPlan.baseBranch || repo.ref,
          title: reviewPlan.prTitle?.trim() || `AssistantX: ${reviewPlan.commitMessage}`,
          body: reviewPlan.prBody?.trim() || reviewPlan.summary,
          draft: true,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; prUrl?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to create draft PR.");
      setPrResult(data.prUrl ? `Draft PR created: ${data.prUrl}` : "Draft PR created.");
    } catch (nextError) {
      setReviewError(nextError instanceof Error ? nextError.message : "Failed to create the draft PR.");
    } finally {
      setPrLoading(false);
    }
  }

  function toggleDir(dir: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }

  function toggleFileSelection(path: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const bg = dark
    ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]";

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden animate-tab-enter ${bg} ${highlightTour ? "ring-2 ring-sky-400 ring-inset" : ""}`}>
      <div className={`flex flex-shrink-0 items-center gap-3 border-b px-4 py-3 ${dark ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white/80"}`}>
        <Database className={`h-4 w-4 ${dark ? "text-sky-400" : "text-sky-600"}`} />
        <span className={`text-sm font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>Codebase</span>
        {repo ? (
          <span className={`ml-auto text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
            {repo.repo} ({repo.files.length} files)
          </span>
        ) : null}
      </div>

      <div className={`flex flex-shrink-0 gap-2 border-b px-4 py-3 ${dark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-white/60"}`}>
        <input
          type="text"
          value={repoInput}
          onChange={(event) => setRepoInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void loadRepo()}
          placeholder="owner/repo"
          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors ${dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-sky-600" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-400"}`}
        />
        <input
          type="text"
          value={refInput}
          onChange={(event) => setRefInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void loadRepo()}
          placeholder="branch / tag"
          className={`w-32 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors ${dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-sky-600" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-400"}`}
        />
        <button
          type="button"
          onClick={() => void loadRepo()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Load
        </button>
      </div>

      {error ? (
        <div className={`flex-shrink-0 px-4 py-2 text-sm ${dark ? "bg-red-950/30 text-red-400" : "bg-red-50 text-red-600"}`}>
          {error}
        </div>
      ) : null}

      {repo ? (
        <>
          <div className={`flex min-h-0 flex-1 ${dark ? "text-slate-100" : "text-slate-900"}`}>
            <div className={`flex w-80 flex-shrink-0 flex-col border-r ${dark ? "border-slate-800" : "border-slate-200"}`}>
              <div className={`flex items-center gap-2 border-b px-4 py-2 ${dark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/50"}`}>
                <Search className="h-3.5 w-3.5 opacity-40" />
                <input
                  type="text"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter files…"
                  className={`flex-1 bg-transparent text-sm outline-none ${dark ? "text-slate-100 placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"}`}
                />
                {filter ? (
                  <button type="button" onClick={() => setFilter("")} className="opacity-50 hover:opacity-80">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {filteredFiles.length === 0 ? (
                  <p className={`px-2 py-3 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>No files match.</p>
                ) : filter ? (
                  <ul className="space-y-px">
                    {filteredFiles.slice(0, 150).map((file) => {
                      const checked = selectedFiles.has(file.path);
                      const selected = file.path === selectedFile;
                      return (
                        <li key={file.path}>
                          <div className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${selected ? (dark ? "bg-sky-900/60 text-sky-200" : "bg-sky-100 text-sky-800") : (dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100")}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFileSelection(file.path)}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            <button type="button" onClick={() => setSelectedFile(file.path)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                              <File className="h-3 w-3 flex-shrink-0 opacity-50" />
                              <span className="truncate">{file.path}</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <FileTree
                    dir=""
                    tree={tree}
                    depth={0}
                    expandedDirs={expandedDirs}
                    selectedFile={selectedFile}
                    selectedFiles={selectedFiles}
                    dark={dark}
                    onToggleDir={toggleDir}
                    onSelectFile={setSelectedFile}
                    onToggleFileSelection={toggleFileSelection}
                  />
                )}
              </div>

              {selectedPaths.length > 0 ? (
                <div className={`border-t p-3 ${dark ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white/80"}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-600">
                    <CheckSquare className="h-3.5 w-3.5" />
                    {selectedPaths.length} file{selectedPaths.length === 1 ? "" : "s"} selected
                  </div>
                  <textarea
                    value={refactorTask}
                    onChange={(event) => setRefactorTask(event.target.value)}
                    rows={4}
                    className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
                    placeholder="Describe the refactor or repository-wide change."
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void analyzeSelectedFiles()}
                      disabled={importing || !onAskAboutFile}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Analyze {selectedPaths.length} file{selectedPaths.length === 1 ? "" : "s"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void generateRefactorPlan()}
                      disabled={planning}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${dark ? "bg-violet-900 text-violet-100 hover:bg-violet-800" : "bg-violet-600 text-white hover:bg-violet-700"} disabled:opacity-50`}
                    >
                      {planning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      Refactor {selectedPaths.length} file{selectedPaths.length === 1 ? "" : "s"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {reviewError ? (
                <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${dark ? "border-red-900 bg-red-950/30 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {reviewError}
                </div>
              ) : null}

              {reviewPlan ? (
                <div className={`rounded-2xl border p-5 shadow-sm ${dark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white/90"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-sky-600">Dry-run plan</div>
                      <h2 className="mt-1 text-lg font-semibold">{reviewPlan.summary}</h2>
                      <p className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>
                        Branch: <span className="font-medium">{reviewPlan.headBranch}</span> from <span className="font-medium">{reviewPlan.baseBranch || repo.ref}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void applyPlan()}
                        disabled={applyLoading}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {applyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                        Approve & Commit
                      </button>
                      <button
                        type="button"
                        onClick={() => void createDraftPr()}
                        disabled={prLoading}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        {prLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                        Create Draft PR
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-dashed border-slate-300/70 px-3 py-2 text-sm">
                    <div className="font-medium">Commit message</div>
                    <div className={`mt-1 ${dark ? "text-slate-300" : "text-slate-700"}`}>{reviewPlan.commitMessage}</div>
                  </div>

                  {commitResult ? (
                    <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${dark ? "bg-emerald-950/40 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>
                      {commitResult}
                    </div>
                  ) : null}
                  {prResult ? (
                    <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${dark ? "bg-sky-950/40 text-sky-200" : "bg-sky-50 text-sky-700"}`}>
                      {prResult}
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-4">
                    {reviewPlan.files.map((file) => (
                      <div key={file.path} className={`rounded-2xl border p-4 ${dark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50/80"}`}>
                        <div className="text-sm font-semibold">{file.path}</div>
                        <p className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>{file.summary}</p>
                        {file.diff ? (
                          <pre className={`mt-3 overflow-x-auto rounded-xl p-3 text-xs ${dark ? "bg-slate-950 text-slate-200" : "bg-white text-slate-800"}`}>
                            {file.diff}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedFile ? (
                <div className={`rounded-2xl border p-6 text-center shadow-sm ${dark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white/90"}`}>
                  <File className={`mx-auto mb-3 h-8 w-8 ${dark ? "text-sky-400" : "text-sky-600"}`} />
                  <div className={`truncate text-sm font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>{selectedFile}</div>
                  <div className={`mt-1 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    {repo.repo} · {repo.ref}
                  </div>
                  <p className={`mt-4 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>
                    Select multiple files on the left to analyze them together or generate a dry-run refactor plan.
                  </p>
                </div>
              ) : (
                <div className={`flex h-full items-center justify-center text-center text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>
                  Select one or more files to start a repository-wide coding workflow.
                </div>
              )}
            </div>
          </div>
        </>
      ) : !loading ? (
        <div className={`flex flex-1 flex-col items-center justify-center gap-3 text-center ${dark ? "text-slate-500" : "text-slate-400"}`}>
          <Database className="h-10 w-10 opacity-30" />
          <p className="text-sm">Enter a GitHub repo to browse its files.</p>
        </div>
      ) : null}
    </section>
  );
}
