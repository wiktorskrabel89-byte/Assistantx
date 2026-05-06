"use client";

import { ChevronDown, ChevronRight, Plus, Search, Tag, X } from "lucide-react";
import { useState } from "react";
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
  systemPrompt: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onSetChatTags: (chatId: string, tags: string[]) => void;
  onSetSystemPrompt: (text: string) => void;
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
  systemPrompt,
  onClose,
  onSearchChange,
  onCreateChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onSetChatTags,
  onSetSystemPrompt,
}: ConversationsSidebarProps) {
  const [editingTagsChatId, setEditingTagsChatId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);

  const handleAddTag = (chat: ChatThread) => {
    const tag = tagInput.trim();
    if (!tag) return;
    const existing = chat.tags ?? [];
    if (!existing.includes(tag)) {
      onSetChatTags(chat.id, [...existing, tag]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (chat: ChatThread, tag: string) => {
    onSetChatTags(chat.id, (chat.tags ?? []).filter((t) => t !== tag));
  };

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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:from-sky-800 hover:to-cyan-700"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="conversations-sidebar-search"
                name="conversationsSidebarSearch"
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

          {/* System prompt collapsible */}
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={() => setSystemPromptOpen((prev) => !prev)}
              className={`flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-medium transition-colors ${dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}
            >
              {systemPromptOpen
                ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
              System Prompt
              {systemPrompt.trim() ? <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" /> : null}
            </button>
            {systemPromptOpen ? (
              <textarea
                id="system-prompt"
                name="systemPrompt"
                value={systemPrompt}
                onChange={(e) => onSetSystemPrompt(e.target.value)}
                placeholder="Add custom instructions for this workspace…"
                rows={4}
                className={`mt-1 w-full resize-none rounded-xl border px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 ${dark ? "border-slate-700 bg-slate-900 text-slate-200 placeholder-slate-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400"}`}
              />
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
            {chats.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-slate-400">No chats to show.</div>
            ) : (
              <div className="space-y-1">
                {chats.map((chat) => {
                  const latest = chat.messages[chat.messages.length - 1];
                  const isTagging = editingTagsChatId === chat.id;
                  return (
                    <div key={chat.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Select chat: ${chat.title}`}
                        onClick={() => {
                          onSelectChat(chat.id);
                          onClose();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectChat(chat.id);
                            onClose();
                          }
                        }}
                        className={`group w-full rounded-2xl px-3 py-3 text-left transition-colors cursor-pointer ${
                          chat.id === activeChatId
                            ? dark
                              ? "bg-slate-800 text-white"
                              : "bg-sky-50 text-slate-900"
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
                            {(chat.tags ?? []).length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {(chat.tags ?? []).map((tag) => (
                                  <span
                                    key={tag}
                                    onClick={(e) => { e.stopPropagation(); handleRemoveTag(chat, tag); }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); handleRemoveTag(chat, tag); } }}
                                    aria-label={`Remove tag ${tag}`}
                                    className={`inline-flex cursor-pointer items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                      dark ? "bg-sky-900/60 text-sky-300 hover:bg-red-900/50 hover:text-red-300" : "bg-sky-100 text-sky-700 hover:bg-red-100 hover:text-red-600"
                                    }`}
                                  >
                                    #{tag}
                                    <X className="h-2.5 w-2.5" />
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="hidden gap-2 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRenameChat(chat.id);
                              }}
                              className="text-[11px] text-slate-400 hover:text-sky-600"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingTagsChatId(isTagging ? null : chat.id);
                                setTagInput("");
                              }}
                              className="text-[11px] text-slate-400 hover:text-sky-600"
                              title="Add tag"
                            >
                              Tag
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteChat(chat.id);
                              }}
                              className="text-[11px] text-slate-400 hover:text-red-500"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>

                      {isTagging ? (
                        <div
                          className={`mx-1 mb-1 flex gap-1 rounded-xl border px-2 py-1.5 ${dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tag className="mt-1 h-3 w-3 flex-shrink-0 text-slate-400" />
                          <input
                            autoFocus
                            id="tag-input"
                            name="tagInput"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { handleAddTag(chat); }
                              if (e.key === "Escape") { setEditingTagsChatId(null); }
                            }}
                            placeholder="Add tag, Enter to confirm"
                            className={`flex-1 bg-transparent text-xs focus:outline-none ${dark ? "text-slate-200 placeholder-slate-500" : "text-slate-800 placeholder-slate-400"}`}
                          />
                          <button
                            onClick={() => handleAddTag(chat)}
                            className="text-[10px] font-semibold text-sky-600 hover:text-sky-700"
                          >
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
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