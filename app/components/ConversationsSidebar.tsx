"use client";

import { ChevronDown, ChevronRight, MessageSquareText, Plus, Search, Tag, X } from "lucide-react";
import { useState } from "react";
import { stripMarkdown } from "../lib/chat-state";
import type { ChatThread } from "../lib/chat-types";

type ConversationsSidebarProps = {
  open: boolean;
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

      <aside className={`fixed inset-y-3 left-3 z-40 w-[min(16rem,calc(100vw-1.5rem))] min-h-0 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar transition-transform duration-200 xl:static xl:w-[250px] xl:translate-x-0 ${open ? "translate-x-0" : "-translate-x-[115%] xl:translate-x-0"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-sidebar-border px-3 py-3">
            <button
              onClick={() => {
                onCreateChat();
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="conversations-sidebar-search"
                name="conversationsSidebarSearch"
                value={chatSearch}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search chats or tags..."
                className="w-full rounded-lg border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {workspaceName}
          </div>

          {/* System prompt collapsible */}
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={() => setSystemPromptOpen((prev) => !prev)}
              className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {systemPromptOpen
                ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
              System Prompt
              {systemPrompt.trim() ? <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/40" /> : null}
            </button>
            {systemPromptOpen ? (
              <textarea
                id="system-prompt"
                name="systemPrompt"
                value={systemPrompt}
                onChange={(e) => onSetSystemPrompt(e.target.value)}
                placeholder="Add custom instructions for this workspace…"
                rows={4}
                className="mt-1 w-full resize-none rounded-lg border border-border bg-background/50 px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
            {chats.length === 0 ? (
              <div className="flex flex-col items-center px-3 py-8 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <MessageSquareText className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground/70">No chats yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Start a new conversation to get going.</p>
                <button
                  type="button"
                  onClick={() => { onCreateChat(); onClose(); }}
                  className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </button>
              </div>
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
                        className={`group w-full rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer ${
                          chat.id === activeChatId
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
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
                                    className="inline-flex cursor-pointer items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
                              className="text-[11px] text-muted-foreground hover:text-foreground"
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
                              className="text-[11px] text-muted-foreground hover:text-foreground"
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
                              className="text-[11px] text-muted-foreground hover:text-destructive"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>

                      {isTagging ? (
                        <div
                          className="mx-1 mb-1 flex gap-1 rounded-lg border border-border bg-background px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tag className="mt-1 h-3 w-3 flex-shrink-0 text-muted-foreground" />
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
                            className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground"
                          />
                          <button
                            onClick={() => handleAddTag(chat)}
                            className="text-[10px] font-semibold text-foreground/70 hover:text-foreground"
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