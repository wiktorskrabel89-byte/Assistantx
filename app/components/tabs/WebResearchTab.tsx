"use client";

import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type SearchHistoryItem = {
  id: string;
  query: string;
  provider: string;
  result_count: number;
  created_at: string;
  expires_at: string;
};

type SearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

type SearchPayload = {
  answer: string;
  results: SearchResult[];
  cached: boolean;
  expiresAt?: string;
  error?: string;
};

export function WebResearchTab({ dark }: { dark: boolean }) {
  const [query, setQuery] = useState("latest AI coding agent trends");
  const [forceFresh, setForceFresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchPayload | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  const shell = dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const muted = dark ? "text-slate-400" : "text-slate-600";
  const card = dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50";

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/web-search");
    if (!response.ok) return;
    const payload = await response.json() as { searches?: SearchHistoryItem[] };
    setHistory(Array.isArray(payload.searches) ? payload.searches : []);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  const runSearch = useCallback(async (nextQuery?: string) => {
    const searchQuery = (nextQuery ?? query).trim();
    if (!searchQuery) return;
    setLoading(true);
    try {
      const response = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, forceFresh }),
      });
      const payload = await response.json().catch(() => ({ error: "Server error — no response body." })) as SearchPayload;
      if (!response.ok) {
        setResult({ ...payload, answer: "", results: [], cached: false });
      } else {
        setResult(payload);
      }
      await loadHistory();
    } finally {
      setLoading(false);
    }
  }, [forceFresh, loadHistory, query]);

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border ${shell}`}>
      <div className={`border-b px-5 py-4 ${dark ? "border-slate-800" : "border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-cyan-500" />
          <h2 className="text-lg font-semibold">Web Research</h2>
        </div>
        <p className={`mt-1 text-sm ${muted}`}>
          Tavily-powered live web RAG with caching so current research does not re-run unnecessarily.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div className={`rounded-2xl border p-4 ${card}`}>
            <label className="block text-sm font-medium">Research query</label>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={4}
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
              placeholder="What should the assistant research?"
            />
            <label className={`mt-3 flex items-center gap-2 text-xs ${muted}`}>
              <input type="checkbox" checked={forceFresh} onChange={(event) => setForceFresh(event.target.checked)} />
              Ignore cached result and fetch fresh sources
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={loading}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loading ? "Searching..." : "Run live search"}
              </button>
              <button
                type="button"
                onClick={() => void loadHistory()}
                className={`rounded-xl border px-4 py-2 text-sm ${dark ? "border-slate-700" : "border-slate-300"}`}
              >
                Refresh history
              </button>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${card}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Search summary</h3>
              {result ? (
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${result.cached ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
                  {result.cached ? "Cache hit" : "Fresh Tavily search"}
                </span>
              ) : null}
            </div>
            {result?.error ? <p className="mt-3 text-sm text-rose-500">{result.error}</p> : null}
            {result?.answer ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{result.answer}</p> : <p className={`mt-3 text-sm ${muted}`}>Run a query to collect fresh web context.</p>}
          </div>

          {result?.results?.length ? (
            <div className="space-y-3">
              {result.results.map((item) => (
                <article key={item.url} className={`rounded-2xl border p-4 ${card}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-500">
                        Open source <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {typeof item.score === "number" ? <span className={`text-xs ${muted}`}>{Math.round(item.score * 100)}%</span> : null}
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${muted}`}>{item.content}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <aside className={`min-h-0 overflow-y-auto rounded-2xl border p-4 ${card}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Recent searches</h3>
            <button type="button" onClick={() => void loadHistory()} className={`rounded-lg border p-2 ${dark ? "border-slate-700" : "border-slate-300"}`}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {history.length === 0 ? <p className={`text-sm ${muted}`}>No cached searches yet.</p> : null}
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setQuery(item.query);
                  void runSearch(item.query);
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${dark ? "border-slate-800 hover:bg-slate-900" : "border-slate-200 hover:bg-white"}`}
              >
                <div className="text-sm font-medium">{item.query}</div>
                <div className={`mt-1 text-xs ${muted}`}>
                  {item.provider} • {item.result_count} results
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
