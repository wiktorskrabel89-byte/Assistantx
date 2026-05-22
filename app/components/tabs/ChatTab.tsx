"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatComposer } from "../ChatComposer";
import { ChatHeader } from "../ChatHeader";
import { ChatList } from "../ChatList";
import { ConversationToolbar } from "../ConversationToolbar";
import { GoogleIntegrationBanner } from "../GoogleIntegrationBanner";
import dynamic from "next/dynamic";
import { PremiumPlanBanner } from "../PremiumPlanBanner";
import { ThinkingIndicator } from "../ThinkingIndicator";
import { useWorkspaceQueries } from "../../hooks/useWorkspaceQueries";
import {
  buildChatSessionItems,
  createId,
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
import { useMCPInstallations } from "../../hooks/useMCPInstallations";
import { executeActionModeSteps } from "../tabs/ModesTab";
import { isEditableElementTarget } from "../../lib/keyboard";
import { PRO_PLAN, PRO_PLUS_PLAN, isModelPremiumOnly } from "@/lib/ai-config";
import { DEFAULT_WEB_WAKE_PHRASE } from "@/app/lib/voice";
import { filterAssistantCommandsForQuery, shouldShowSlashSuggestions } from "@/src/core/commands/parser";
import { useJarvisDeviceStatus } from "@/app/hooks/useJarvisDeviceStatus";

/** Poll interval for the model health endpoint (ms). */
const PREMIUM_BANNER_HIDDEN_KEY = "assistantx.premium-banner-hidden";
const ConversationsSidebar = dynamic(
  () => import("../ConversationsSidebar").then((mod) => mod.ConversationsSidebar),
  { ssr: false },
);
const PromptManager = dynamic(
  () => import("../PromptManager").then((mod) => mod.PromptManager),
  { ssr: false },
);
const CustomAgentManager = dynamic(
  () => import("../CustomAgentManager").then((mod) => mod.CustomAgentManager),
  { ssr: false },
);
const ShareConversationDialog = dynamic(
  () => import("../ShareConversationDialog").then((mod) => mod.ShareConversationDialog),
  { ssr: false },
);
const ChatSessionsPanel = dynamic(
  () => import("../ChatSessionsPanel").then((mod) => mod.ChatSessionsPanel),
  { ssr: false },
);
const AIToolsPanel = dynamic(
  () => import("../AIToolsPanel").then((mod) => mod.AIToolsPanel),
  { ssr: false },
);
const CodeHistoryPanel = dynamic(
  () => import("../CodeHistoryPanel").then((mod) => mod.CodeHistoryPanel),
  { ssr: false },
);
const GitHubPanel = dynamic(
  () => import("../GitHubPanel").then((mod) => mod.GitHubPanel),
  { ssr: false },
);
const WorkspaceToolsPanel = dynamic(
  () => import("../WorkspaceToolsPanel").then((mod) => mod.WorkspaceToolsPanel),
  { ssr: false },
);
const UsageDashboard = dynamic(
  () => import("../UsageDashboard").then((mod) => mod.UsageDashboard),
  { ssr: false },
);


// Module-level constants — avoid recompiling regexes on every call
const MODE_ACTIVATE_PATTERN = /^(?:hey\s+jarvis[,]?\s+)?(?:start|turn\s+on|activate|enable|open)\s+(.+?)\s+mode\s*$/i;
const MODE_DEACTIVATE_PATTERN = /^(?:hey\s+jarvis[,]?\s+)?(?:stop|turn\s+off|deactivate|disable|exit|close)\s+(?:(.+?)\s+)?mode\s*$/i;

export function ChatTab({
  externalComposerSeed,
  onConsumeExternalComposerSeed,
  highlightGitHubCard = false,
}: {
  externalComposerSeed?: { text: string; mode?: Mode } | null;
  onConsumeExternalComposerSeed?: () => void;
  highlightGitHubCard?: boolean;
} = {}) {
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
    setActiveJarvisMode,
    setActiveActionMode,
  } = useWorkspace();

  const activeJarvisMode = activeWorkspace.settings.actionModes?.find(
    (m) => m.id === activeWorkspace.settings.activeActionModeId
  ) ?? null;

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
  const [workspaceToolsOpen, setWorkspaceToolsOpen] = useState(false);
  const [usageDashboardOpen, setUsageDashboardOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedMessageContent, setEditedMessageContent] = useState("");
  const [wakeActivationSignal, setWakeActivationSignal] = useState(0);
  const [premiumBannerHidden, setPremiumBannerHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(PREMIUM_BANNER_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importedShareRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREMIUM_BANNER_HIDDEN_KEY, premiumBannerHidden ? "1" : "0");
    } catch {
      // ignore
    }
  }, [premiumBannerHidden]);

  const currentConversationId = activeChat.id;
  const workspaceQueries = useWorkspaceQueries({
    activeWorkspace,
    activeChat,
    updateWorkspace,
    updateChat,
    createCustomAgent,
    updateCustomAgent,
    options: { enableInsights: shareDialogOpen || appsOpen },
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

  const googleLinked = linkedProviders.includes("google") || authProvider === "google";
  const latestEntry = activeChat.messages[activeChat.messages.length - 1];
  const voiceSettings = activeWorkspace.settings;

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
  const { hasTrustedOnlineDesktop } = useJarvisDeviceStatus();

  // Check if a composer message is a mode activation voice command.
  // If so, run the mode steps and swallow the message (don't send to AI).
  const tryHandleModeCommand = useCallback((text: string): boolean => {
    const activateMatch = MODE_ACTIVATE_PATTERN.exec(text.trim());
    if (activateMatch) {
      const requestedName = activateMatch[1].toLowerCase();
      const matched = (activeWorkspace.settings.actionModes ?? []).find(
        (m) => m.name.toLowerCase() === requestedName
      );
      if (matched) {
        setActiveActionMode(matched.id);
        executeActionModeSteps(matched.steps, activeWorkspace.settings.jarvisModes ?? [], {
          setActiveJarvisMode,
          queueChatMessage: undefined,
        });
        updateChat(activeWorkspace.id, activeChat.id, (chat) => ({
          ...chat,
          messages: [
            ...chat.messages,
            { id: createId(), user: text, ai: `${matched.icon} **${matched.name} Mode** activated! Running ${matched.steps.length} step${matched.steps.length === 1 ? "" : "s"}…`, model: null, createdAt: Date.now() },
          ],
        }));
        return true;
      }
    }

    const deactivateMatch = MODE_DEACTIVATE_PATTERN.exec(text.trim());
    if (deactivateMatch && activeWorkspace.settings.activeActionModeId) {
      setActiveActionMode(null);
      updateChat(activeWorkspace.id, activeChat.id, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          { id: createId(), user: text, ai: "Mode deactivated.", model: null, createdAt: Date.now() },
        ],
      }));
      return true;
    }

    return false;
  }, [activeChat.id, activeWorkspace, setActiveActionMode, setActiveJarvisMode, updateChat]);

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

    // Intercept mode voice commands before sending to AI
    if (tryHandleModeCommand(message)) {
      setMessage("");
      return;
    }

    // Count each sent message against the plan request quota.
    const selectedModelId = activeWorkspace.settings.preferredModelId;
    if ((state.userPlan === "pro" || state.userPlan === "pro+") &&
      (selectedModelId == null || isModelPremiumOnly(selectedModelId))) {
      incrementPremiumRequests();
    }

    transportQueueMessage(thinkingEffort);
  }, [activeWorkspace.settings.preferredModelId, incrementPremiumRequests, message, setMessage, state.premiumRequestsUsed, state.userPlan, transportQueueMessage, tryHandleModeCommand]);

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

  const { installedCount: mcpInstalledCount } = useMCPInstallations();
  const showSlashSuggestions = shouldShowSlashSuggestions(message);
  const slashSuggestions = useMemo(() => (
    filterAssistantCommandsForQuery(message).map((command) => ({
      id: command.id,
      slash: `${command.slash}${command.argsPlaceholder ? ` ${command.argsPlaceholder}` : ""}`,
      title: command.title,
      description: command.description,
      disabled: command.requiresDesktop && !hasTrustedOnlineDesktop,
      disabledReason: command.requiresDesktop && !hasTrustedOnlineDesktop ? "Wymaga PC" : undefined,
    }))
  ), [hasTrustedOnlineDesktop, message]);


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
    if (!voiceSettings.wakeWordEnabled || !voiceSettings.sttEnabled) return;

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    let cancelled = false;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = voiceSettings.voiceLanguage || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (cancelled || document.visibilityState !== "visible") return;
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const normalized = transcript.toLowerCase();
      const phrase = (voiceSettings.wakeWordPhrase || DEFAULT_WEB_WAKE_PHRASE).toLowerCase();
      if (normalized.includes(phrase)) {
        setWakeActivationSignal((current) => current + 1);
      }
    };
    recognition.onend = () => {
      if (!cancelled && document.visibilityState === "visible") {
        try {
          recognition.start();
        } catch {
          // no-op
        }
      }
    };
    try {
      recognition.start();
    } catch {
      // no-op
    }

    return () => {
      cancelled = true;
      recognition.stop();
    };
  }, [
    voiceSettings.sttEnabled,
    voiceSettings.voiceLanguage,
    voiceSettings.wakeWordEnabled,
    voiceSettings.wakeWordPhrase,
  ]);

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

  const handleQuickStart = useCallback((text: string, nextMode?: Mode) => {
    if (nextMode) setWorkspaceMode(nextMode);
    setComposerText(text);
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

  // Global keyboard shortcut: Ctrl/Cmd+Shift+S → export current chat as Markdown.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || !event.shiftKey || event.key.toLowerCase() !== "s") return;
      if (isEditableElementTarget(event.target)) return;
      if (activeChat.messages.length === 0) return;
      event.preventDefault();
      exportMarkdown();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeChat.messages.length, exportMarkdown]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openAppsPanel = () => setAppsOpen(true);
    window.addEventListener("assistantx:open-apps-panel", openAppsPanel);
    return () => window.removeEventListener("assistantx:open-apps-panel", openAppsPanel);
  }, []);

  useEffect(() => {
    if (!externalComposerSeed?.text) return;
    const frameId = window.requestAnimationFrame(() => {
      setWorkspaceMode(externalComposerSeed.mode ?? "chat");
      setComposerText(externalComposerSeed.text);
      onConsumeExternalComposerSeed?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [externalComposerSeed, onConsumeExternalComposerSeed, setComposerText, setWorkspaceMode]);

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
        {sidebarOpen ? (
          <ConversationsSidebar
            open={sidebarOpen}
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
        ) : null}
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200">
        <section className="flex h-full min-h-0 min-w-0 flex-col animate-tab-enter">
          <ChatHeader
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
            onExportMarkdown={exportMarkdown}
            activeJarvisMode={activeJarvisMode}
            onDeactivateActionMode={() => setActiveActionMode(null)}
            mcpToolCount={mcpInstalledCount}
          />

          <div className="min-h-0 flex-1 px-3 py-4 bg-background transition-colors duration-200">
            <div className="mx-auto flex h-full max-w-5xl flex-col">
              {!premiumBannerHidden ? (
                <PremiumPlanBanner
                  dark={state.dark}
                  userPlan={state.userPlan}
                  premiumRequestsUsed={state.premiumRequestsUsed}
                  onDismiss={() => setPremiumBannerHidden(true)}
                />
              ) : null}
              {premiumBannerHidden ? (
                <button
                  type="button"
                  onClick={() => setPremiumBannerHidden(false)}
                  className="mb-3 self-start rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/70 hover:bg-accent"
                >
                  Show premium banner
                </button>
              ) : null}

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
                  onQuickStart={handleQuickStart}
                  assistantName={assistantName}
                  assistantDescription={assistantDescription}
                  assistantIcon={assistantIcon}
                  dark={state.dark}
                  ttsEnabled={voiceSettings.ttsEnabled}
                  autoSpeakResponses={voiceSettings.autoSpeakResponses}
                  voiceLanguage={voiceSettings.voiceLanguage}
                  ttsVoiceId={voiceSettings.ttsVoiceId}
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

          <ChatComposer
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
            sttEnabled={voiceSettings.sttEnabled}
            voiceLanguage={voiceSettings.voiceLanguage}
            wakeWordEnabled={voiceSettings.wakeWordEnabled}
            wakeWordPhrase={voiceSettings.wakeWordPhrase}
            externalVoiceActivationSignal={wakeActivationSignal}
            slashSuggestions={slashSuggestions}
            showSlashSuggestions={showSlashSuggestions}
            onSelectSlashSuggestion={(slash) => setComposerText(`${slash} `)}
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

      {promptManagerOpen ? (
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
      ) : null}

      {customAgentManagerOpen ? (
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
      ) : null}

      {shareDialogOpen ? (
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
      ) : null}

      {sessionsOpen ? (
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
      ) : null}

      {aiToolsOpen ? (
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
      ) : null}

      {codeHistoryOpen ? (
        <CodeHistoryPanel
          open={codeHistoryOpen}
          dark={state.dark}
          artifacts={artifacts}
          copied={copied}
          onCopyCode={copyCode}
          onClose={closePanels}
        />
      ) : null}

      {appsOpen ? (
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
          highlightGitHubCard={highlightGitHubCard}
        />
      ) : null}

      {workspaceToolsOpen ? (
        <WorkspaceToolsPanel
          open={workspaceToolsOpen}
          dark={state.dark}
          enabledTools={activeWorkspace.settings.enabledTools ?? []}
          onToggleTool={setEnabledTools}
          onClose={() => setWorkspaceToolsOpen(false)}
        />
      ) : null}

      {usageDashboardOpen ? (
        <UsageDashboard
          open={usageDashboardOpen}
          dark={state.dark}
          userPlan={state.userPlan}
          premiumRequestsUsed={state.premiumRequestsUsed}
          workspaces={state.workspaces}
          onClose={() => setUsageDashboardOpen(false)}
        />
      ) : null}
    </>
  );
}
