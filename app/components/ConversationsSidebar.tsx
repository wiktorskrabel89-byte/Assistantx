"use client";

import { Plus, Search } from "lucide-react";
import { stripMarkdown } from "../lib/chat-state";
import type { ChatThread } from "../lib/chat-types";

type ConversationsSidebarProps = {
  open: boolean;
  dark: boolean;
  cardBg: string;
  inputBg: string;
  workspaceName: string;
  chatSearch: string;
  chats: ChatThread[];
  activeChatId: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
};

export function ConversationsSidebar({
  open,
  dark,
  cardBg,
  inputBg,
  workspaceName,
  chatSearch,
  chats,
  activeChatId,
  onClose,
  onSearchChange,
  onCreateChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
}: ConversationsSidebarProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity xl:hidden ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside className={`fixed inset-y-3 left-3 z-40 w-[min(16rem,calc(100vw-1.5rem))] min-h-0 overflow-hidden rounded-[26px] border transition-transform duration-200 xl:static xl:w-[250px] xl:translate-x-0 ${cardBg} ${open ? "translate-x-0" : "-translate-x-[115%] xl:translate-x-0"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
            <button
              onClick={() => {
                onCreateChat();
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={chatSearch}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search chats or tags..."
                className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm ${inputBg}`}
              />
            </div>
          </div>

          <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {workspaceName}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
            {chats.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-slate-400">No chats to show.</div>
            ) : (
              <div className="space-y-1">
                {chats.map((chat) => {
                  const latest = chat.messages[chat.messages.length - 1];
                  return (
                    <button
                      key={chat.id}
                      onClick={() => {
                        onSelectChat(chat.id);
                        onClose();
                      }}
                      className={`group w-full rounded-2xl px-3 py-3 text-left transition-colors ${
                        chat.id === activeChatId
                          ? dark
                            ? "bg-slate-800 text-white"
                            : "bg-blue-50 text-slate-900"
                          : dark
                            ? "text-slate-300 hover:bg-slate-800/80"
                            : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{chat.title}</div>
                          <div className="mt-1 text-xs text-slate-400">{chat.messages.length} messages</div>
                          {latest?.user ? <div className="mt-2 truncate text-xs text-slate-400">{stripMarkdown(latest.user)}</div> : null}
                        </div>
                        <div className="hidden gap-2 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
                          <span
                            onClick={(event) => {
                              event.stopPropagation();
                              onRenameChat(chat.id);
                            }}
                            className="text-[11px] text-slate-400 hover:text-blue-500"
                          >
                            Rename
                          </span>
                          <span
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteChat(chat.id);
                            }}
                            className="text-[11px] text-slate-400 hover:text-red-500"
                          >
                            Delete
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}