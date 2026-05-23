"use client";

import { Calendar, ChevronRight, Clock, Command, MessageSquareText, Search, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "@/app/hooks/useDebounce";
import { cn } from "@/lib/utils";

type HitType = "chat" | "command" | "notification";

type SearchHit = {
  id: string;
  type: HitType;
  title: string;
  preview: string;
  createdAt: string;
  meta?: Record<string, string | number | null | undefined>;
};

const TYPE_ICON: Record<HitType, React.ReactNode> = {
  chat: <MessageSquareText className="h-4 w-4 shrink-0 text-sky-500" />,
  command: <Terminal className="h-4 w-4 shrink-0 text-violet-500" />,
  notification: <Clock className="h-4 w-4 shrink-0 text-amber-500" />,
};

const TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chats" },
  { value: "command", label: "Commands" },
  { value: "notification", label: "Notifications" },
];

function renderPreview(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function HistorySearchPanel({
  open,
  dark,
  onClose,
  onJumpToChat,
}: {
  open: boolean;
  dark: boolean;
  onClose: () => void;
  onJumpToChat?: (workspaceId: string, chatId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 350);
  const hasQuery = Boolean(debouncedQuery.trim());
  const visibleHits = hasQuery ? hits : [];
  const visibleLoading = hasQuery && loading;
  const visibleError = hasQuery ? error : null;
  const visibleUnavailable = hasQuery && unavailable;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  useEffect(() => {
    if (!debouncedQuery.trim()) return;
    let cancelled = false;
    const searchId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ q: debouncedQuery, type: typeFilter });
      fetch(`/api/history/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { hits: SearchHit[]; available: boolean; error?: string }) => {
          if (cancelled) return;
          if (!data.available) {
            setUnavailable(true);
            setHits([]);
            return;
          }
          setHits(data.hits ?? []);
        })
        .catch(() => {
          if (!cancelled) setError("Search failed. Try again.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(searchId);
    };
  }, [debouncedQuery, typeFilter]);

  if (!open) return null;

  const overlayClass = "fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] bg-black/50";
  const panelClass = cn(
    "w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[80vh]",
    dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"
  );
  const inputClass = cn(
    "w-full bg-transparent text-sm outline-none placeholder:text-slate-400",
    dark ? "text-slate-100" : "text-slate-900"
  );
  const filterClass = (active: boolean) => cn(
    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
    active
      ? "bg-sky-500 text-white"
      : dark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  );
  const hitClass = cn(
    "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
    dark ? "hover:bg-slate-800/80" : "hover:bg-slate-50"
  );

  function handleHitClick(hit: SearchHit) {
    if (hit.type === "chat" && onJumpToChat && hit.meta?.workspaceId && hit.meta?.chatId) {
      onJumpToChat(String(hit.meta.workspaceId), String(hit.meta.chatId));
      onClose();
    }
  }

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className={cn("flex items-center gap-3 px-4 py-3 border-b", dark ? "border-slate-800" : "border-slate-200")}>
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats, commands, notifications…"
            className={inputClass}
          />
          {query && (
            <button onClick={() => setQuery("")} className="shrink-0 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className={cn("flex gap-2 px-4 py-2 border-b", dark ? "border-slate-800" : "border-slate-200")}>
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <button key={opt.value} className={filterClass(typeFilter === opt.value)} onClick={() => setTypeFilter(opt.value)}>
              {opt.label}
            </button>
          ))}
          {!visibleUnavailable && !visibleLoading && visibleHits.length > 0 && (
            <span className={cn("ml-auto text-xs self-center", dark ? "text-slate-500" : "text-slate-400")}>
              {visibleHits.length} result{visibleHits.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {visibleUnavailable && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              History search is not available (Supabase not configured).
            </div>
          )}
          {visibleError && (
            <div className="px-4 py-6 text-center text-sm text-red-400">{visibleError}</div>
          )}
          {!visibleUnavailable && !visibleError && visibleLoading && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Searching…</div>
          )}
          {!visibleUnavailable && !visibleError && !visibleLoading && hasQuery && visibleHits.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No results for <strong>&ldquo;{debouncedQuery}&rdquo;</strong>
            </div>
          )}
          {!visibleUnavailable && !visibleError && !hasQuery && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-slate-400">
              <Command className="h-8 w-8 opacity-30" />
              <span>Type to search across chats, commands, and notifications.</span>
            </div>
          )}
          {visibleHits.map((hit, i) => (
            <div
              key={`${hit.id}-${i}`}
              role={hit.type === "chat" && onJumpToChat ? "button" : "listitem"}
              tabIndex={hit.type === "chat" && onJumpToChat ? 0 : undefined}
              className={hitClass}
              onClick={() => handleHitClick(hit)}
              onKeyDown={(e) => e.key === "Enter" && handleHitClick(hit)}
            >
              {TYPE_ICON[hit.type]}
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium leading-snug"
                  dangerouslySetInnerHTML={{ __html: renderPreview(hit.title) }}
                />
                {hit.preview && (
                  <div
                    className={cn("mt-0.5 text-xs leading-relaxed line-clamp-2", dark ? "text-slate-400" : "text-slate-500")}
                    dangerouslySetInnerHTML={{ __html: renderPreview(hit.preview) }}
                  />
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <Calendar className="h-3 w-3" />
                  {hit.createdAt ? new Date(hit.createdAt).toLocaleString() : ""}
                  {hit.meta?.status ? <span className="rounded-full bg-slate-700/50 px-2 py-0.5">{String(hit.meta.status)}</span> : null}
                </div>
              </div>
              {hit.type === "chat" && onJumpToChat ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 self-center" /> : null}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className={cn("px-4 py-2 text-[11px] border-t", dark ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400")}>
          Press <kbd className="rounded border px-1 py-px font-mono text-[10px]">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
