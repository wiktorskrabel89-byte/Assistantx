"use client";

import { Search, Plus, X } from "lucide-react";
import { useEffect } from "react";

type SessionItem = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  isActive: boolean;
};

export function ChatSessionsPanel({
  open,
  dark,
  workspaceName,
  searchValue,
  sessions,
  onSearchChange,
  onCreateSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onClose,
}: {
  open: boolean;
  dark: boolean;
  workspaceName: string;
  searchValue: string;
  sessions: SessionItem[];
  onSearchChange: (value: string) => void;
  onCreateSession: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close sessions panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45"
      />
      <aside className={`fixed inset-y-3 right-3 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-[26px] border ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold">Chat sessions</div>
              <div className="mt-1 text-xs text-slate-500">{workspaceName}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCreateSession}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
                title="New chat"
                aria-label="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
                title="Close"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="chat-sessions-search"
                name="chatSessionsSearch"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search chats"
                className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm ${dark ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400"}`}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {sessions.length === 0 ? (
              searchValue ? (
                <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${dark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                  No chats match this search.
                </div>
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${dark ? "bg-slate-800" : "bg-slate-100"}`}>
                    <Plus className={`h-6 w-6 ${dark ? "text-slate-400" : "text-slate-500"}`} />
                  </div>
                  <p className={`text-sm font-medium ${dark ? "text-slate-300" : "text-slate-700"}`}>No chat sessions yet</p>
                  <p className={`mt-1 text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>Create a new chat to start a conversation.</p>
                  <button
                    type="button"
                    onClick={onCreateSession}
                    className="mt-4 flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New chat
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${session.isActive ? (dark ? "border-blue-800 bg-blue-950/30" : "border-blue-200 bg-blue-50") : (dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-50")}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{session.title}</div>
                        <div className="mt-1 text-[11px] text-slate-400">{session.messageCount} messages</div>
                        {session.preview ? <div className="mt-2 truncate text-xs text-slate-500">{session.preview}</div> : null}
                      </div>
                      <div className="flex gap-2 text-[11px] text-slate-400">
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            onRenameSession(session.id);
                          }}
                          className="hover:text-blue-500"
                        >
                          Rename
                        </span>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          className="hover:text-red-500"
                        >
                          Delete
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}