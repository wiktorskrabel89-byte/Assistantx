"use client";

import { CalendarDays, ClipboardCheck, Code2, ImageIcon, Mail, Plus, Search, type LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { AIToolsPanel } from "./components/AIToolsPanel";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { ChatSessionsPanel } from "./components/ChatSessionsPanel";
import { CustomAgentManager } from "./components/CustomAgentManager";
import { IntegrationsPanel } from "./components/IntegrationsPanel";
import { PromptManager } from "./components/PromptManager";
import { RoadmapPanel } from "./components/RoadmapPanel";
import { ShareConversationDialog } from "./components/ShareConversationDialog";
import { useChatTransport } from "./hooks/useChatTransport";
import { useSpeechInput } from "./hooks/useSpeechInput";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import {
  BUILT_IN_AGENTS,
  fromBase64,
  MODE_COLORS,
  MODE_LABELS,
  MODE_PANEL_OPTIONS,
  QUICK_CHIPS,
  stripMarkdown,
  TEXT_LANGUAGE_OPTIONS,
  TOOLBAR_TABS,
  toBase64,
} from "./lib/chat-state";
import type {
  Artifact,
  ChatEntry,
  Mode,
  ResponseAction,
  SharePayload,
  SidebarTab,
  StyleMode,
} from "./lib/chat-types";

type ChatListProps = {
  chat: ChatEntry[];
  loading: boolean;
  dark: boolean;
  cardBg: string;
  codeBg: string;
  copied: string | null;
  speaking: string | null;
  chatEndRef: RefObject<HTMLDivElement | null>;
  onSpeak: (text: string, id: string) => void;
  onCopyCode: (code: string, id: string) => void;
  openReasoning: Set<string>;
  onToggleReasoning: (id: string) => void;
  onEditUser: (text: string) => void;
  onResponseAction: (action: ResponseAction, text: string) => void;
  onQuickStart: (text: string, mode?: Mode) => void;
  assistantName: string;
  assistantDescription: string;
  assistantIcon: LucideIcon;
};

type ArtifactPanelProps = {
  artifacts: Artifact[];
  dark: boolean;
  copied: string | null;
  onCopyCode: (code: string, id: string) => void;
};

const ChatList = memo(function ChatList({
  chat,
  loading,
  dark,
  cardBg,
  codeBg,
  copied,
  speaking,
  chatEndRef,
  onSpeak,
  onCopyCode,
  openReasoning,
  onToggleReasoning,
  onEditUser,
  onResponseAction,
  onQuickStart,
  assistantName,
  assistantDescription,
  assistantIcon: AssistantIcon,
}: ChatListProps) {
  let codeBlockIdx = 0;
  const emptyStateCards: Array<{ label: string; hint: string; prompt: string; mode?: Mode; icon: LucideIcon }> = [
    { label: "Generuj Kod", hint: "Kompletne rozwiazania", prompt: "Napisz mi kompletny przyklad kodu dla: ", mode: "code", icon: Code2 },
    { label: "Zadanie", hint: "Daj AI zadanie", prompt: "Pomoz mi z zadaniem kodowania: ", mode: "chat", icon: ClipboardCheck },
    { label: "Kalendarz", hint: "AI tworzy wydarzenia", prompt: "Stworz wydarzenie w kalendarzu dla: ", mode: "chat", icon: CalendarDays },
    { label: "Email", hint: "AI pisze maile", prompt: "Napisz profesjonalnego maila dotyczacego: ", mode: "chat", icon: Mail },
    { label: "Generuj Obraz", hint: "AI tworzy obrazy", prompt: "Wygeneruj obraz przedstawiajacy: ", mode: "image", icon: ImageIcon },
  ];

  return (
    <div className="mx-auto flex-1 w-full max-w-4xl overflow-y-auto space-y-4 pr-1">
      {chat.length === 0 && (
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
            {emptyStateCards.map((card) => {
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
      )}
      {chat.map((entry, index) => (
        <div key={entry.id} className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[82%]">
              {entry.filePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.filePreview} alt="file" className="mb-1 ml-auto block h-24 rounded-xl" />
              )}
              {entry.fileName && !entry.filePreview && (
                <div className={`mb-1 ml-auto inline-flex rounded-full border px-2 py-1 text-xs ${dark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>
                  {entry.fileName}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-sm text-white">
                {entry.user}
              </div>
              <button onClick={() => onEditUser(entry.user)} className={`mt-1 ml-auto block text-xs ${dark ? "text-blue-300" : "text-blue-600"}`}>
                Edit and resend
              </button>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[88%] space-y-1">
              {entry.reasoning && (
                <div className={`mb-1 rounded-xl border px-3 py-2 text-xs ${dark ? "border-purple-800/30 bg-purple-950/30 text-purple-300" : "border-purple-200 bg-purple-50 text-purple-700"}`}>
                  <button onClick={() => onToggleReasoning(entry.id)} className="flex w-full items-center gap-2 text-left font-medium">
                    <span>Reasoning</span>
                    {loading && index === chat.length - 1
                      ? <span className="ml-auto animate-pulse">...</span>
                      : <span className="ml-auto">{openReasoning.has(entry.id) ? "-" : "+"}</span>}
                  </button>
                  {(openReasoning.has(entry.id) || (loading && index === chat.length - 1)) && (
                    <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap opacity-80 leading-relaxed">
                      {entry.reasoning}
                    </div>
                  )}
                </div>
              )}

              {entry.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.imageUrl} alt={entry.user} className="max-w-full rounded-xl border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className={`${cardBg} rounded-2xl rounded-tl-sm border px-4 py-3 text-sm`}>
                  {!entry.ai && index === chat.length - 1 && loading ? (
                    <div className="space-y-2">
                      <span className="flex items-center gap-2 py-1 text-xs text-gray-400">
                        <span className="inline-block h-2 w-20 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400/40 via-blue-400/80 to-cyan-400/40 bg-[length:200%_100%]" />
                        <span>{entry.status ?? "Thinking..."}</span>
                      </span>
                      {entry.routeReason && <div className="text-[11px] text-gray-400">{entry.routeReason}</div>}
                    </div>
                  ) : index === chat.length - 1 && loading ? (
                    <div>
                      {entry.status && <div className="mb-1 text-[11px] opacity-70">{entry.status}</div>}
                      <span className="whitespace-pre-wrap break-words leading-relaxed">{entry.ai}</span>
                    </div>
                  ) : (
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className ?? "");
                          const codeStr = String(children).replace(/\n$/, "");
                          const isBlock = Boolean(match) || codeStr.includes("\n");
                          if (isBlock) {
                            const blockId = `${entry.id}-inline-${codeBlockIdx++}`;
                            return (
                              <div className="relative my-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                                <div className={`flex items-center justify-between px-3 py-1 text-xs text-gray-400 ${dark ? "bg-gray-900" : "bg-gray-200"}`}>
                                  <span>{match?.[1] ?? "code"}</span>
                                  <button onClick={() => onCopyCode(codeStr, blockId)} className="transition-colors hover:text-white">
                                    {copied === blockId ? "Copied" : "Copy"}
                                  </button>
                                </div>
                                <SyntaxHighlighter style={dark ? oneDark : oneLight} language={match?.[1] ?? "text"} PreTag="div">
                                  {codeStr}
                                </SyntaxHighlighter>
                              </div>
                            );
                          }
                          return <code className={`${codeBg} rounded px-1 text-xs`} {...props}>{children}</code>;
                        },
                        p({ children }) { return <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>; },
                        ul({ children }) { return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>; },
                        ol({ children }) { return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>; },
                        blockquote({ children }) { return <blockquote className={`my-2 border-l-4 border-gray-400 pl-3 italic ${dark ? "text-gray-400" : "text-gray-600"}`}>{children}</blockquote>; },
                        h1({ children }) { return <h1 className="mb-2 text-xl font-bold">{children}</h1>; },
                        h2({ children }) { return <h2 className="mb-2 text-lg font-bold">{children}</h2>; },
                        h3({ children }) { return <h3 className="mb-1 text-base font-bold">{children}</h3>; },
                      }}
                    >
                      {entry.ai}
                    </ReactMarkdown>
                  )}
                </div>
              )}

              <div className="ml-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                {entry.routeReason && <span>{entry.routeReason}</span>}
                {entry.stopped ? <span className="text-amber-400">Stopped</span> : null}
                {entry.ai && !entry.imageUrl && (
                  <>
                    <button
                      onClick={() => onSpeak(entry.ai, entry.id)}
                      disabled={speaking !== null && speaking !== entry.id}
                      className={`${speaking === entry.id ? "animate-pulse text-blue-400" : "hover:text-blue-400"}`}
                      title={speaking === entry.id ? "Stop" : "Read aloud"}
                    >
                      {speaking === entry.id ? "Stop audio" : "Listen"}
                    </button>
                    <button onClick={() => navigator.clipboard.writeText(entry.ai)} className="hover:text-blue-400">
                      Copy
                    </button>
                    <button onClick={() => onResponseAction("summarize", entry.ai)} className="hover:text-blue-400">
                      Summarize
                    </button>
                    <button onClick={() => onResponseAction("checklist", entry.ai)} className="hover:text-blue-400">
                      Checklist
                    </button>
                    <button onClick={() => onResponseAction("translate", entry.ai)} className="hover:text-blue-400">
                      Translate
                    </button>
                    <button onClick={() => onResponseAction("commit", entry.ai)} className="hover:text-blue-400">
                      Commit msg
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );
});

const ArtifactPanel = memo(function ArtifactPanel({ artifacts, dark, copied, onCopyCode }: ArtifactPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(artifacts[0]?.id ?? null);
  const activeSelectedId = artifacts.some((artifact) => artifact.id === selectedId) ? selectedId : artifacts[0]?.id ?? null;
  const selected = artifacts.find((artifact) => artifact.id === activeSelectedId) ?? artifacts[0] ?? null;
  const showPreview = selected && ["html", "svg"].includes(selected.language.toLowerCase());

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-3xl border ${dark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
      <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Artifacts</h2>
        <p className="mt-1 text-xs text-gray-500">Code blocks from the active chat appear here.</p>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-400">
          No code artifacts yet. Ask for HTML, React, SQL, Python, or any other code block.
        </div>
      ) : (
        <>
          <div className="max-h-48 space-y-2 overflow-y-auto border-b border-gray-200 p-3 dark:border-gray-800">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                onClick={() => setSelectedId(artifact.id)}
                className={`w-full rounded-2xl border px-3 py-2 text-left transition-colors ${
                  selected?.id === artifact.id
                    ? dark
                      ? "border-blue-500 bg-blue-950/30"
                      : "border-blue-400 bg-blue-50"
                    : dark
                      ? "border-gray-800 hover:bg-gray-800"
                      : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="text-sm font-medium">{artifact.label}</div>
                <div className="mt-1 truncate text-xs text-gray-500">{artifact.sourceTitle}</div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium">{selected.label}</div>
                  <div className="text-xs text-gray-500">{selected.language}</div>
                </div>
                <button onClick={() => onCopyCode(selected.code, `artifact-${selected.id}`)} className="text-xs text-blue-500 hover:underline">
                  {copied === `artifact-${selected.id}` ? "Copied" : "Copy"}
                </button>
              </div>

              {showPreview && (
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                  <div className="mb-2 text-xs font-medium text-gray-500">Preview</div>
                  <iframe title="Artifact preview" srcDoc={selected.code} className="h-48 w-full rounded-xl border border-gray-200 bg-white dark:border-gray-700" />
                </div>
              )}

              <SyntaxHighlighter style={dark ? oneDark : oneLight} language={selected.language || "text"} PreTag="div">
                {selected.code}
              </SyntaxHighlighter>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default function Home() {
  const [message, setMessage] = useState("");
  const [composerPreview, setComposerPreview] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [customAgentManagerOpen, setCustomAgentManagerOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
    setActiveWorkspaceId,
    setActiveChatId,
    setWorkspaceMode,
    createWorkspaceAction,
    renameWorkspace,
    deleteWorkspace,
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
    auxiliaryMode,
  } = useWorkspaceState();
  const {
    authReady,
    userEmail,
    authProvider,
    linkedProviders,
    oauthLoading,
    cloudSyncStatus,
    cloudSyncMessage,
    cloudBootstrapped,
    signOut,
    signInWithProvider,
  } = useWorkspaceSync({ loaded, state, setState, stateRef });
  const {
    listening,
    speechError,
    toggleSpeechInput,
  } = useSpeechInput({
    languageLock: activeWorkspace.settings.languageLock,
    message,
    onMessageChange: setMessage,
    inputRef,
  });
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

  const googleLinked = linkedProviders.includes("google");
  const bg = state.dark ? "bg-slate-950 text-slate-100" : "bg-gradient-to-br from-blue-50 via-white to-purple-50 text-slate-900";
  const cardBg = state.dark ? "bg-slate-900 border-slate-800" : "bg-white/95 border-slate-200 shadow-sm shadow-slate-200/70";
  const inputBg = state.dark ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const codeBg = state.dark ? "bg-slate-950" : "bg-slate-100";

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
    setOpenReasoning(new Set());
  }, [activeChat.id]);

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

  const copyCode = useCallback((code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
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

  const speak = useCallback(async (text: string, id: string) => {
    if (speaking !== null) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setSpeaking(null);
      return;
    }

    const clean = stripMarkdown(text);
    if (!clean) return;

    setSpeaking(id);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean.slice(0, 2000) }),
      });
      if (!response.ok) throw new Error(`TTS ${response.status}`);
      const data = await response.json();
      if (!data.audioContent) throw new Error("No audio");

      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setSpeaking(null);
        audioRef.current = null;
      };
      await audio.play();
    } catch (error) {
      console.error("TTS failed:", error);
      setSpeaking(null);
    }
  }, [speaking]);

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

  const stageImportedFile = useCallback((nextFile: File, prompt: string) => {
    handleFile(nextFile);
    setMessage(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [handleFile]);

  const applyPromptTemplate = useCallback((templateId: string) => {
    const template = activeWorkspace.settings.promptTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setWorkspaceMode(template.mode);
    setSidebarTab("chat");
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
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className={`fixed inset-0 z-30 bg-black/50 transition-opacity xl:hidden ${sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
          />

          <aside className={`fixed inset-y-3 left-3 z-40 w-[min(16rem,calc(100vw-1.5rem))] min-h-0 overflow-hidden rounded-[26px] border transition-transform duration-200 xl:static xl:w-[250px] xl:translate-x-0 ${cardBg} ${sidebarOpen ? "translate-x-0" : "-translate-x-[115%] xl:translate-x-0"}`}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                <button
                  onClick={() => {
                    createChatAction();
                    setSidebarOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </button>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={chatSearch}
                    onChange={(event) => setChatSearch(event.target.value)}
                    placeholder="Szukaj rozmow lub tagow..."
                    className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm ${inputBg}`}
                  />
                </div>
              </div>

              <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {activeWorkspace.name}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
                {filteredChats.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-slate-400">Brak rozmow do pokazania.</div>
                ) : (
                  <div className="space-y-1">
                    {filteredChats.map((chat) => {
                      const latest = chat.messages[chat.messages.length - 1];
                      return (
                        <button
                          key={chat.id}
                          onClick={() => {
                            setActiveChatId(activeWorkspace.id, chat.id);
                            setSidebarTab("chat");
                            setSidebarOpen(false);
                          }}
                          className={`group w-full rounded-2xl px-3 py-3 text-left transition-colors ${
                            chat.id === activeChat.id
                              ? state.dark
                                ? "bg-slate-800 text-white"
                                : "bg-blue-50 text-slate-900"
                              : state.dark
                                ? "text-slate-300 hover:bg-slate-800/80"
                                : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{chat.title}</div>
                              <div className="mt-1 text-xs text-slate-400">{chat.messages.length} wiad.</div>
                              {latest?.user ? <div className="mt-2 truncate text-xs text-slate-400">{stripMarkdown(latest.user)}</div> : null}
                            </div>
                            <div className="hidden gap-2 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
                              <span
                                onClick={(event) => {
                                  event.stopPropagation();
                                  renameChat(chat.id);
                                }}
                                className="text-[11px] text-slate-400 hover:text-blue-500"
                              >
                                Rename
                              </span>
                              <span
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteChat(chat.id);
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

          <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border ${cardBg}`}>
            <section className="flex h-full min-h-0 min-w-0 flex-col">
              <ChatHeader
                dark={state.dark}
                inputBg={inputBg}
                sidebarTab={sidebarTab}
                assistantIcon={assistantIcon}
                assistantName={assistantName}
                activeChatTitle={activeChat.title}
                activeAgentId={activeAgentId}
                builtInAgents={BUILT_IN_AGENTS}
                customAgents={activeWorkspace.settings.customAgents}
                toolbarTabs={TOOLBAR_TABS}
                onOpenSidebar={() => setSidebarOpen(true)}
                onSelectAgent={selectActiveAgent}
                onOpenAgentManager={() => setCustomAgentManagerOpen(true)}
                onSelectTab={setSidebarTab}
                onOpenSessions={() => setSessionsOpen(true)}
                onOpenAiTools={() => setAiToolsOpen(true)}
                onOpenShare={() => setShareDialogOpen(true)}
                onOpenPrompts={() => setPromptManagerOpen(true)}
                onCreateChat={createChatAction}
              />

              <div className={`min-h-0 flex-1 px-3 py-4 ${state.dark ? "bg-slate-950" : "bg-[#f7f8fd]"}`}>
                {sidebarTab === "chat" ? (
                  <div className="mx-auto flex h-full max-w-5xl flex-col">
                    {!googleLinked && authReady ? (
                      <div className={`mb-4 rounded-2xl border px-4 py-4 ${state.dark ? "border-blue-900 bg-blue-950/20" : "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50"}`}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Enhanced Google Integration Available</h2>
                            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                              Enable backend functions to unlock full Google integration: AI can create calendar events, send emails via Gmail, and sync tasks automatically with Google Calendar and Tasks.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-600 dark:text-emerald-300">
                              <span className={`rounded-full px-2 py-1 ${state.dark ? "bg-emerald-950/40" : "bg-emerald-50"}`}>Calendar sync</span>
                              <span className={`rounded-full px-2 py-1 ${state.dark ? "bg-emerald-950/40" : "bg-emerald-50"}`}>Gmail compose</span>
                              <span className={`rounded-full px-2 py-1 ${state.dark ? "bg-emerald-950/40" : "bg-emerald-50"}`}>Tasks integration</span>
                            </div>
                          </div>
                          <button
                            onClick={() => void signInWithProvider("google")}
                            disabled={oauthLoading === "google"}
                            className={`rounded-xl border px-4 py-2 text-sm font-medium ${state.dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
                          >
                            {oauthLoading === "google" ? "Connecting..." : "Enable"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="min-h-0 flex-1">
                      <ChatList
                        chat={activeChat.messages}
                        loading={loading}
                        dark={state.dark}
                        cardBg={cardBg}
                        codeBg={codeBg}
                        copied={copied}
                        speaking={speaking}
                        chatEndRef={chatEndRef}
                        onSpeak={speak}
                        onCopyCode={copyCode}
                        openReasoning={openReasoning}
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
                  </div>
                ) : sidebarTab === "workspace" ? (
                  <div className="mx-auto h-full max-w-5xl overflow-y-auto pr-1">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]">
                      <div className="space-y-4">
                        <section className={`rounded-3xl border p-4 ${cardBg}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <h2 className="text-sm font-semibold">Workspaces</h2>
                              <p className="mt-1 text-xs text-slate-500">Switch the active workspace or create a new one.</p>
                            </div>
                            <button onClick={createWorkspaceAction} className="text-xs text-blue-500 hover:underline">New</button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {state.workspaces.map((workspace) => (
                              <button
                                key={workspace.id}
                                onClick={() => setActiveWorkspaceId(workspace.id)}
                                className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                                  workspace.id === activeWorkspace.id
                                    ? state.dark
                                      ? "border-blue-800 bg-blue-950/30"
                                      : "border-blue-200 bg-blue-50"
                                    : state.dark
                                      ? "border-slate-800 hover:bg-slate-800"
                                      : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{workspace.name}</div>
                                    <div className="mt-1 text-xs text-slate-500">{workspace.chats.length} chats</div>
                                  </div>
                                  <div className="flex gap-2 text-[11px] text-slate-400">
                                    <span onClick={(event) => { event.stopPropagation(); renameWorkspace(workspace.id); }} className="hover:text-blue-500">Rename</span>
                                    <span onClick={(event) => { event.stopPropagation(); deleteWorkspace(workspace.id); }} className="hover:text-red-500">Delete</span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>

                        <section className={`rounded-3xl border p-4 ${cardBg}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h2 className="text-sm font-semibold">Quick prompts</h2>
                              <p className="mt-1 text-xs text-slate-500">Drop a shortcut into the composer.</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium text-white ${MODE_COLORS[mode]}`}>{MODE_LABELS[mode]}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {QUICK_CHIPS.map((chip) => (
                              <button
                                key={chip.label}
                                onClick={() => {
                                  if (chip.mode) setWorkspaceMode(chip.mode);
                                  setSidebarTab("chat");
                                  setComposerText(chip.text);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-xs ${state.dark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>
                        </section>
                      </div>

                      <div className="space-y-4">
                        <section className={`rounded-3xl border p-4 ${cardBg}`}>
                          <h2 className="text-sm font-semibold">Modes</h2>
                          <p className="mt-1 text-xs text-slate-500">Pick the response lane for the next message.</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {MODE_PANEL_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                onClick={() => setWorkspaceMode(option.id)}
                                className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                                  mode === option.id
                                    ? `${MODE_COLORS[option.id]} border-transparent text-white`
                                    : state.dark
                                      ? "border-slate-800 bg-slate-950/60 text-slate-100 hover:bg-slate-800"
                                      : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                                }`}
                              >
                                <div className="font-medium">{option.label}</div>
                                <div className={`mt-1 text-xs ${mode === option.id ? "text-white/80" : "text-slate-500"}`}>{option.description}</div>
                              </button>
                            ))}
                          </div>
                        </section>

                        <section className={`rounded-3xl border p-4 ${cardBg}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="text-sm font-semibold">File</h2>
                              <p className="mt-1 text-xs text-slate-500">Attach one file for analysis.</p>
                            </div>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className={`rounded-xl border px-3 py-2 text-xs font-medium ${state.dark ? "border-slate-700 text-slate-100 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                            >
                              {file ? "Replace" : "Add file"}
                            </button>
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.txt,.md,.csv,.json,.pdf,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.xml,.yml,.yaml"
                            className="hidden"
                            onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])}
                          />
                          {file ? (
                            <div className={`mt-3 flex items-center gap-3 rounded-2xl border px-3 py-3 ${state.dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                              {filePreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={filePreview} alt="preview" className="h-14 w-14 rounded-xl object-cover" />
                              ) : (
                                <div className={`flex h-14 w-14 items-center justify-center rounded-xl text-xs ${state.dark ? "bg-slate-800" : "bg-slate-100"}`}>FILE</div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{file.name}</div>
                                <div className="truncate text-xs text-slate-500">{file.type || "unknown file type"}</div>
                              </div>
                              <button
                                onClick={() => {
                                  setFile(null);
                                  setFilePreview(null);
                                  setWorkspaceMode("auto");
                                }}
                                className="text-sm text-red-500"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div className={`mt-3 rounded-2xl border border-dashed px-3 py-4 text-xs ${state.dark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                              No file selected.
                            </div>
                          )}
                        </section>

                        <section className={`rounded-3xl border p-4 ${cardBg}`}>
                          <h2 className="text-sm font-semibold">Preferences</h2>
                          <div className="mt-3 grid gap-3">
                            <div>
                              <label className="mb-1 block text-xs text-slate-500">Response style</label>
                              <select
                                value={activeWorkspace.settings.styleMode}
                                onChange={(event) => setStyleMode(event.target.value as StyleMode)}
                                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
                              >
                                <option value="concise">Concise</option>
                                <option value="detailed">Detailed</option>
                                <option value="step-by-step">Step by step</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-500">Reply language</label>
                              <select
                                value={activeWorkspace.settings.languageLock}
                                onChange={(event) => setLanguageLock(event.target.value)}
                                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
                              >
                                {TEXT_LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                              </select>
                            </div>
                            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                              <span>Use conversation memory</span>
                              <input
                                type="checkbox"
                                checked={activeWorkspace.settings.memoryEnabled}
                                onChange={(event) => setMemoryEnabled(event.target.checked)}
                              />
                            </label>
                            <textarea
                              value={activeWorkspace.settings.memoryNotes}
                              onChange={(event) => setMemoryNotes(event.target.value)}
                              placeholder="Pinned memory for this workspace"
                              rows={3}
                              className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${inputBg}`}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button onClick={clearMemoryNotes} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                                Clear pinned memory
                              </button>
                              <button onClick={clearActiveChat} className="rounded-xl border border-red-300 px-3 py-2 text-xs text-red-500 dark:border-red-900">
                                Clear active chat
                              </button>
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                ) : sidebarTab === "integrations" ? (
                  <div className="mx-auto h-full max-w-5xl overflow-y-auto pr-1">
                    <IntegrationsPanel
                      dark={state.dark}
                      linkedProviders={linkedProviders}
                      authProvider={authProvider}
                      oauthLoading={oauthLoading}
                      copied={copied}
                      hasArtifacts={artifacts.length > 0}
                      onConnectProvider={(provider) => void signInWithProvider(provider)}
                      onImportFile={stageImportedFile}
                      onCopyVsCodePrompt={() => void copyVsCodePrompt()}
                      onDownloadVsCodeBundle={downloadVsCodeBundle}
                    />
                  </div>
                ) : sidebarTab === "artifacts" ? (
                  <div className="mx-auto h-full max-w-5xl overflow-y-auto">
                    <ArtifactPanel artifacts={artifacts} dark={state.dark} copied={copied} onCopyCode={copyCode} />
                  </div>
                ) : (
                  <div className="mx-auto h-full max-w-4xl overflow-y-auto pr-1">
                    <div className="space-y-4">
                      <section className={`rounded-3xl border p-4 ${cardBg}`}>
                        <div>
                          <h2 className="text-sm font-semibold">Chat actions</h2>
                          <p className="mt-1 text-xs text-slate-500">Share or export the active chat without cluttering the main view.</p>
                        </div>
                        <div className="mt-4 grid gap-2">
                          <button onClick={copyShareLink} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm dark:border-slate-700">{copied === "share-link" ? "Link copied" : "Share chat link"}</button>
                          <button onClick={exportMarkdown} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm dark:border-slate-700">Export Markdown</button>
                          <button onClick={exportJson} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm dark:border-slate-700">Export JSON</button>
                          <button onClick={() => void signOut()} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm dark:border-slate-700">Sign out</button>
                        </div>
                      </section>

                      <RoadmapPanel
                        dark={state.dark}
                        userEmail={userEmail}
                        cloudSyncStatus={cloudSyncStatus}
                        cloudSyncMessage={cloudSyncMessage}
                      />
                    </div>
                  </div>
                )}
              </div>

              {sidebarTab === "chat" ? (
                <ChatComposer
                  dark={state.dark}
                  message={message}
                  file={file}
                  listening={listening}
                  speechError={speechError}
                  queuedMessages={queuedMessages}
                  loading={loading}
                  composerPreview={composerPreview}
                  mode={mode}
                  auxiliaryMode={auxiliaryMode as Mode | "auto"}
                  fileInputRef={fileInputRef}
                  inputRef={inputRef}
                  onMessageChange={setMessage}
                  onRemoveFile={() => {
                    setFile(null);
                    setFilePreview(null);
                    setWorkspaceMode("auto");
                  }}
                  onToggleSpeechInput={toggleSpeechInput}
                  onSelectMode={setWorkspaceMode}
                  onTogglePreview={() => setComposerPreview((prev) => !prev)}
                  onStopGeneration={stopCurrentGeneration}
                  onQueueMessage={queueComposerMessage}
                  onRemoveQueuedMessage={removeQueuedMessage}
                />
              ) : null}
            </section>
          </main>
        </div>
      </div>

      <ChatSessionsPanel
        open={sessionsOpen}
        dark={state.dark}
        workspaceName={activeWorkspace.name}
        searchValue={chatSearch}
        sessions={sessionItems}
        onSearchChange={setChatSearch}
        onCreateSession={() => {
          createChatAction();
          setSessionsOpen(false);
        }}
        onSelectSession={(chatId) => {
          setActiveChatId(activeWorkspace.id, chatId);
          setSidebarTab("chat");
          setSessionsOpen(false);
        }}
        onRenameSession={renameChat}
        onDeleteSession={deleteChat}
        onClose={() => setSessionsOpen(false)}
      />

      <AIToolsPanel
        open={aiToolsOpen}
        dark={state.dark}
        mode={mode}
        modeOptions={MODE_PANEL_OPTIONS}
        quickChips={QUICK_CHIPS}
        settings={activeWorkspace.settings}
        languageOptions={TEXT_LANGUAGE_OPTIONS}
        onClose={() => setAiToolsOpen(false)}
        onModeChange={(nextMode) => setWorkspaceMode(nextMode as Mode)}
        onQuickChip={(chip) => {
          if (chip.mode) setWorkspaceMode(chip.mode as Mode);
          setSidebarTab("chat");
          setComposerText(chip.text);
          setAiToolsOpen(false);
        }}
        onStyleChange={(value) => setStyleMode(value as StyleMode)}
        onLanguageChange={setLanguageLock}
        onMemoryToggle={setMemoryEnabled}
        onMemoryNotesChange={setMemoryNotes}
        onClearMemory={clearMemoryNotes}
        onClearChat={clearActiveChat}
      />

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
    </>
  );
}