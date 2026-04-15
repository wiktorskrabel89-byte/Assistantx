"use client";

import { CalendarDays, ClipboardCheck, Code2, ImageIcon, Mail, type LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AIMessage } from "./components/AIMessage";
import { AIToolsPanel } from "./components/AIToolsPanel";
import { AppNavigationColumn, type AppNavigationTab } from "./components/AppNavigationColumn";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { ChatSessionsPanel } from "./components/ChatSessionsPanel";
import { CodeHistoryPanel } from "./components/CodeHistoryPanel";
import { ConversationToolbar } from "./components/ConversationToolbar";
import { ConversationsSidebar } from "./components/ConversationsSidebar";
import { CustomAgentManager } from "./components/CustomAgentManager";
import { GitHubPanel } from "./components/GitHubPanel";
import { GoogleIntegrationBanner } from "./components/GoogleIntegrationBanner";
import { PromptManager } from "./components/PromptManager";
import { PullToRefresh } from "./components/PullToRefresh";
import { ShareConversationDialog } from "./components/ShareConversationDialog";
import { ThinkingIndicator } from "./components/ThinkingIndicator";
import { useChatTransport } from "./hooks/useChatTransport";
import { useWorkspaceQueries } from "./hooks/useWorkspaceQueries";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import {
  buildChatSessionItems,
  BUILT_IN_AGENTS,
  fromBase64,
  MODE_PANEL_OPTIONS,
  QUICK_CHIPS,
  stripMarkdown,
  TEXT_LANGUAGE_OPTIONS,
  toBase64,
} from "./lib/chat-state";
import type {
  ChatEntry,
  MessageFeedback,
  Mode,
  ResponseAction,
  SharePayload,
  StyleMode,
} from "./lib/chat-types";

type ChatListProps = {
  chat: ChatEntry[];
  loading: boolean;
  dark: boolean;
  cardBg: string;
  codeBg: string;
  copied: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  openReasoning: Set<string>;
  onCopyText: (text: string, id: string) => void;
  onToggleReasoning: (id: string) => void;
  onEditUser: (text: string) => void;
  editingMessageId: string | null;
  editedMessageContent: string;
  onStartEditingMessage: (messageId: string, text: string) => void;
  onEditedMessageChange: (value: string) => void;
  onCancelEditingMessage: () => void;
  onSaveEditedMessage: () => void;
  onResponseAction: (action: ResponseAction, text: string) => void;
  onCreateFollowUp: (prompt: string) => void;
  onSetFeedback: (messageId: string, value: MessageFeedback | null) => void;
  onQuickStart: (text: string, mode?: Mode) => void;
  assistantName: string;
  assistantDescription: string;
  assistantIcon: LucideIcon;
};

const ChatList = memo(function ChatList({
  chat,
  loading,
  dark,
  cardBg,
  codeBg,
  copied,
  scrollRef,
  chatEndRef,
  openReasoning,
  onCopyText,
  onToggleReasoning,
  onEditUser,
  editingMessageId,
  editedMessageContent,
  onStartEditingMessage,
  onEditedMessageChange,
  onCancelEditingMessage,
  onSaveEditedMessage,
  onResponseAction,
  onCreateFollowUp,
  onSetFeedback,
  onQuickStart,
  assistantName,
  assistantDescription,
  assistantIcon: AssistantIcon,
}: ChatListProps) {
  const quickStarters: Array<{ label: string; hint: string; prompt: string; mode?: Mode; icon: LucideIcon }> = [
    { label: "Generuj Kod", hint: "Kompletne rozwiazania", prompt: "Napisz mi kompletny przyklad kodu dla: ", mode: "code", icon: Code2 },
    { label: "Zadanie", hint: "Daj AI zadanie", prompt: "Pomoz mi z zadaniem kodowania: ", mode: "chat", icon: ClipboardCheck },
    { label: "Kalendarz", hint: "AI tworzy wydarzenia", prompt: "Stworz wydarzenie w kalendarzu dla: ", mode: "chat", icon: CalendarDays },
    { label: "Email", hint: "AI pisze maile", prompt: "Napisz profesjonalnego maila dotyczacego: ", mode: "chat", icon: Mail },
    { label: "Generuj Obraz", hint: "AI tworzy obrazy", prompt: "Wygeneruj obraz przedstawiajacy: ", mode: "image", icon: ImageIcon },
  ];

  return (
    <div ref={scrollRef} className="mx-auto flex-1 w-full max-w-4xl overflow-y-auto space-y-4 pr-1">
      {chat.length === 0 ? (
        <div className="mt-8 text-center sm:mt-12">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 shadow-lg shadow-blue-500/20">
            <AssistantIcon className="h-6 w-6 text-white" />
          </div>
          <h2 className={`mt-5 text-[2rem] font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Jak moge Ci pomoc?</h2>
          <p className={`mx-auto mt-2 max-w-2xl text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>
            {assistantName === "Code Assistant"
              ? "Expert in AutoHotkey, Python, JavaScript, and all programming languages. Provides complete code solutions with best practices."
              : assistantDescription}
          </p>
          <div className="mx-auto mt-6 grid max-w-[38rem] grid-cols-1 gap-3 sm:grid-cols-2">
            {quickStarters.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.label}
                  onClick={() => onQuickStart(card.prompt, card.mode)}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    dark
                      ? "border-slate-800 bg-slate-900/80 hover:border-blue-800 hover:bg-slate-900"
                      : "border-slate-200 bg-white shadow-sm hover:border-blue-300 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? "bg-slate-800 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{card.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{card.hint}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {chat.map((entry, index) => (
        <div key={entry.id} className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[82%]">
              {entry.filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.filePreview} alt="file" className="mb-1 ml-auto block h-24 rounded-xl" />
              ) : null}
              {entry.fileName && !entry.filePreview ? (
                <div className={`mb-1 ml-auto inline-flex rounded-full border px-2 py-1 text-xs ${dark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>
                  {entry.fileName}
                </div>
              ) : null}
              {editingMessageId === entry.id ? (
                <div className="rounded-2xl rounded-tr-sm bg-blue-600/10 p-3">
                  <textarea
                    value={editedMessageContent}
                    onChange={(event) => onEditedMessageChange(event.target.value)}
                    rows={4}
                    className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={onCancelEditingMessage} className={`rounded-lg border px-3 py-1.5 text-xs ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}>
                      Cancel
                    </button>
                    <button onClick={onSaveEditedMessage} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-sm text-white">
                    {entry.user}
                  </div>
                  <div className="mt-1 flex justify-end gap-3">
                    <button onClick={() => onEditUser(entry.user)} className={`text-xs ${dark ? "text-blue-300" : "text-blue-600"}`}>
                      Edit and resend
                    </button>
                    <button onClick={() => onStartEditingMessage(entry.id, entry.user)} className={`text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>
                      Edit inline
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <AIMessage
            entry={entry}
            dark={dark}
            cardBg={cardBg}
            codeBg={codeBg}
            copied={copied}
            isStreaming={loading && index === chat.length - 1}
            reasoningOpen={openReasoning.has(entry.id)}
            feedback={entry.feedback}
            onCopyText={onCopyText}
            onToggleReasoning={onToggleReasoning}
            onResponseAction={onResponseAction}
            onCreateFollowUp={onCreateFollowUp}
            onFeedbackChange={(value) => onSetFeedback(entry.id, value)}
          />
        </div>
      ))}

      <div ref={chatEndRef} />
    </div>
  );
});

export default function Home() {
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("chat");
  const [message, setMessage] = useState("");
  const [composerPreview, setComposerPreview] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [codeHistoryOpen, setCodeHistoryOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [customAgentManagerOpen, setCustomAgentManagerOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedMessageContent, setEditedMessageContent] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importedShareRef = useRef(false);

  const {
    state,
    setState,
    stateRef,
    loaded,
    activeWorkspace,
    activeChat,
    artifacts,
    mode,
    chatSearch,
    setChatSearch,
    updateWorkspace,
    updateChat,
    updateLastMessage,
    setActiveChatId,
    setWorkspaceMode,
    createChatAction,
    renameChat,
    deleteChat,
    clearActiveChat,
    createPromptTemplate,
    updatePromptTemplate,
    deletePromptTemplate,
    createCustomAgent,
    updateCustomAgent,
    deleteCustomAgent,
    selectActiveAgent,
    importSharedChat,
    assistantName,
    assistantDescription,
    activeAgentId,
    assistantIcon,
  } = useWorkspaceState();
  const {
    authReady,
    authProvider,
    linkedProviders,
    oauthLoading,
    cloudBootstrapped,
    signInWithProvider,
  } = useWorkspaceSync({ loaded, state, setState, stateRef });
  const {
    loading,
    stopRequested,
    queuedMessages,
    queueComposerMessage,
    removeQueuedMessage,
    stopCurrentGeneration,
  } = useChatTransport({
    activeWorkspaceId: activeWorkspace.id,
    activeChatId: activeChat.id,
    message,
    mode,
    file,
    setMessage,
    setFile,
    setFilePreview,
    setComposerPreview,
    inputRef,
    stateRef,
    updateChat,
    updateLastMessage,
  });
  const currentConversationId = activeChat.id;
  const isChatTab = activeAppTab === "chat";
  const workspaceQueries = useWorkspaceQueries({
    activeWorkspace,
    activeChat,
    updateWorkspace,
    updateChat,
    createCustomAgent,
    updateCustomAgent,
  });
  const selectedAgent = activeAgentId;
  const userPreferences = workspaceQueries.userPreferencesQuery.data ?? activeWorkspace.settings;
  const selectedLanguage = userPreferences.languageLock;
  const conversations = workspaceQueries.conversationsQuery.data ?? activeWorkspace.chats;
  const customAgents = workspaceQueries.customAgentsQuery.data ?? activeWorkspace.settings.customAgents;
  const feedbacks = useMemo(
    () => workspaceQueries.feedbacksQuery.data ?? [],
    [workspaceQueries.feedbacksQuery.data]
  );
  const interactionPatterns = useMemo(
    () => workspaceQueries.patternsQuery.data ?? [],
    [workspaceQueries.patternsQuery.data]
  );
  const conversationKnowledge = workspaceQueries.conversationKnowledgeQuery.data;
  const filteredConversations = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((chat) => {
      const latest = chat.messages[chat.messages.length - 1];
      const haystack = `${chat.title} ${latest?.user ?? ""} ${latest?.ai ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [chatSearch, conversations]);
  const sessionItems = useMemo(
    () => buildChatSessionItems(filteredConversations, currentConversationId),
    [currentConversationId, filteredConversations]
  );

  const bg = state.dark ? "bg-slate-950 text-slate-100" : "bg-gradient-to-br from-blue-50 via-white to-purple-50 text-slate-900";
  const cardBg = state.dark ? "bg-slate-900 border-slate-800" : "bg-white/95 border-slate-200 shadow-sm shadow-slate-200/70";
  const inputBg = state.dark ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const codeBg = state.dark ? "bg-slate-950" : "bg-slate-100";
  const googleLinked = linkedProviders.includes("google") || authProvider === "google";
  const latestEntry = activeChat.messages[activeChat.messages.length - 1];

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        setSidebarOpen(false);
      }
    };

    handleChange(mediaQuery);
    const listener = (event: MediaQueryListEvent) => handleChange(event);
    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat.messages]);

  useEffect(() => {
    return () => {
      if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  useEffect(() => {
    if (!loaded || !cloudBootstrapped || importedShareRef.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const share = url.searchParams.get("share");
    if (!share) return;

    try {
      const payload = JSON.parse(fromBase64(share)) as SharePayload;
      importSharedChat(payload);
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url.pathname);
    } catch {
      // Ignore malformed shared payloads.
    }

    importedShareRef.current = true;
  }, [cloudBootstrapped, importSharedChat, loaded]);

  const setComposerText = useCallback((text: string) => {
    setMessage(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSelectAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTab(tab);
    setSidebarOpen(false);
    setSessionsOpen(false);
    setCodeHistoryOpen(false);
    setAiToolsOpen(false);
    setAppsOpen(false);
    setPromptManagerOpen(false);
    setCustomAgentManagerOpen(false);
    setShareDialogOpen(false);
  }, []);

  const copyCode = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }, []);

  const setMessageFeedback = useCallback((messageId: string, feedback: MessageFeedback | null) => {
    workspaceQueries.updateConversationMutation.mutate({
      chatId: currentConversationId,
      patch: {
        messages: activeChat.messages.map((entry) => (
          entry.id === messageId ? { ...entry, feedback: feedback ?? undefined } : entry
        )),
      },
    });
  }, [activeChat.messages, currentConversationId, workspaceQueries.updateConversationMutation]);

  const toggleReasoning = useCallback((id: string) => {
    setOpenReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyResponseAction = useCallback((action: ResponseAction, text: string) => {
    const clean = stripMarkdown(text).slice(0, 4000);
    const prompts: Record<ResponseAction, string> = {
      summarize: "Summarize this response into 5 clear bullet points:\n\n",
      checklist: "Turn this response into an actionable checklist:\n\n",
      translate: "Translate this response into another language while preserving its meaning:\n\n",
      commit: "Turn this into a clear git commit message:\n\n",
    };
    setWorkspaceMode("chat");
    setComposerText(prompts[action] + clean);
  }, [setComposerText, setWorkspaceMode]);

  const editUserMessage = useCallback((text: string) => {
    setComposerText(text);
  }, [setComposerText]);

  const startEditingMessage = useCallback((messageId: string, text: string) => {
    setEditingMessageId(messageId);
    setEditedMessageContent(text);
  }, []);

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditedMessageContent("");
  }, []);

  const saveEditedMessage = useCallback(() => {
    if (!editingMessageId || !editedMessageContent.trim()) return;

    workspaceQueries.updateConversationMutation.mutate({
      chatId: currentConversationId,
      patch: {
        messages: activeChat.messages.map((entry) => (
          entry.id === editingMessageId ? { ...entry, user: editedMessageContent.trim() } : entry
        )),
      },
    });

    setEditingMessageId(null);
    setEditedMessageContent("");
  }, [activeChat.messages, currentConversationId, editedMessageContent, editingMessageId, workspaceQueries.updateConversationMutation]);

  const createFollowUp = useCallback((prompt: string) => {
    setWorkspaceMode("code");
    setComposerText(prompt);
  }, [setComposerText, setWorkspaceMode]);

  const handleFile = useCallback((nextFile: File) => {
    if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
    setFile(nextFile);
    if (nextFile.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(nextFile));
    } else {
      setFilePreview(null);
    }
    setWorkspaceMode("upload");
    setSidebarOpen(false);
  }, [filePreview, setWorkspaceMode]);

  const handleImportedFile = useCallback((nextFile: File, prompt: string) => {
    handleFile(nextFile);
    if (prompt) {
      setComposerText(prompt);
    }
    setAppsOpen(false);
  }, [handleFile, setComposerText]);

  const closePanels = useCallback(() => {
    setSessionsOpen(false);
    setCodeHistoryOpen(false);
    setAiToolsOpen(false);
    setAppsOpen(false);
  }, []);

  const togglePanel = useCallback((panel: "sessions" | "history" | "tools" | "apps") => {
    setSessionsOpen((current) => panel === "sessions" ? !current : false);
    setCodeHistoryOpen((current) => panel === "history" ? !current : false);
    setAiToolsOpen((current) => panel === "tools" ? !current : false);
    setAppsOpen((current) => panel === "apps" ? !current : false);
  }, []);

  const refreshConversation = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  const applyPromptTemplate = useCallback((templateId: string) => {
    const template = activeWorkspace.settings.promptTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setWorkspaceMode(template.mode);
    setComposerText(template.text);
    setPromptManagerOpen(false);
  }, [activeWorkspace.settings.promptTemplates, setComposerText, setWorkspaceMode]);

  const exportMarkdown = useCallback(() => {
    const markdown = [`# ${activeChat.title}`];
    for (const entry of activeChat.messages) {
      markdown.push(`\n## You\n${entry.user}`);
      if (entry.reasoning) markdown.push(`\n### Reasoning\n${entry.reasoning}`);
      markdown.push(`\n## AI\n${entry.ai}`);
      if (entry.routeReason) markdown.push(`\nRoute: ${entry.routeReason}`);
      if (entry.imageUrl) markdown.push(`\n![Generated image](${entry.imageUrl})`);
    }
    const blob = new Blob([markdown.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeChat.title || "chat"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeChat]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(activeChat, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeChat.title || "chat"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeChat]);

  const createVsCodeBundle = useCallback(() => {
    const sections = [
      `# VS Code handoff: ${activeChat.title}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Workspace",
      `- Workspace: ${activeWorkspace.name}`,
      `- Chat: ${activeChat.title}`,
      `- Conversation id: ${currentConversationId}`,
      `- Selected agent: ${selectedAgent}`,
      "- Routing: Automatic model routing",
      `- Style: ${userPreferences.styleMode}`,
      `- Language lock: ${selectedLanguage}`,
    ];

    if (userPreferences.memoryNotes.trim()) {
      sections.push("", "## Pinned memory", userPreferences.memoryNotes.trim());
    }

    if (interactionPatterns.length > 0) {
      sections.push("", "## Interaction patterns");
      for (const pattern of interactionPatterns) {
        sections.push(`- ${pattern.label}: ${pattern.count}`);
      }
    }

    if (feedbacks.length > 0) {
      sections.push("", "## Feedback", `- Rated assistant replies: ${feedbacks.length}`);
    }

    if (conversationKnowledge) {
      sections.push("", "## Conversation knowledge");
      sections.push(`- Artifact count: ${conversationKnowledge.artifactCount}`);
      sections.push(`- Files mentioned: ${conversationKnowledge.fileMentions.join(", ") || "none"}`);
      sections.push(`- Topics: ${conversationKnowledge.topTopics.join(", ") || "none"}`);
      sections.push(`- Artifact languages: ${conversationKnowledge.artifactLanguages.join(", ") || "none"}`);
      if (conversationKnowledge.summary) {
        sections.push(`- Summary: ${conversationKnowledge.summary}`);
      }
    }

    sections.push("", "## Conversation");
    for (const entry of activeChat.messages) {
      sections.push("", "### User", entry.user || "");
      if (entry.reasoning) sections.push("", "#### Reasoning", entry.reasoning);
      sections.push("", `### Assistant${entry.model ? ` (${entry.model})` : ""}`, entry.ai || "");
      if (entry.routeReason) sections.push("", `Route: ${entry.routeReason}`);
      if (entry.imageUrl) sections.push("", `Image: ${entry.imageUrl}`);
    }

    if (artifacts.length > 0) {
      sections.push("", "## Artifacts");
      for (const artifact of artifacts) {
        sections.push("", `### ${artifact.label} — ${artifact.sourceTitle}`, `\`\`\`${artifact.language}`, artifact.code, "\`\`\`");
      }
    }

    return sections.join("\n");
  }, [
    activeChat.messages,
    activeChat.title,
    activeWorkspace.name,
    artifacts,
    conversationKnowledge,
    currentConversationId,
    feedbacks.length,
    interactionPatterns,
    selectedAgent,
    selectedLanguage,
    userPreferences.memoryNotes,
    userPreferences.styleMode,
  ]);

  const copyVsCodePrompt = useCallback(async () => {
    const bundle = createVsCodeBundle();
    await navigator.clipboard.writeText(bundle);
    setCopied("vscode-prompt");
    setTimeout(() => setCopied(null), 2000);
  }, [createVsCodeBundle]);

  const downloadVsCodeBundle = useCallback(() => {
    const bundle = createVsCodeBundle();
    const safeTitle = (activeChat.title || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    const blob = new Blob([bundle], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeTitle}-vscode.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeChat.title, createVsCodeBundle]);

  const copyShareLink = useCallback(async () => {
    const payload: SharePayload = {
      title: activeChat.title,
      messages: activeChat.messages.map((entry) => ({
        user: entry.user,
        ai: entry.ai,
        model: entry.model,
        imageUrl: entry.imageUrl,
        fileName: entry.fileName,
        reasoning: entry.reasoning,
        routeReason: entry.routeReason,
        feedback: entry.feedback,
      })),
    };
    const share = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(toBase64(JSON.stringify(payload)))}`;
    await navigator.clipboard.writeText(share);
    setCopied("share-link");
    setTimeout(() => setCopied(null), 2000);
  }, [activeChat]);

  return (
    <>
      <div className={`min-h-screen ${bg}`}>
        <div className="mx-auto flex min-h-screen max-w-[1680px] gap-3 px-3 py-3">
          <AppNavigationColumn dark={state.dark} activeTab={activeAppTab} onSelectTab={handleSelectAppTab} />

          {isChatTab ? (
            <ConversationsSidebar
              open={sidebarOpen}
              dark={state.dark}
              cardBg={cardBg}
              inputBg={inputBg}
              workspaceName={activeWorkspace.name}
              chatSearch={chatSearch}
              chats={filteredConversations}
              activeChatId={currentConversationId}
              onClose={() => setSidebarOpen(false)}
              onSearchChange={setChatSearch}
              onCreateChat={createChatAction}
              onSelectChat={(chatId) => setActiveChatId(activeWorkspace.id, chatId)}
              onRenameChat={renameChat}
              onDeleteChat={deleteChat}
            />
          ) : null}

          <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border ${cardBg}`}>
            {isChatTab ? (
              <section className="flex h-full min-h-0 min-w-0 flex-col">
                <ChatHeader
                  dark={state.dark}
                  inputBg={inputBg}
                  assistantIcon={assistantIcon}
                  assistantName={assistantName}
                  activeChatTitle={activeChat.title}
                  activeAgentId={selectedAgent}
                  builtInAgents={BUILT_IN_AGENTS}
                  customAgents={customAgents}
                  onOpenSidebar={() => setSidebarOpen(true)}
                  onSelectAgent={selectActiveAgent}
                  onOpenAgentManager={() => setCustomAgentManagerOpen(true)}
                  onOpenSessions={() => togglePanel("sessions")}
                  onOpenCodeHistory={() => togglePanel("history")}
                  onOpenAiTools={() => togglePanel("tools")}
                  onOpenApps={() => togglePanel("apps")}
                  onOpenShare={() => setShareDialogOpen(true)}
                  onOpenPrompts={() => setPromptManagerOpen(true)}
                  onCreateChat={createChatAction}
                />

                <div className={`min-h-0 flex-1 px-3 py-4 ${state.dark ? "bg-slate-950" : "bg-[#f7f8fd]"}`}>
                  <div className="mx-auto flex h-full max-w-5xl flex-col">
                    <GoogleIntegrationBanner
                      dark={state.dark}
                      visible={authReady && !googleLinked}
                      connecting={oauthLoading === "google"}
                      onConnectGoogle={() => void signInWithProvider("google")}
                      onOpenApps={() => setAppsOpen(true)}
                    />

                    <div className="lg:hidden">
                      <ConversationToolbar
                        dark={state.dark}
                        sessionCount={conversations.length}
                        artifactCount={artifacts.length}
                        onOpenSessions={() => togglePanel("sessions")}
                        onOpenCodeHistory={() => togglePanel("history")}
                        onOpenAiTools={() => togglePanel("tools")}
                        onOpenApps={() => togglePanel("apps")}
                      />
                    </div>

                    <div className="min-h-0 flex flex-1 flex-col">
                      <PullToRefresh
                        dark={state.dark}
                        disabled={loading}
                        scrollContainerRef={chatScrollRef}
                        onRefresh={refreshConversation}
                      />
                      <ChatList
                        chat={activeChat.messages}
                        loading={loading}
                        dark={state.dark}
                        cardBg={cardBg}
                        codeBg={codeBg}
                        copied={copied}
                        scrollRef={chatScrollRef}
                        chatEndRef={chatEndRef}
                        openReasoning={openReasoning}
                        onCopyText={copyCode}
                        onToggleReasoning={toggleReasoning}
                        onEditUser={editUserMessage}
                        editingMessageId={editingMessageId}
                        editedMessageContent={editedMessageContent}
                        onStartEditingMessage={startEditingMessage}
                        onEditedMessageChange={setEditedMessageContent}
                        onCancelEditingMessage={cancelEditingMessage}
                        onSaveEditedMessage={saveEditedMessage}
                        onResponseAction={applyResponseAction}
                        onCreateFollowUp={createFollowUp}
                        onSetFeedback={setMessageFeedback}
                        onQuickStart={(text, nextMode) => {
                          if (nextMode) setWorkspaceMode(nextMode);
                          setComposerText(text);
                        }}
                        assistantName={assistantName}
                        assistantDescription={assistantDescription}
                        assistantIcon={assistantIcon}
                      />
                    </div>

                    <ThinkingIndicator
                      dark={state.dark}
                      visible={loading || stopRequested}
                      status={stopRequested ? "Stopping response..." : latestEntry?.status}
                      routeReason={latestEntry?.routeReason}
                    />
                  </div>
                </div>

                <ChatComposer
                  dark={state.dark}
                  message={message}
                  file={file}
                  filePreview={filePreview}
                  queuedMessages={queuedMessages}
                  loading={loading}
                  composerPreview={composerPreview}
                  fileInputRef={fileInputRef}
                  inputRef={inputRef}
                  onMessageChange={setMessage}
                  onSelectFile={handleFile}
                  onRemoveFile={() => {
                    setFile(null);
                    setFilePreview(null);
                    setWorkspaceMode("auto");
                  }}
                  onTogglePreview={() => setComposerPreview((prev) => !prev)}
                  onStopGeneration={stopCurrentGeneration}
                  onQueueMessage={queueComposerMessage}
                  onRemoveQueuedMessage={removeQueuedMessage}
                />
              </section>
            ) : (
              <section className={`h-full min-h-0 ${state.dark ? "bg-slate-950" : "bg-[#f7f8fd]"}`} />
            )}
          </main>
        </div>
      </div>

      {isChatTab ? (
        <>
          <PromptManager
            key={`${activeWorkspace.id}-${promptManagerOpen ? "open" : "closed"}-${activeWorkspace.settings.promptTemplates.length}`}
            open={promptManagerOpen}
            dark={state.dark}
            templates={activeWorkspace.settings.promptTemplates}
            modeOptions={MODE_PANEL_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
            onClose={() => setPromptManagerOpen(false)}
            onApply={applyPromptTemplate}
            onCreate={createPromptTemplate}
            onUpdate={updatePromptTemplate}
            onDelete={deletePromptTemplate}
          />

          <CustomAgentManager
            key={`${activeWorkspace.id}-${customAgentManagerOpen ? "open" : "closed"}-${activeWorkspace.settings.customAgents.length}`}
            open={customAgentManagerOpen}
            dark={state.dark}
            agents={customAgents}
            modeOptions={MODE_PANEL_OPTIONS.filter((option) => option.id === "chat" || option.id === "code").map((option) => ({ id: option.id, label: option.label }))}
            onClose={() => setCustomAgentManagerOpen(false)}
            onCreate={(agent) => workspaceQueries.createCustomAgentMutation.mutate(agent)}
            onUpdate={(agentId, agent) => workspaceQueries.updateCustomAgentMutation.mutate({ agentId, agent })}
            onDelete={deleteCustomAgent}
          />

          <ShareConversationDialog
            open={shareDialogOpen}
            dark={state.dark}
            title={activeChat.title}
            copied={copied}
            onClose={() => setShareDialogOpen(false)}
            onCopyShareLink={() => void copyShareLink()}
            onExportMarkdown={exportMarkdown}
            onExportJson={exportJson}
            onCopyVsCodePrompt={() => void copyVsCodePrompt()}
            onDownloadVsCodeBundle={downloadVsCodeBundle}
          />

          <ChatSessionsPanel
            open={sessionsOpen}
            dark={state.dark}
            workspaceName={activeWorkspace.name}
            searchValue={chatSearch}
            sessions={sessionItems}
            onSearchChange={setChatSearch}
            onCreateSession={createChatAction}
            onSelectSession={(chatId) => {
              setActiveChatId(activeWorkspace.id, chatId);
              closePanels();
            }}
            onRenameSession={renameChat}
            onDeleteSession={deleteChat}
            onClose={closePanels}
          />

          <AIToolsPanel
            open={aiToolsOpen}
            dark={state.dark}
            showModes={false}
            mode={mode}
            modeOptions={MODE_PANEL_OPTIONS}
            quickChips={QUICK_CHIPS}
            settings={{
              styleMode: userPreferences.styleMode,
              languageLock: userPreferences.languageLock,
              memoryEnabled: userPreferences.memoryEnabled,
              memoryNotes: userPreferences.memoryNotes,
            }}
            languageOptions={TEXT_LANGUAGE_OPTIONS}
            onClose={closePanels}
            onModeChange={(modeId) => setWorkspaceMode(modeId as Mode)}
            onQuickChip={(chip) => {
              if (chip.mode) setWorkspaceMode(chip.mode as Mode);
              setComposerText(chip.text);
              closePanels();
            }}
            onStyleChange={(value) => workspaceQueries.updatePreferencesMutation.mutate({ styleMode: value as StyleMode })}
            onLanguageChange={(value) => workspaceQueries.updatePreferencesMutation.mutate({ languageLock: value })}
            onMemoryToggle={(enabled) => workspaceQueries.updatePreferencesMutation.mutate({ memoryEnabled: enabled })}
            onMemoryNotesChange={(value) => workspaceQueries.updatePreferencesMutation.mutate({ memoryNotes: value })}
            onClearMemory={() => workspaceQueries.updatePreferencesMutation.mutate({ memoryNotes: "" })}
            onClearChat={() => {
              clearActiveChat();
              closePanels();
            }}
          />

          <CodeHistoryPanel
            open={codeHistoryOpen}
            dark={state.dark}
            artifacts={artifacts}
            copied={copied}
            onCopyCode={copyCode}
            onClose={closePanels}
          />

          <GitHubPanel
            open={appsOpen}
            dark={state.dark}
            linkedProviders={linkedProviders}
            authProvider={authProvider}
            oauthLoading={oauthLoading}
            copied={copied}
            hasArtifacts={artifacts.length > 0}
            onClose={closePanels}
            onConnectProvider={(provider) => void signInWithProvider(provider)}
            onImportFile={handleImportedFile}
            onCopyVsCodePrompt={() => void copyVsCodePrompt()}
            onDownloadVsCodeBundle={downloadVsCodeBundle}
          />
        </>
      ) : null}
    </>
  );
}
