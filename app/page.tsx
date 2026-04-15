"use client";

import { CalendarDays, ClipboardCheck, Code2, ImageIcon, Mail, type LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AIMessage } from "./components/AIMessage";
import { AIToolsPanel } from "./components/AIToolsPanel";
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
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import {
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
  onResponseAction: (action: ResponseAction, text: string) => void;
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
  onResponseAction,
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
              <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-sm text-white">
                {entry.user}
              </div>
              <button onClick={() => onEditUser(entry.user)} className={`mt-1 ml-auto block text-xs ${dark ? "text-blue-300" : "text-blue-600"}`}>
                Edit and resend
              </button>
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
            onCopyText={onCopyText}
            onToggleReasoning={onToggleReasoning}
            onResponseAction={onResponseAction}
          />
        </div>
      ))}

      <div ref={chatEndRef} />
    </div>
  );
});

export default function Home() {
  const [message, setMessage] = useState("");
  const [composerPreview, setComposerPreview] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"sessions" | "history" | "tools" | "apps" | null>(null);
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [customAgentManagerOpen, setCustomAgentManagerOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
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
    filteredChats,
    sessionItems,
    mode,
    chatSearch,
    setChatSearch,
    updateChat,
    updateLastMessage,
    setActiveChatId,
    setWorkspaceMode,
    createChatAction,
    renameChat,
    deleteChat,
    clearActiveChat,
    setStyleMode,
    setLanguageLock,
    setMemoryEnabled,
    setMemoryNotes,
    clearMemoryNotes,
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

  const copyCode = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }, []);

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
    setActivePanel(null);
  }, [handleFile, setComposerText]);

  const togglePanel = useCallback((panel: "sessions" | "history" | "tools" | "apps") => {
    setActivePanel((current) => current === panel ? null : panel);
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
      "- Routing: Automatic model routing",
      `- Style: ${activeWorkspace.settings.styleMode}`,
      `- Language lock: ${activeWorkspace.settings.languageLock}`,
    ];

    if (activeWorkspace.settings.memoryNotes.trim()) {
      sections.push("", "## Pinned memory", activeWorkspace.settings.memoryNotes.trim());
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
  }, [activeChat, activeWorkspace, artifacts]);

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
          <ConversationsSidebar
            open={sidebarOpen}
            dark={state.dark}
            cardBg={cardBg}
            inputBg={inputBg}
            workspaceName={activeWorkspace.name}
            chatSearch={chatSearch}
            chats={filteredChats}
            activeChatId={activeChat.id}
            onClose={() => setSidebarOpen(false)}
            onSearchChange={setChatSearch}
            onCreateChat={createChatAction}
            onSelectChat={(chatId) => setActiveChatId(activeWorkspace.id, chatId)}
            onRenameChat={renameChat}
            onDeleteChat={deleteChat}
          />

          <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border ${cardBg}`}>
            <section className="flex h-full min-h-0 min-w-0 flex-col">
              <ChatHeader
                dark={state.dark}
                inputBg={inputBg}
                assistantIcon={assistantIcon}
                assistantName={assistantName}
                activeChatTitle={activeChat.title}
                activeAgentId={activeAgentId}
                builtInAgents={BUILT_IN_AGENTS}
                customAgents={activeWorkspace.settings.customAgents}
                onOpenSidebar={() => setSidebarOpen(true)}
                onSelectAgent={selectActiveAgent}
                onOpenAgentManager={() => setCustomAgentManagerOpen(true)}
                onOpenShare={() => setShareDialogOpen(true)}
                onOpenPrompts={() => setPromptManagerOpen(true)}
                onCreateChat={createChatAction}
              />

              <div className={`min-h-0 flex-1 px-3 py-4 ${state.dark ? "bg-slate-950" : "bg-[#f7f8fd]"}`}>
                <div className="mx-auto flex h-full max-w-5xl flex-col">
                  <ConversationToolbar
                    dark={state.dark}
                    sessionCount={activeWorkspace.chats.length}
                    artifactCount={artifacts.length}
                    onOpenSessions={() => togglePanel("sessions")}
                    onOpenCodeHistory={() => togglePanel("history")}
                    onOpenAiTools={() => togglePanel("tools")}
                    onOpenApps={() => togglePanel("apps")}
                  />

                  <GoogleIntegrationBanner
                    dark={state.dark}
                    visible={authReady && !googleLinked}
                    connecting={oauthLoading === "google"}
                    onConnectGoogle={() => void signInWithProvider("google")}
                    onOpenApps={() => setActivePanel("apps")}
                  />

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
                      onResponseAction={applyResponseAction}
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
                    visible={loading}
                    status={latestEntry?.status}
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
          </main>
        </div>
      </div>

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
        agents={activeWorkspace.settings.customAgents}
        modeOptions={MODE_PANEL_OPTIONS.filter((option) => option.id === "chat" || option.id === "code").map((option) => ({ id: option.id, label: option.label }))}
        onClose={() => setCustomAgentManagerOpen(false)}
        onCreate={createCustomAgent}
        onUpdate={updateCustomAgent}
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
        open={activePanel === "sessions"}
        dark={state.dark}
        workspaceName={activeWorkspace.name}
        searchValue={chatSearch}
        sessions={sessionItems}
        onSearchChange={setChatSearch}
        onCreateSession={createChatAction}
        onSelectSession={(chatId) => {
          setActiveChatId(activeWorkspace.id, chatId);
          setActivePanel(null);
        }}
        onRenameSession={renameChat}
        onDeleteSession={deleteChat}
        onClose={() => setActivePanel(null)}
      />

      <AIToolsPanel
        open={activePanel === "tools"}
        dark={state.dark}
        showModes={false}
        mode={mode}
        modeOptions={MODE_PANEL_OPTIONS}
        quickChips={QUICK_CHIPS}
        settings={{
          styleMode: activeWorkspace.settings.styleMode,
          languageLock: activeWorkspace.settings.languageLock,
          memoryEnabled: activeWorkspace.settings.memoryEnabled,
          memoryNotes: activeWorkspace.settings.memoryNotes,
        }}
        languageOptions={TEXT_LANGUAGE_OPTIONS}
        onClose={() => setActivePanel(null)}
        onModeChange={(modeId) => setWorkspaceMode(modeId as Mode)}
        onQuickChip={(chip) => {
          if (chip.mode) setWorkspaceMode(chip.mode as Mode);
          setComposerText(chip.text);
          setActivePanel(null);
        }}
        onStyleChange={(value) => setStyleMode(value as StyleMode)}
        onLanguageChange={setLanguageLock}
        onMemoryToggle={setMemoryEnabled}
        onMemoryNotesChange={setMemoryNotes}
        onClearMemory={clearMemoryNotes}
        onClearChat={() => {
          clearActiveChat();
          setActivePanel(null);
        }}
      />

      <CodeHistoryPanel
        open={activePanel === "history"}
        dark={state.dark}
        artifacts={artifacts}
        copied={copied}
        onCopyCode={copyCode}
        onClose={() => setActivePanel(null)}
      />

      <GitHubPanel
        open={activePanel === "apps"}
        dark={state.dark}
        linkedProviders={linkedProviders}
        authProvider={authProvider}
        oauthLoading={oauthLoading}
        copied={copied}
        hasArtifacts={artifacts.length > 0}
        onClose={() => setActivePanel(null)}
        onConnectProvider={(provider) => void signInWithProvider(provider)}
        onImportFile={handleImportedFile}
        onCopyVsCodePrompt={() => void copyVsCodePrompt()}
        onDownloadVsCodeBundle={downloadVsCodeBundle}
      />
    </>
  );
}