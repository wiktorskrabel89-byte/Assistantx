// Codebase tab: browse a GitHub repo by owner/repo, filter files, and ask AI about them.
"use client";

import { ChevronRight, Database, File, Loader2, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

type GitHubFileSummary = {
  path: string;
  size: number;
  type: "blob" | "tree";
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

type CodebaseTabProps = {
  dark: boolean;
  /** Called to inject a pre-filled message into the chat composer */
  onAskAboutFile?: (prompt: string) => void;
};

function buildTree(files: GitHubFileSummary[]): Record<string, GitHubFileSummary[]> {
  const tree: Record<string, GitHubFileSummary[]> = { "": [] };
  for (const file of files) {
    const parts = file.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(file);
  }
  return tree;
}

function FileTree({
  dir,
  tree,
  depth,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  dark,
  selectedFile,
}: {
  dir: string;
  tree: Record<string, GitHubFileSummary[]>;
  depth: number;
  expandedDirs: Set<string>;
  onToggleDir: (d: string) => void;
  onSelectFile: (path: string) => void;
  dark: boolean;
  selectedFile: string | null;
}) {
  const children = tree[dir] ?? [];
  return (
    <ul className="space-y-px">
      {children.map((file) => {
        const isDir = file.type === "tree";
        const isExpanded = expandedDirs.has(file.path);
        const isSelected = file.path === selectedFile;
        return (
          <li key={file.path} style={{ paddingLeft: depth * 12 }}>
            <button
              type="button"
              onClick={() => isDir ? onToggleDir(file.path) : onSelectFile(file.path)}
              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition-colors ${
                isSelected
                  ? dark ? "bg-sky-900/60 text-sky-200" : "bg-sky-100 text-sky-800"
                  : dark ? "hover:bg-slate-800 text-slate-300" : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {isDir ? (
                <ChevronRight
                  className={`h-3 w-3 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              ) : (
                <File className="h-3 w-3 flex-shrink-0 opacity-50" />
              )}
              <span className="truncate">{file.path.split("/").pop()}</span>
              {!isDir && (
                <span className={`ml-auto flex-shrink-0 text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
                  {file.size > 1024 ? `${Math.round(file.size / 1024)}KB` : `${file.size}B`}
                </span>
              )}
            </button>
            {isDir && isExpanded && tree[file.path] && (
              <FileTree
                dir={file.path}
                tree={tree}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                dark={dark}
                selectedFile={selectedFile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CodebaseTab({ dark, onAskAboutFile }: CodebaseTabProps) {
  const [repoInput, setRepoInput] = useState("");
  const [refInput, setRefInput] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repo, setRepo] = useState<GitHubRepoResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [importingPath, setImportingPath] = useState<string | null>(null);

  async function loadRepo() {
    if (!repoInput.trim()) {
      setError("Enter a GitHub repo like owner/repo.");
      return;
    }
    setLoading(true);
    setError("");
    setRepo(null);
    setSelectedFile(null);
    try {
      const params = new URLSearchParams({ repo: repoInput.trim() });
      if (refInput.trim()) params.set("ref", refInput.trim());
      const res = await fetch(`/api/integrations/github?${params.toString()}`);
      const data = await res.json().catch(() => ({})) as GitHubRepoResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load repo.");
      setRepo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load repo.");
    } finally {
      setLoading(false);
    }
  }

  async function askAboutFile(path: string) {
    if (!repo || !onAskAboutFile) return;
    setImportingPath(path);
    try {
      const res = await fetch("/api/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoInput.trim(), ref: repo.ref, path }),
      });
      const data = await res.json().catch(() => ({})) as { prompt?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch file.");
      onAskAboutFile(data.prompt ?? `Please review the file ${path} from ${repo.repo}.`);
    } catch {
      /* ignore */
    } finally {
      setImportingPath(null);
    }
  }

  const filteredFiles = useMemo(() => {
    if (!repo) return [];
    const q = filter.trim().toLowerCase();
    return q ? repo.files.filter((f) => f.path.toLowerCase().includes(q)) : repo.files;
  }, [repo, filter]);

  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

  function toggleDir(dir: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }

  const bg = dark
    ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]";

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden animate-tab-enter ${bg}`}>
      {/* Header */}
      <div className={`flex flex-shrink-0 items-center gap-3 border-b px-4 py-3 ${dark ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white/80"}`}>
        <Database className={`h-4 w-4 ${dark ? "text-sky-400" : "text-sky-600"}`} />
        <span className={`text-sm font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>Codebase</span>
        {repo && (
          <span className={`ml-auto text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
            {repo.repo} ({repo.files.length} files)
          </span>
        )}
      </div>

      {/* Search bar */}
      <div className={`flex flex-shrink-0 gap-2 border-b px-4 py-3 ${dark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-white/60"}`}>
        <input
          type="text"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void loadRepo()}
          placeholder="owner/repo"
          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors ${dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-sky-600" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-400"}`}
        />
        <input
          type="text"
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void loadRepo()}
          placeholder="branch / tag"
          className={`w-28 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors ${dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-sky-600" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-400"}`}
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

      {error && (
        <div className={`flex-shrink-0 px-4 py-2 text-sm ${dark ? "text-red-400 bg-red-950/30" : "text-red-600 bg-red-50"}`}>
          {error}
        </div>
      )}

      {repo && (
        <>
          {/* File filter */}
          <div className={`flex flex-shrink-0 items-center gap-2 border-b px-4 py-2 ${dark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/50"}`}>
            <Search className="h-3.5 w-3.5 opacity-40" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files…"
              className={`flex-1 bg-transparent text-sm outline-none ${dark ? "text-slate-100 placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"}`}
            />
            {filter && (
              <button type="button" onClick={() => setFilter("")} className="opacity-50 hover:opacity-80">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* File tree + detail panel */}
          <div className="flex min-h-0 flex-1">
            {/* Tree */}
            <div className={`w-72 flex-shrink-0 overflow-y-auto border-r p-2 ${dark ? "border-slate-800" : "border-slate-200"}`}>
              {filteredFiles.length === 0 ? (
                <p className={`px-2 py-3 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>No files match.</p>
              ) : filter ? (
                <ul className="space-y-px">
                  {filteredFiles.slice(0, 100).map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(f.path)}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition-colors ${
                          f.path === selectedFile
                            ? dark ? "bg-sky-900/60 text-sky-200" : "bg-sky-100 text-sky-800"
                            : dark ? "hover:bg-slate-800 text-slate-300" : "hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        <File className="h-3 w-3 flex-shrink-0 opacity-50" />
                        <span className="truncate">{f.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <FileTree
                  dir=""
                  tree={tree}
                  depth={0}
                  expandedDirs={expandedDirs}
                  onToggleDir={toggleDir}
                  onSelectFile={setSelectedFile}
                  dark={dark}
                  selectedFile={selectedFile}
                />
              )}
            </div>

            {/* Detail panel */}
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              {selectedFile ? (
                <div className={`w-full max-w-sm rounded-2xl border p-6 text-center shadow-sm ${dark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white/90"}`}>
                  <File className={`mx-auto h-8 w-8 mb-3 ${dark ? "text-sky-400" : "text-sky-600"}`} />
                  <div className={`font-semibold text-sm mb-1 truncate ${dark ? "text-slate-100" : "text-slate-900"}`}>{selectedFile}</div>
                  <div className={`text-xs mb-4 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    {repo.repo} · {repo.ref}
                  </div>
                  {onAskAboutFile && (
                    <button
                      type="button"
                      onClick={() => void askAboutFile(selectedFile)}
                      disabled={importingPath === selectedFile}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {importingPath === selectedFile
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Sparkles className="h-3.5 w-3.5" />}
                      Ask AI about this file
                    </button>
                  )}
                </div>
              ) : (
                <div className={`text-center text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>
                  Select a file to inspect it.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!repo && !loading && !error && (
        <div className={`flex flex-1 flex-col items-center justify-center gap-3 text-center ${dark ? "text-slate-500" : "text-slate-400"}`}>
          <Database className="h-10 w-10 opacity-30" />
          <p className="text-sm">Enter a GitHub repo to browse its files.</p>
        </div>
      )}
    </section>
  );
}
