"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIToolsPanel } from "../AIToolsPanel";
import { ChatComposer } from "../ChatComposer";
import { ChatHeader } from "../ChatHeader";
import { ChatList } from "../ChatList";
import { ChatSessionsPanel } from "../ChatSessionsPanel";
import { CodeHistoryPanel } from "../CodeHistoryPanel";
import { ConversationToolbar } from "../ConversationToolbar";
import { ConversationsSidebar } from "../ConversationsSidebar";
import { CustomAgentManager } from "../CustomAgentManager";
import { GitHubPanel } from "../GitHubPanel";
import { GoogleIntegrationBanner } from "../GoogleIntegrationBanner";
import { ModelSelector } from "../ModelSelector";
import { PremiumPlanBanner } from "../PremiumPlanBanner";
import { PromptManager } from "../PromptManager";
import { ShareConversationDialog } from "../ShareConversationDialog";
import { ThinkingIndicator } from "../ThinkingIndicator";
import { UsageDashboard } from "../UsageDashboard";
import { WorkspaceToolsPanel } from "../WorkspaceToolsPanel";
import { useWorkspaceQueries } from "../../hooks/useWorkspaceQueries";
import {
  buildChatSessionItems,
  fromBase64,
  MODE_PANEL_OPTIONS,
  QUICK_CHIPS,
  stripMarkdown,
  TEXT_LANGUAGE_OPTIONS,
  // function getAllTags(conversations: any[]): string[] {
  toBase64,
} from "../../lib/chat-state";
import type {
  MessageFeedback,
  Mode,
  ResponseAction,
  SharePayload,
  StyleMode,
} from "../../lib/chat-types";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useMemorySummarizer } from "../../hooks/useMemorySummarizer";
import { useChatTransport } from "../../hooks/useChatTransport";
import { PRO_PLAN, PRO_PLUS_PLAN, isModelPremiumOnly } from "@/lib/ai-config";
import type { ThinkingEffort } from "../ModelSelector";

/** Poll interval for the model health endpoint (ms). */
const MODEL_HEALTH_POLL_MS = 60_000; // 1 minute
const THINKING_EFFORT_STORAGE_KEY = "assistantx.thinking-effort";
const THINKING_EFFORT_OPTIONS: ThinkingEffort[] = ["Low", "Medium", "High", "Xhigh"];

function isThinkingEffort(value: string | null): value is ThinkingEffort {
  return value !== null && (THINKING_EFFORT_OPTIONS as readonly string[]).includes(value);
}

/** Fetch the set of currently-down model IDs from the server. */
async function fetchDownModelIds(): Promise<Set<string>> {
  try {
    const res = await fetch("/api/model-health");
    if (!res.ok) return new Set();
    const data = await res.json() as { downModels?: string[] };
    return new Set(Array.isArray(data.downModels) ? data.downModels : []);
  } catch {
    return new Set();
  }
}

export function ChatTab() {
  const {
    state,
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
    setPreferredModelId,
    setCostMode,
    setUserPlan,
    incrementPremiumRequests,
    createChatAction,
    renameChat,
    setChatTags,
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
    forkChatAtMessage,
    setMemoryNotes,
    setSystemPrompt,
    setEnabledTools,
    assistantName,
    assistantDescription,
    activeAgentId,
    assistantIcon,
    authReady,
    authProvider,
    linkedProviders,
    oauthLoading,
    cloudBootstrapped,
    signInWithProvider,
    stateRef,
  } = useWorkspace();

  const [message, setMessage] = useState("");
  const [composerPreview, setComposerPreview] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(() => {
    if (typeof window === "undefined") return "Medium";
    const saved = window.localStorage.getItem(THINKING_EFFORT_STORAGE_KEY);
    return isThinkingEffort(saved) ? saved : "Medium";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [codeHistoryOpen, setCodeHistoryOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [customAgentManagerOpen, setCustomAgentManagerOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [workspaceToolsOpen, setWorkspaceToolsOpen] = useState(false);
  const [usageDashboardOpen, setUsageDashboardOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedMessageContent, setEditedMessageContent] = useState("");
  const [downModelIds, setDownModelIds] = useState<Set<string>>(new Set());
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importedShareRef = useRef(false);

  // Poll the model-health endpoint to keep the down-model set up to date.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      void fetchDownModelIds().then((ids) => {
        if (!cancelled) setDownModelIds(ids);
      });
    };
    poll();
    const timer = setInterval(poll, MODEL_HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const currentConversationId = activeChat.id;
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
      const tagStr = (chat.tags ?? []).join(" ");
      const haystack = `${chat.title} ${tagStr} ${latest?.user ?? ""} ${latest?.ai ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [chatSearch, conversations]);
  const sessionItems = useMemo(
    () => buildChatSessionItems(filteredConversations, currentConversationId),
    [currentConversationId, filteredConversations]
  );

  const cardBg = state.dark ? "bg-slate-900 border-slate-800" : "bg-white/92 border-sky-200/60 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.22)]";
  const inputBg = state.dark ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const codeBg = state.dark ? "bg-slate-950" : "bg-slate-100";
  const googleLinked = linkedProviders.includes("google") || authProvider === "google";
  const latestEntry = activeChat.messages[activeChat.messages.length - 1];

  const {
    loading,
    stopRequested,
    queuedMessages,
    queueComposerMessage: transportQueueMessage,
    removeQueuedMessage,
    stopCurrentGeneration,
    setGoogleContext,
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

  const queueComposerMessage = useCallback((thinkingEffort: number) => {
    // Block paid users who have exhausted their monthly request quota
    const planLimit = state.userPlan === "pro"
      ? PRO_PLAN.premiumRequestsPerMonth
      : state.userPlan === "pro+"
        ? PRO_PLUS_PLAN.premiumRequestsPerMonth
        : null;
    if (planLimit !== null && state.premiumRequestsUsed >= planLimit) {
      return;
    }

    // Count each sent message against the plan request quota.
    const selectedModelId = activeWorkspace.settings.preferredModelId;
    if ((state.userPlan === "pro" || state.userPlan === "pro+") &&
      (selectedModelId == null || isModelPremiumOnly(selectedModelId))) {
      incrementPremiumRequests();
    }

    transportQueueMessage(thinkingEffort);
  }, [activeWorkspace.settings.preferredModelId, incrementPremiumRequests, state.premiumRequestsUsed, state.userPlan, transportQueueMessage]);

  // Fork conversation at a specific message index
  const handleFork = useCallback((messageIndex: number) => {
    forkChatAtMessage(messageIndex);
  }, [forkChatAtMessage]);

  // Auto-summarize older messages into workspace memory notes
  useMemorySummarizer({
    workspaceId: activeWorkspace.id,
    chatId: activeChat.id,
    messages: activeChat.messages,
    memoryEnabled: activeWorkspace.settings.memoryEnabled,
    memoryNotes: activeWorkspace.settings.memoryNotes,
    setMemoryNotes,
  });


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
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THINKING_EFFORT_STORAGE_KEY, thinkingEffort);
  }, [thinkingEffort]);

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

  // Global keyboard shortcut: Cmd/Ctrl+K → new chat
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        // Don't fire when the user is typing in an input, textarea, or contenteditable
        if (!(event.target instanceof HTMLElement)) return;
        const target = event.target;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
        event.preventDefault();
        createChatAction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createChatAction]);

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
          entry.id === messageId
            ? { ...entry, feedback: feedback ?? undefined, reviewText: feedback === null ? undefined : entry.reviewText }
            : entry
        )),
      },
    });
  }, [activeChat.messages, currentConversationId, workspaceQueries.updateConversationMutation]);

  const setMessageReviewText = useCallback((messageId: string, reviewText: string) => {
    workspaceQueries.updateConversationMutation.mutate({
      chatId: currentConversationId,
      patch: {
        messages: activeChat.messages.map((entry) => (
          entry.id === messageId ? { ...entry, reviewText: reviewText || undefined } : entry
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
      sections.push("", "## Recenzje", `- Ocenione odpowiedzi asystenta: ${feedbacks.length}`);
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
        reviewText: entry.reviewText,
      })),
    };
    const share = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(toBase64(JSON.stringify(payload)))}`;
    await navigator.clipboard.writeText(share);
    setCopied("share-link");
    setTimeout(() => setCopied(null), 2000);
  }, [activeChat]);

  return (
    <>
      <div className="xl:hidden">
        <ConversationsSidebar
          open={sidebarOpen}
          dark={state.dark}
          cardBg={cardBg}
          inputBg={inputBg}
          workspaceName={activeWorkspace.name}
          chatSearch={chatSearch}
          chats={filteredConversations}
          activeChatId={currentConversationId}
          systemPrompt={activeWorkspace.settings.systemPrompt ?? ""}
          onClose={() => setSidebarOpen(false)}
          onSearchChange={setChatSearch}
          onCreateChat={createChatAction}
          onSelectChat={(chatId) => setActiveChatId(activeWorkspace.id, chatId)}
          onRenameChat={renameChat}
          onDeleteChat={deleteChat}
          onSetChatTags={setChatTags}
          onSetSystemPrompt={setSystemPrompt}
        />
      </div>

      <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border transition-all duration-200 ${cardBg}`}>
        <section className="flex h-full min-h-0 min-w-0 flex-col animate-tab-enter">
          <ChatHeader
            dark={state.dark}
            inputBg={inputBg}
            assistantIcon={assistantIcon}
            assistantName={assistantName}
            activeChatTitle={activeChat.title}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenAgentManager={() => setCustomAgentManagerOpen(true)}
            onOpenSessions={() => togglePanel("sessions")}
            onOpenCodeHistory={() => togglePanel("history")}
            onOpenAiTools={() => togglePanel("tools")}
            onOpenApps={() => togglePanel("apps")}
            onOpenShare={() => setShareDialogOpen(true)}
            onOpenPrompts={() => setPromptManagerOpen(true)}
            onCreateChat={createChatAction}
            onOpenWorkspaceTools={() => setWorkspaceToolsOpen((prev) => !prev)}
            onOpenUsage={() => setUsageDashboardOpen((prev) => !prev)}
          />

          <div className={`min-h-0 flex-1 px-3 py-4 transition-colors duration-200 ${state.dark ? "bg-slate-950" : "bg-[#f7f8fd]"}`}>
            <div className="mx-auto flex h-full max-w-5xl flex-col">
              <PremiumPlanBanner
                dark={state.dark}
                userPlan={state.userPlan}
                premiumRequestsUsed={state.premiumRequestsUsed}
                onSetUserPlan={setUserPlan}
              />

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
                  onSetReviewText={setMessageReviewText}
                  onFork={handleFork}
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
                partialResponseLength={loading ? (latestEntry?.ai?.length ?? 0) : 0}
              />
            </div>
          </div>

          <div className={`border-t border-slate-200 px-4 py-2 dark:border-slate-800 ${state.dark ? "bg-slate-900/90" : "bg-white/90"}`}>
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
              <ModelSelector
                dark={state.dark}
                preferredModelId={activeWorkspace.settings.preferredModelId ?? null}
                isPremium={state.userPlan !== "free"}
                isProPlus={state.userPlan === "pro+"}
                onSelectModel={setPreferredModelId}
                thinkingEffort={thinkingEffort}
                onThinkingEffortChange={setThinkingEffort}
                appMode={state.appMode}
                downModelIds={downModelIds}
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
            selectedModel={activeWorkspace.settings.preferredModelId ?? "openai/gpt-5.4"}
            thinkingEffort={thinkingEffort}
            premiumLimitReached={(() => {
              const limit = state.userPlan === "pro"
                ? PRO_PLAN.premiumRequestsPerMonth
                : state.userPlan === "pro+"
                  ? PRO_PLUS_PLAN.premiumRequestsPerMonth
                  : null;
              return limit !== null && state.premiumRequestsUsed >= limit;
            })()}
            planRequestLimit={
              state.userPlan === "pro"
                ? PRO_PLAN.premiumRequestsPerMonth
                : state.userPlan === "pro+"
                  ? PRO_PLUS_PLAN.premiumRequestsPerMonth
                  : undefined
            }
          />
        </section>
      </main>

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
        onSendGoogleContext={(context) => { setGoogleContext(context); }}
      />
      <WorkspaceToolsPanel
        open={workspaceToolsOpen}
        dark={state.dark}
        enabledTools={activeWorkspace.settings.enabledTools ?? []}
        onToggleTool={setEnabledTools}
        onClose={() => setWorkspaceToolsOpen(false)}
      />

      <UsageDashboard
        open={usageDashboardOpen}
        dark={state.dark}
        userPlan={state.userPlan}
        premiumRequestsUsed={state.premiumRequestsUsed}
        workspaces={state.workspaces}
        onClose={() => setUsageDashboardOpen(false)}
      />
    </>
  );
}
