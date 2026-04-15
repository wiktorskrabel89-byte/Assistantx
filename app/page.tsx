"use client";

import { Braces, CalendarDays, ClipboardCheck, Code2, Eye, ImageIcon, Mail, Menu, MessageSquareText, Paperclip, PlugZap, Plus, Search, Send, SlidersHorizontal, UserRound, X, type LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { createClient as createSupabaseClient } from "@/lib/client";
import { getLinkedProviders, getOAuthQueryParams, getOAuthScopes, getProviderLabel, isOAuthProvider, type OAuthProvider } from "@/lib/integrations";
import {
  clearPendingOAuthProvider,
  formatOAuthErrorMessage,
  getOAuthInterruptedMessage,
  getPendingOAuthProvider,
  rememberPendingOAuthProvider,
} from "@/lib/oauth-client";
import { IntegrationsPanel } from "./components/IntegrationsPanel";
import { RoadmapPanel } from "./components/RoadmapPanel";
import {
  CHAT_MODELS,
  CODE_MODELS,
  SEARCH_MODELS,
  VOICE_LANGUAGE_OPTIONS,
} from "@/lib/ai-config";

type Mode = "auto" | "code" | "chat" | "search" | "image" | "upload";
type StyleMode = "concise" | "detailed" | "step-by-step";
type ResponseAction = "summarize" | "checklist" | "translate" | "commit";
type CloudSyncStatus = "checking" | "syncing" | "synced" | "error" | "local";
type SidebarTab = "chat" | "workspace" | "integrations" | "artifacts" | "account";

type ChatEntry = {
  id: string;
  user: string;
  ai: string;
  model: string | null;
  imageUrl?: string;
  filePreview?: string;
  fileName?: string;
  reasoning?: string;
  routeReason?: string;
  status?: string;
  createdAt: number;
};

type ChatThread = {
  id: string;
  title: string;
  messages: ChatEntry[];
  createdAt: number;
  updatedAt: number;
};

type WorkspaceSettings = {
  memoryEnabled: boolean;
  memoryNotes: string;
  styleMode: StyleMode;
  languageLock: string;
};

type Workspace = {
  id: string;
  name: string;
  chats: ChatThread[];
  activeChatId: string;
  settings: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
};

type StoredState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  dark: boolean;
};

type Artifact = {
  id: string;
  language: string;
  code: string;
  label: string;
  sourceTitle: string;
};

type QueuedMessage = {
  id: string;
  workspaceId: string;
  chatId: string;
  text: string;
  mode: Mode;
  file: File | null;
  filePreview: string | null;
  createdAt: number;
};

type SharePayload = {
  title: string;
  messages: Array<{
    user: string;
    ai: string;
    model: string | null;
    imageUrl?: string;
    fileName?: string;
    reasoning?: string;
    routeReason?: string;
  }>;
};

type CloudSyncErrorPayload = {
  code?: string;
  error?: string;
  hint?: string;
};

type ChatListProps = {
  chat: ChatEntry[];
  loading: boolean;
  dark: boolean;
  cardBg: string;
  codeBg: string;
  copied: string | null;
  speaking: string | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
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

const STORAGE_KEY = "moje-ai.workspace-state.v3";
const NEW_CHAT_TITLE = "New chat";
const TEXT_LANGUAGE_OPTIONS = [
  { code: "auto", label: "Auto detect" },
  ...VOICE_LANGUAGE_OPTIONS.filter((option) => option.code !== "auto"),
];
const QUICK_CHIPS: Array<{ label: string; text: string; mode?: Mode }> = [
  { label: "Explain code", text: "Explain this code: ", mode: "code" },
  { label: "Fix bug", text: "Help me fix this bug: ", mode: "code" },
  { label: "Web search", text: "Search the web for the latest info about: ", mode: "search" },
  { label: "Generate tests", text: "Generate tests for: ", mode: "code" },
  { label: "Plan steps", text: "Break this into clear implementation steps: ", mode: "chat" },
];
type AutoRoutedMode = Exclude<Mode, "image" | "upload">;

const MODE_PANEL_OPTIONS: Array<{ id: Mode; label: string; description: string }> = [
  { id: "auto", label: "Auto", description: "Let the router pick the best lane for the prompt." },
  { id: "chat", label: "Chat", description: "Bias toward general conversation and writing." },
  { id: "code", label: "Code", description: "Bias toward coding, debugging, and reviews." },
  { id: "search", label: "Search", description: "Bias toward web-aware research answers." },
  { id: "image", label: "Image", description: "Generate an image from a prompt." },
];

const AUTO_ROUTER_ALLOWED_MODELS: Record<AutoRoutedMode, string[]> = {
  auto: Array.from(new Set([...CHAT_MODELS, ...CODE_MODELS].map((model) => model.id))),
  chat: CHAT_MODELS.map((model) => model.id),
  code: CODE_MODELS.map((model) => model.id),
  search: SEARCH_MODELS.map((model) => model.id),
};

function getAllowedModels(mode: Mode) {
  switch (mode) {
    case "auto":
    case "chat":
    case "code":
    case "search":
      return AUTO_ROUTER_ALLOWED_MODELS[mode];
    default:
      return undefined;
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessage(overrides: Partial<ChatEntry>): ChatEntry {
  return {
    id: createId(),
    user: "",
    ai: "",
    model: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function createSettings(): WorkspaceSettings {
  return {
    memoryEnabled: true,
    memoryNotes: "",
    styleMode: "concise",
    languageLock: "auto",
  };
}

function createChat(title = NEW_CHAT_TITLE): ChatThread {
  const now = Date.now();
  return {
    id: createId(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createWorkspace(name = "Personal"): Workspace {
  const chat = createChat();
  const now = Date.now();
  return {
    id: createId(),
    name,
    chats: [chat],
    activeChatId: chat.id,
    settings: createSettings(),
    createdAt: now,
    updatedAt: now,
  };
}

function createDefaultState(): StoredState {
  const workspace = createWorkspace();
  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    dark: false,
  };
}

function readCloudSyncError(data: unknown): CloudSyncErrorPayload {
  if (!data || typeof data !== "object") return {};
  const candidate = data as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
    hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
  };
}

function formatCloudSyncError(status: number, data: unknown, fallbackMessage: string) {
  const payload = readCloudSyncError(data);

  if (status === 401 || payload.code === "unauthorized") {
    return {
      status: "local" as const,
      message: "No active session. Workspace changes stay local.",
    };
  }

  return {
    status: "error" as const,
    message: payload.hint ? `${payload.error ?? fallbackMessage} ${payload.hint}` : (payload.error ?? fallbackMessage),
  };
}

function deriveTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return NEW_CHAT_TITLE;
  return cleaned.length > 36 ? `${cleaned.slice(0, 36)}...` : cleaned;
}

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .trim();
}

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function extractArtifacts(messages: ChatEntry[]): Artifact[] {
  const artifacts: Artifact[] = [];
  const blockRegex = /```([\w.+-]*)\n?([\s\S]*?)```/g;

  for (const message of messages) {
    if (!message.ai) continue;
    let match: RegExpExecArray | null;
    let index = 1;
    while ((match = blockRegex.exec(message.ai)) !== null) {
      const language = match[1] || "text";
      const code = match[2].replace(/\n$/, "");
      if (!code.trim()) continue;
      artifacts.push({
        id: `${message.id}-${index}`,
        language,
        code,
        label: `${language.toUpperCase()} ${index}`,
        sourceTitle: message.user || "AI response",
      });
      index += 1;
    }
  }

  return artifacts;
}

function sanitizeForStorage(state: StoredState): StoredState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) => ({
      ...workspace,
      chats: workspace.chats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) => ({
          ...message,
          filePreview: undefined,
        })),
      })),
    })),
  };
}

function upgradeState(value: StoredState | null): StoredState | null {
  if (!value || !Array.isArray(value.workspaces) || value.workspaces.length === 0) return null;

  const workspaces = value.workspaces.map((workspace) => {
    const chats = Array.isArray(workspace.chats) && workspace.chats.length > 0
      ? workspace.chats.map((chat) => ({
          ...chat,
          title: chat.title || NEW_CHAT_TITLE,
          messages: Array.isArray(chat.messages)
            ? chat.messages.map((message) => ({
                ...message,
                id: message.id || createId(),
                createdAt: message.createdAt || Date.now(),
              }))
            : [],
          updatedAt: chat.updatedAt || Date.now(),
          createdAt: chat.createdAt || Date.now(),
        }))
      : [createChat()];

    const activeChatId = chats.some((chat) => chat.id === workspace.activeChatId)
      ? workspace.activeChatId
      : chats[0].id;

    const settings = {
      ...createSettings(),
      ...workspace.settings,
    };

    return {
      ...workspace,
      chats,
      activeChatId,
      settings,
      updatedAt: workspace.updatedAt || Date.now(),
      createdAt: workspace.createdAt || Date.now(),
    };
  });

  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === value.activeWorkspaceId)
    ? value.activeWorkspaceId
    : workspaces[0].id;

  return {
    workspaces,
    activeWorkspaceId,
    dark: Boolean(value.dark),
  };
}

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
                <img src={entry.filePreview} alt="file" className="h-24 rounded-xl mb-1 ml-auto block" />
              )}
              {entry.fileName && !entry.filePreview && (
                <div className={`mb-1 text-xs inline-flex ml-auto px-2 py-1 rounded-full border ${dark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>
                  {entry.fileName}
                </div>
              )}
              <div className="bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap break-words">
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
                <div className={`mb-1 text-xs rounded-xl px-3 py-2 border ${dark ? "bg-purple-950/30 border-purple-800/30 text-purple-300" : "bg-purple-50 border-purple-200 text-purple-700"}`}>
                  <button onClick={() => onToggleReasoning(entry.id)} className="w-full text-left flex items-center gap-2 font-medium">
                    <span>Reasoning</span>
                    {loading && index === chat.length - 1
                      ? <span className="animate-pulse ml-auto">...</span>
                      : <span className="ml-auto">{openReasoning.has(entry.id) ? "-" : "+"}</span>}
                  </button>
                  {(openReasoning.has(entry.id) || (loading && index === chat.length - 1)) && (
                    <div className="mt-2 whitespace-pre-wrap max-h-40 overflow-y-auto opacity-80 leading-relaxed">
                      {entry.reasoning}
                    </div>
                  )}
                </div>
              )}

              {entry.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.imageUrl} alt={entry.user} className="rounded-xl max-w-full border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className={`${cardBg} border px-4 py-3 rounded-2xl rounded-tl-sm text-sm`}>
                  {!entry.ai && index === chat.length - 1 && loading ? (
                    <div className="space-y-2">
                      <span className="flex items-center gap-2 text-gray-400 text-xs py-1">
                        <span className="inline-block h-2 w-20 rounded-full bg-gradient-to-r from-cyan-400/40 via-blue-400/80 to-cyan-400/40 bg-[length:200%_100%] animate-[pulse_1.2s_ease-in-out_infinite]" />
                        <span>{entry.status ?? "Thinking..."}</span>
                      </span>
                      {entry.routeReason && <div className="text-[11px] text-gray-400">{entry.routeReason}</div>}
                    </div>
                  ) : index === chat.length - 1 && loading ? (
                    <div>
                      {entry.status && <div className="text-[11px] opacity-70 mb-1">{entry.status}</div>}
                      <span className="whitespace-pre-wrap leading-relaxed break-words">{entry.ai}</span>
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
                                  <button onClick={() => onCopyCode(codeStr, blockId)} className="hover:text-white transition-colors">
                                    {copied === blockId ? "Copied" : "Copy"}
                                  </button>
                                </div>
                                <SyntaxHighlighter style={dark ? oneDark : oneLight} language={match?.[1] ?? "text"} PreTag="div">
                                  {codeStr}
                                </SyntaxHighlighter>
                              </div>
                            );
                          }
                          return <code className={`${codeBg} px-1 rounded text-xs`} {...props}>{children}</code>;
                        },
                        p({ children }) { return <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>; },
                        ul({ children }) { return <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>; },
                        ol({ children }) { return <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>; },
                        blockquote({ children }) { return <blockquote className={`border-l-4 border-gray-400 pl-3 italic my-2 ${dark ? "text-gray-400" : "text-gray-600"}`}>{children}</blockquote>; },
                        h1({ children }) { return <h1 className="text-xl font-bold mb-2">{children}</h1>; },
                        h2({ children }) { return <h2 className="text-lg font-bold mb-2">{children}</h2>; },
                        h3({ children }) { return <h3 className="text-base font-bold mb-1">{children}</h3>; },
                      }}
                    >
                      {entry.ai}
                    </ReactMarkdown>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 ml-1 text-xs text-gray-400">
                {entry.routeReason && <span>{entry.routeReason}</span>}
                {entry.ai && !entry.imageUrl && (
                  <>
                    <button
                      onClick={() => onSpeak(entry.ai, entry.id)}
                      disabled={speaking !== null && speaking !== entry.id}
                      className={`${speaking === entry.id ? "text-blue-400 animate-pulse" : "hover:text-blue-400"}`}
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
    <div className={`h-full rounded-3xl border flex flex-col overflow-hidden ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="font-semibold text-sm">Artifacts</h2>
        <p className="text-xs text-gray-500 mt-1">Code blocks from the active chat appear here.</p>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-sm text-gray-400 px-6">
          No code artifacts yet. Ask for HTML, React, SQL, Python, or any other code block.
        </div>
      ) : (
        <>
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 space-y-2 max-h-48 overflow-y-auto">
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
                <div className="text-xs text-gray-500 truncate mt-1">{artifact.sourceTitle}</div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                <div>
                  <div className="text-sm font-medium">{selected.label}</div>
                  <div className="text-xs text-gray-500">{selected.language}</div>
                </div>
                <button onClick={() => onCopyCode(selected.code, `artifact-${selected.id}`)} className="text-xs text-blue-500 hover:underline">
                  {copied === `artifact-${selected.id}` ? "Copied" : "Copy"}
                </button>
              </div>

              {showPreview && (
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                  <div className="text-xs font-medium text-gray-500 mb-2">Preview</div>
                  <iframe title="Artifact preview" srcDoc={selected.code} className="w-full h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white" />
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
  const [state, setState] = useState<StoredState>(createDefaultState());
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [chatSearch, setChatSearch] = useState("");
  const [composerPreview, setComposerPreview] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<OAuthProvider | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<OAuthProvider[]>([]);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>("checking");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("Checking session...");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudBootstrapped, setCloudBootstrapped] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const importedShareRef = useRef(false);
  const isMountedRef = useRef(true);
  const processingQueueRef = useRef(false);
  const queuedMessagesRef = useRef<QueuedMessage[]>([]);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseClient> | null>(null);
  const stateRef = useRef(state);
  const lastSyncedPayloadRef = useRef<string | null>(null);

  const activeWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
    [state]
  );

  const activeChat = useMemo(
    () => activeWorkspace.chats.find((chat) => chat.id === activeWorkspace.activeChatId) ?? activeWorkspace.chats[0],
    [activeWorkspace]
  );

  const artifacts = useMemo(() => extractArtifacts(activeChat.messages), [activeChat.messages]);
  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return activeWorkspace.chats;

    return activeWorkspace.chats.filter((chat) => {
      const latest = chat.messages[chat.messages.length - 1];
      const haystack = `${chat.title} ${latest?.user ?? ""} ${latest?.ai ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeWorkspace.chats, chatSearch]);

  const assistantMode = mode === "chat" ? "chat" : "code";
  const assistantName = assistantMode === "chat" ? "AI Chat" : "Code Assistant";
  const assistantDescription = assistantMode === "chat"
    ? "Friendly AI assistant for general conversation, questions, advice, creative writing, and anything else you want to talk about."
    : "Expert in AutoHotkey, Python, JavaScript, and all programming languages. Provides complete code solutions with best practices.";
  const assistantIcon = assistantMode === "chat" ? MessageSquareText : Code2;
  const auxiliaryMode = mode === "search" || mode === "image" || mode === "upload" ? mode : "auto";
  const googleLinked = linkedProviders.includes("google");

  const bg = state.dark ? "bg-slate-950 text-slate-100" : "bg-gradient-to-br from-blue-50 via-white to-purple-50 text-slate-900";
  const cardBg = state.dark ? "bg-slate-900 border-slate-800" : "bg-white/95 border-slate-200 shadow-sm shadow-slate-200/70";
  const inputBg = state.dark ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const codeBg = state.dark ? "bg-slate-950" : "bg-slate-100";

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    async function loadState() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = upgradeState(JSON.parse(raw) as StoredState);
          if (!cancelled && parsed) {
            setState(parsed);
            setLoaded(true);
            return;
          }
        } catch {
          // Ignore invalid local data and fall back to legacy history import.
        }
      }

      try {
        const response = await fetch("/api/history");
        const data = await response.json();
        if (!cancelled && Array.isArray(data.messages) && data.messages.length > 0) {
          const nextState = createDefaultState();
          nextState.workspaces[0].chats[0].title = "Imported chat";
          nextState.workspaces[0].chats[0].messages = data.messages.map((item: { user_message: string; ai_message: string; model: string; image_url?: string }) => createMessage({
            user: item.user_message,
            ai: item.ai_message,
            model: item.model,
            imageUrl: item.image_url ?? undefined,
          }));
          setState(nextState);
        }
      } catch {
        // Ignore missing history and keep the local default workspace.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(state)));
  }, [loaded, state]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createSupabaseClient();
    supabaseRef.current = supabase;
    let active = true;

    const applySession = (email: string | null, provider: OAuthProvider | null, identities: OAuthProvider[]) => {
      if (!active) return;
      clearPendingOAuthProvider();
      setUserEmail(email);
      setAuthProvider(provider);
      setLinkedProviders(identities);
      setOauthLoading(null);
      setAuthReady(true);

      if (email) {
        setCloudSyncEnabled(true);
        setCloudBootstrapped(false);
        setCloudSyncStatus("checking");
        setCloudSyncMessage("Loading your cloud workspace...");
      } else {
        setCloudSyncEnabled(false);
        setCloudBootstrapped(true);
        setCloudSyncStatus("local");
        setCloudSyncMessage("No active session. Workspace changes stay local.");
      }
    };

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthReady(true);
        setCloudSyncEnabled(false);
        setCloudBootstrapped(true);
        setCloudSyncStatus("error");
        setCloudSyncMessage(error.message);
        return;
      }

      const providerValue = typeof data.user?.app_metadata?.provider === "string" ? data.user.app_metadata.provider : null;
      const provider: OAuthProvider | null = isOAuthProvider(providerValue) ? providerValue : null;
      applySession(data.user?.email ?? null, provider, getLinkedProviders(data.user?.identities));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const providerValue = typeof session?.user?.app_metadata?.provider === "string" ? session.user.app_metadata.provider : null;
      const provider: OAuthProvider | null = isOAuthProvider(providerValue) ? providerValue : null;
      applySession(session?.user?.email ?? null, provider, getLinkedProviders(session?.user?.identities));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.dark);
  }, [state.dark]);

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

  const recoverFromInterruptedOAuth = useCallback((provider: OAuthProvider) => {
    clearPendingOAuthProvider();
    setOauthLoading(null);

    if (userEmail) {
      setCloudSyncStatus(cloudSyncEnabled && cloudBootstrapped ? "synced" : "checking");
      setCloudSyncMessage(`${getProviderLabel(provider)} sign-in was interrupted. Your current session is still active, so you can try again.`);
      return;
    }

    setCloudSyncStatus("local");
    setCloudSyncMessage(getOAuthInterruptedMessage(provider));
  }, [cloudBootstrapped, cloudSyncEnabled, userEmail]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const restorePendingOAuth = () => {
      const pendingProvider = getPendingOAuthProvider();
      if (!pendingProvider) return;
      recoverFromInterruptedOAuth(pendingProvider);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        restorePendingOAuth();
      }
    };

    window.addEventListener("pageshow", restorePendingOAuth);
    window.addEventListener("focus", restorePendingOAuth);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", restorePendingOAuth);
      window.removeEventListener("focus", restorePendingOAuth);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recoverFromInterruptedOAuth]);

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

  const revokeQueuedPreview = useCallback((preview: string | null) => {
    if (preview?.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      queuedMessagesRef.current.forEach((queuedMessage) => revokeQueuedPreview(queuedMessage.filePreview));
    };
  }, [revokeQueuedPreview]);

  useEffect(() => {
    if (!loaded || !cloudBootstrapped || importedShareRef.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const share = url.searchParams.get("share");
    if (!share) return;

    try {
      const payload = JSON.parse(fromBase64(share)) as SharePayload;
      const importedChat: ChatThread = {
        ...createChat(payload.title || "Shared chat"),
        title: payload.title || "Shared chat",
        messages: payload.messages.map((item) => createMessage(item)),
      };

      setState((prev) => ({
        ...prev,
        workspaces: prev.workspaces.map((workspace) => (
          workspace.id !== prev.activeWorkspaceId
            ? workspace
            : {
                ...workspace,
                chats: [importedChat, ...workspace.chats],
                activeChatId: importedChat.id,
                updatedAt: Date.now(),
              }
        )),
      }));
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url.pathname);
    } catch {
      // Ignore malformed shared payloads.
    }

    importedShareRef.current = true;
  }, [cloudBootstrapped, loaded]);

  useEffect(() => {
    if (!loaded || !authReady || !userEmail || !cloudSyncEnabled) return;
    let cancelled = false;

    async function hydrateCloudState() {
      try {
        setCloudSyncStatus("checking");
        setCloudSyncMessage("Loading your cloud workspace...");

        const response = await fetch("/api/workspaces/state", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const failure = formatCloudSyncError(response.status, data, "Failed to load cloud workspace state.");
          if (failure.status === "local") {
            setCloudSyncEnabled(false);
            setCloudBootstrapped(true);
            setCloudSyncStatus("local");
            setCloudSyncMessage(failure.message);
            return;
          }
          throw new Error(failure.message);
        }

        const remoteState = upgradeState((data as { state?: StoredState | null }).state ?? null);

        if (cancelled) return;

        if (remoteState) {
          lastSyncedPayloadRef.current = JSON.stringify(sanitizeForStorage(remoteState));
          setState(remoteState);
          setCloudBootstrapped(true);
          setCloudSyncStatus("synced");
          setCloudSyncMessage("Cloud workspace loaded.");
          return;
        }

        const initialState = sanitizeForStorage(stateRef.current);
        const payload = JSON.stringify(initialState);
        const seedResponse = await fetch("/api/workspaces/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        const seedData = await seedResponse.json().catch(() => ({}));

        if (!seedResponse.ok) {
          throw new Error(formatCloudSyncError(seedResponse.status, seedData, "Failed to initialize cloud workspace state.").message);
        }

        if (cancelled) return;
        lastSyncedPayloadRef.current = payload;
        setCloudBootstrapped(true);
        setCloudSyncStatus("synced");
        setCloudSyncMessage("Cloud workspace created.");
      } catch (error) {
        if (cancelled) return;
        setCloudSyncEnabled(false);
        setCloudBootstrapped(true);
        setCloudSyncStatus("error");
        setCloudSyncMessage(error instanceof Error ? error.message : "Cloud sync setup is incomplete.");
      }
    }

    void hydrateCloudState();

    return () => {
      cancelled = true;
    };
  }, [authReady, cloudSyncEnabled, loaded, userEmail]);

  useEffect(() => {
    if (!loaded || !authReady || !userEmail || !cloudSyncEnabled || !cloudBootstrapped || typeof window === "undefined") return;

    const payload = JSON.stringify(sanitizeForStorage(state));
    if (payload === lastSyncedPayloadRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        setCloudSyncStatus("syncing");
        setCloudSyncMessage("Saving workspace changes...");

        const response = await fetch("/api/workspaces/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const failure = formatCloudSyncError(response.status, data, "Failed to save workspace changes.");
          if (failure.status === "local") {
            setCloudSyncEnabled(false);
            setCloudSyncStatus("local");
            setCloudSyncMessage(failure.message);
            return;
          }
          throw new Error(failure.message);
        }

        lastSyncedPayloadRef.current = payload;
        setCloudSyncStatus("synced");
        setCloudSyncMessage("All workspace changes synced.");
      } catch (error) {
        setCloudSyncStatus("error");
        setCloudSyncMessage(error instanceof Error ? error.message : "Failed to save workspace changes.");
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [authReady, cloudBootstrapped, cloudSyncEnabled, loaded, state, userEmail]);

  const updateWorkspace = useCallback((workspaceId: string, updater: (workspace: Workspace) => Workspace) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => (
        workspace.id === workspaceId ? { ...updater(workspace), updatedAt: Date.now() } : workspace
      )),
    }));
  }, []);

  const updateChat = useCallback((workspaceId: string, chatId: string, updater: (chat: ChatThread) => ChatThread) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        return {
          ...workspace,
          updatedAt: Date.now(),
          chats: workspace.chats.map((chat) => (
            chat.id === chatId ? { ...updater(chat), updatedAt: Date.now() } : chat
          )),
        };
      }),
    }));
  }, []);

  const updateLastMessage = useCallback((workspaceId: string, chatId: string, updater: (message: ChatEntry) => ChatEntry) => {
    updateChat(workspaceId, chatId, (chat) => {
      if (chat.messages.length === 0) return chat;
      const messages = [...chat.messages];
      messages[messages.length - 1] = updater(messages[messages.length - 1]);
      return { ...chat, messages };
    });
  }, [updateChat]);

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
    setMode("chat");
    setComposerText(prompts[action] + clean);
  }, [setComposerText]);

  const editUserMessage = useCallback((text: string) => {
    setComposerText(text);
  }, [setComposerText]);

  const signOut = useCallback(async () => {
    try {
      clearPendingOAuthProvider();
      setCloudSyncStatus("checking");
      setCloudSyncMessage("Signing out...");
      await fetch("/api/integrations/provider-tokens", { method: "DELETE" }).catch(() => undefined);
      const supabase = supabaseRef.current;
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign("/auth/login");
      }
    }
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const supabase = supabaseRef.current;
    if (!supabase || typeof window === "undefined") return;

    setOauthLoading(provider);
    setCloudSyncStatus("checking");
    setCloudSyncMessage(`Redirecting to ${provider === "google" ? "Google" : "GitHub"}...`);
    rememberPendingOAuthProvider(provider);

    const options = {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: getOAuthQueryParams(provider),
      scopes: getOAuthScopes(provider),
    };
    const shouldLinkIdentity = Boolean(userEmail) && !linkedProviders.includes(provider) && authProvider !== provider;
    try {
      const { error } = shouldLinkIdentity
        ? await supabase.auth.linkIdentity({ provider, options })
        : await supabase.auth.signInWithOAuth({ provider, options });

      if (!error) return;

      clearPendingOAuthProvider();
      setOauthLoading(null);
      setCloudSyncStatus("error");
      setCloudSyncMessage(formatOAuthErrorMessage(provider, error));
    } catch (error) {
      clearPendingOAuthProvider();
      setOauthLoading(null);
      setCloudSyncStatus("error");
      setCloudSyncMessage(formatOAuthErrorMessage(provider, error));
    }
  }, [authProvider, linkedProviders, userEmail]);

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
    setMode("upload");
    setSidebarOpen(false);
  }, [filePreview]);

  const stageImportedFile = useCallback((nextFile: File, prompt: string) => {
    handleFile(nextFile);
    setMessage(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [handleFile]);

  const queueComposerMessage = useCallback(() => {
    const text = message.trim();
    if (!text && !file) return;

    const queuedMessage: QueuedMessage = {
      id: createId(),
      workspaceId: activeWorkspace.id,
      chatId: activeChat.id,
      text,
      mode,
      file,
      filePreview: file?.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      createdAt: Date.now(),
    };

    setQueuedMessages((prev) => [...prev, queuedMessage]);
    setMessage("");
    setFile(null);
    setFilePreview(null);
    setComposerPreview(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [activeChat.id, activeWorkspace.id, file, message, mode]);

  const removeQueuedMessage = useCallback((queueId: string) => {
    setQueuedMessages((prev) => {
      const queuedMessage = prev.find((item) => item.id === queueId);
      if (queuedMessage) revokeQueuedPreview(queuedMessage.filePreview);
      return prev.filter((item) => item.id !== queueId);
    });
  }, [revokeQueuedPreview]);

  const consumeStream = useCallback(async (response: Response, workspaceId: string, chatId: string) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing streaming body");

    const decoder = new TextDecoder();
    let buffer = "";
    let pendingTokens = "";
    let pendingReasoning = "";
    let tokenRaf: number | null = null;
    let reasoningRaf: number | null = null;

    const flushTokens = () => {
      tokenRaf = null;
      if (!pendingTokens) return;
      const tokens = pendingTokens;
      pendingTokens = "";
      updateLastMessage(workspaceId, chatId, (message) => ({ ...message, ai: message.ai + tokens }));
    };

    const flushReasoning = () => {
      reasoningRaf = null;
      if (!pendingReasoning) return;
      const reasoning = pendingReasoning;
      pendingReasoning = "";
      updateLastMessage(workspaceId, chatId, (message) => ({
        ...message,
        reasoning: (message.reasoning ?? "") + reasoning,
      }));
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          const parsed = JSON.parse(raw) as { model?: string; token?: string; reasoning?: string; status?: string; routeReason?: string };
          if (parsed.model || parsed.routeReason || parsed.status) {
            updateLastMessage(workspaceId, chatId, (message) => ({
              ...message,
              model: parsed.model ?? message.model,
              routeReason: parsed.routeReason ?? message.routeReason,
              status: parsed.status === "Done" ? undefined : (parsed.status ?? message.status),
            }));
          }
          if (parsed.reasoning) {
            pendingReasoning += parsed.reasoning;
            if (reasoningRaf === null) reasoningRaf = requestAnimationFrame(flushReasoning);
          }
          if (parsed.token) {
            pendingTokens += parsed.token;
            if (tokenRaf === null) tokenRaf = requestAnimationFrame(flushTokens);
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      }
    }

    if (tokenRaf !== null) cancelAnimationFrame(tokenRaf);
    if (pendingTokens) {
      updateLastMessage(workspaceId, chatId, (message) => ({ ...message, ai: message.ai + pendingTokens }));
    }
    if (reasoningRaf !== null) cancelAnimationFrame(reasoningRaf);
    if (pendingReasoning) {
      updateLastMessage(workspaceId, chatId, (message) => ({
        ...message,
        reasoning: (message.reasoning ?? "") + pendingReasoning,
      }));
    }
  }, [updateLastMessage]);

  const processQueuedMessage = useCallback(async (queuedMessage: QueuedMessage) => {
    const snapshot = stateRef.current;
    const workspace = snapshot.workspaces.find((candidate) => candidate.id === queuedMessage.workspaceId) ?? snapshot.workspaces[0];
    const chat = workspace.chats.find((candidate) => candidate.id === queuedMessage.chatId) ?? workspace.chats[0];

    const workspaceId = workspace.id;
    const chatId = chat.id;
    const userMsg = queuedMessage.text;
    const activeSettings = workspace.settings;
    const allowedModels = getAllowedModels(queuedMessage.mode);
    const history = activeSettings.memoryEnabled
      ? chat.messages.filter((entry) => entry.ai && !entry.imageUrl).map((entry) => ({ user: entry.user, ai: entry.ai }))
      : [];

    const title = chat.messages.length === 0 || chat.title === NEW_CHAT_TITLE
      ? deriveTitle(userMsg || queuedMessage.file?.name || NEW_CHAT_TITLE)
      : chat.title;

    if (queuedMessage.mode === "image") {
      const pending = createMessage({
        user: userMsg,
        ai: "",
        model: null,
        status: "Generating image...",
        routeReason: "Manual image mode",
      });
      updateChat(workspaceId, chatId, (chat) => ({
        ...chat,
        title,
        messages: [...chat.messages, pending],
      }));

      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userMsg }),
        });
        const data = await response.json();
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: data.error ?? "",
          model: data.model ?? entry.model,
          imageUrl: data.url ?? undefined,
          status: undefined,
        }));
      } catch (error) {
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: error instanceof Error ? error.message : "Image generation failed.",
          status: undefined,
        }));
      }
      return;
    }

    if (queuedMessage.mode === "upload" && queuedMessage.file) {
      const pending = createMessage({
        user: userMsg || `Analyze ${queuedMessage.file.name}`,
        ai: "",
        model: null,
        fileName: queuedMessage.file.name,
        filePreview: queuedMessage.filePreview ?? undefined,
        status: "Uploading file...",
      });
      updateChat(workspaceId, chatId, (chat) => ({
        ...chat,
        title,
        messages: [...chat.messages, pending],
      }));

      const formData = new FormData();
      formData.append("file", queuedMessage.file);
      formData.append("message", userMsg || `What is in ${queuedMessage.file.name}?`);

      try {
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        await consumeStream(response, workspaceId, chatId);
      } catch (error) {
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: error instanceof Error ? error.message : "File analysis failed.",
          status: undefined,
        }));
      }
      return;
    }

    const pending = createMessage({
      user: userMsg,
      ai: "",
      model: null,
      fileName: queuedMessage.file?.name ?? undefined,
      status: "Analyzing prompt...",
    });
    updateChat(workspaceId, chatId, (chat) => ({
      ...chat,
      title,
      messages: [...chat.messages, pending],
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          mode: queuedMessage.mode,
          allowedModels,
          history,
          memoryNotes: activeSettings.memoryNotes,
          style: activeSettings.styleMode,
          languageLock: activeSettings.languageLock,
        }),
      });

      await consumeStream(response, workspaceId, chatId);
    } catch (error) {
      updateLastMessage(workspaceId, chatId, (entry) => ({
        ...entry,
        ai: error instanceof Error ? error.message : "Message failed.",
        status: undefined,
      }));
    }
  }, [
    consumeStream,
    updateChat,
    updateLastMessage,
  ]);

  useEffect(() => {
    if (processingQueueRef.current || queuedMessages.length === 0) return;

    const queuedMessage = queuedMessages[0];
    processingQueueRef.current = true;
    setLoading(true);

    void processQueuedMessage(queuedMessage).finally(() => {
      revokeQueuedPreview(queuedMessage.filePreview);
      processingQueueRef.current = false;
      if (!isMountedRef.current) return;
      setQueuedMessages((prev) => prev.filter((item) => item.id !== queuedMessage.id));
      setLoading(false);
    });
  }, [processQueuedMessage, queuedMessages, revokeQueuedPreview]);

  const createWorkspaceAction = useCallback(() => {
    const name = window.prompt("Workspace name", `Workspace ${state.workspaces.length + 1}`)?.trim();
    if (!name) return;
    const workspace = createWorkspace(name);
    setState((prev) => ({
      ...prev,
      workspaces: [workspace, ...prev.workspaces],
      activeWorkspaceId: workspace.id,
    }));
    setSidebarOpen(false);
  }, [state.workspaces.length]);

  const renameWorkspace = useCallback((workspaceId: string) => {
    const current = state.workspaces.find((workspace) => workspace.id === workspaceId);
    const name = window.prompt("Rename workspace", current?.name ?? "")?.trim();
    if (!name) return;
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, name }));
  }, [state.workspaces, updateWorkspace]);

  const deleteWorkspace = useCallback((workspaceId: string) => {
    if (!window.confirm("Delete this workspace and all its chats?")) return;
    setState((prev) => {
      const workspaces = prev.workspaces.filter((workspace) => workspace.id !== workspaceId);
      if (workspaces.length === 0) {
        const fallback = createWorkspace();
        return { ...prev, workspaces: [fallback], activeWorkspaceId: fallback.id };
      }
      const activeWorkspaceId = prev.activeWorkspaceId === workspaceId ? workspaces[0].id : prev.activeWorkspaceId;
      return { ...prev, workspaces, activeWorkspaceId };
    });
  }, []);

  const createChatAction = useCallback(() => {
    const chat = createChat();
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      chats: [chat, ...workspace.chats],
      activeChatId: chat.id,
    }));
    setSidebarOpen(false);
  }, [activeWorkspace.id, updateWorkspace]);

  const renameChat = useCallback((chatId: string) => {
    const current = activeWorkspace.chats.find((chat) => chat.id === chatId);
    const title = window.prompt("Rename chat", current?.title ?? "")?.trim();
    if (!title) return;
    updateChat(activeWorkspace.id, chatId, (chat) => ({ ...chat, title }));
  }, [activeWorkspace.chats, activeWorkspace.id, updateChat]);

  const deleteChat = useCallback((chatId: string) => {
    if (!window.confirm("Delete this chat?")) return;
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => {
        if (workspace.id !== prev.activeWorkspaceId) return workspace;
        const chats = workspace.chats.filter((chat) => chat.id !== chatId);
        if (chats.length === 0) {
          const fallbackChat = createChat();
          return {
            ...workspace,
            chats: [fallbackChat],
            activeChatId: fallbackChat.id,
            updatedAt: Date.now(),
          };
        }
        return {
          ...workspace,
          chats,
          activeChatId: workspace.activeChatId === chatId ? chats[0].id : workspace.activeChatId,
          updatedAt: Date.now(),
        };
      }),
    }));
  }, []);

  const clearActiveChat = useCallback(() => {
    if (!window.confirm("Clear all messages in the active chat?")) return;
    updateChat(activeWorkspace.id, activeChat.id, (chat) => ({ ...chat, title: NEW_CHAT_TITLE, messages: [] }));
  }, [activeChat.id, activeWorkspace.id, updateChat]);

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
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChat.title || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeChat]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(activeChat, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChat.title || "chat"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeChat]);

  const createVsCodeBundle = useCallback(() => {
    const sections = [
      `# VS Code handoff: ${activeChat.title}`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `## Workspace`,
      `- Workspace: ${activeWorkspace.name}`,
      `- Chat: ${activeChat.title}`,
      `- Routing: Automatic model routing`,
      `- Style: ${activeWorkspace.settings.styleMode}`,
      `- Language lock: ${activeWorkspace.settings.languageLock}`,
    ];

    if (activeWorkspace.settings.memoryNotes.trim()) {
      sections.push("", "## Pinned memory", activeWorkspace.settings.memoryNotes.trim());
    }

    sections.push("", "## Conversation");
    for (const entry of activeChat.messages) {
      sections.push("", `### User`, entry.user || "");
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

  const modeLabels: Record<Mode, string> = {
    auto: "Auto",
    code: "Code",
    chat: "Chat",
    search: "Search",
    image: "Image",
    upload: "File",
  };

  const modeColors: Record<Mode, string> = {
    auto: "bg-blue-600",
    code: "bg-violet-600",
    chat: "bg-sky-600",
    search: "bg-cyan-600",
    image: "bg-emerald-600",
    upload: "bg-orange-500",
  };

  const toolbarTabs: Array<{ id: SidebarTab; label: string; icon: LucideIcon }> = [
    { id: "chat", label: "Chat", icon: MessageSquareText },
    { id: "workspace", label: "Tools", icon: SlidersHorizontal },
    { id: "artifacts", label: "Artifacts", icon: Braces },
    { id: "integrations", label: "Apps", icon: PlugZap },
    { id: "account", label: "Account", icon: UserRound },
  ];

  return (
    <>
      <div className={`min-h-screen ${bg}`}>
        <div className="mx-auto flex min-h-screen max-w-[1680px] gap-3 px-3 py-3">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className={`fixed inset-0 z-30 bg-black/50 transition-opacity xl:hidden ${sidebarOpen ? "opacity-100 pointer-events-auto" : "pointer-events-none opacity-0"}`}
          />

          <aside className={`fixed inset-y-3 left-3 z-40 w-[min(16rem,calc(100vw-1.5rem))] min-h-0 overflow-hidden rounded-[26px] border transition-transform duration-200 xl:static xl:w-[250px] xl:translate-x-0 ${cardBg} ${sidebarOpen ? "translate-x-0" : "-translate-x-[115%] xl:translate-x-0"}`}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                <button
                  onClick={createChatAction}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </button>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
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
                            updateWorkspace(activeWorkspace.id, (workspace) => ({ ...workspace, activeChatId: chat.id }));
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
              <div className="border-b border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 xl:hidden"
                    >
                      <Menu className="h-4 w-4" />
                    </button>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-500 text-white shadow-sm">
                      {assistantMode === "chat" ? <MessageSquareText className="h-5 w-5" /> : <Code2 className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900 dark:text-white">{assistantName}</div>
                      <div className="truncate text-xs text-slate-500">{activeChat.title}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={assistantMode}
                      onChange={(e) => setMode(e.target.value === "chat" ? "chat" : "code")}
                      className={`hidden rounded-xl border px-3 py-2 text-sm md:block ${inputBg}`}
                    >
                      <option value="code">Code Assistant</option>
                      <option value="chat">AI Chat</option>
                    </select>

                    {toolbarTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setSidebarTab(tab.id)}
                          title={tab.label}
                          aria-label={tab.label}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                            sidebarTab === tab.id
                              ? state.dark
                                ? "border-blue-800 bg-blue-950/40 text-blue-200"
                                : "border-blue-200 bg-blue-50 text-blue-700"
                              : state.dark
                                ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      );
                    })}

                    <button
                      onClick={() => {
                        setSidebarTab("workspace");
                        setComposerText(QUICK_CHIPS[0]?.text ?? "");
                      }}
                      className={`hidden rounded-xl border px-3 py-2 text-sm font-medium sm:block ${state.dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
                    >
                      Prompts
                    </button>

                    <button
                      onClick={createChatAction}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border ${state.dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
                      title="New chat"
                      aria-label="New chat"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className={`flex-1 min-h-0 px-3 py-4 ${state.dark ? "bg-slate-950" : "bg-[#f7f8fd]"}`}>
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
                          if (nextMode) setMode(nextMode);
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
                                onClick={() => setState((prev) => ({ ...prev, activeWorkspaceId: workspace.id }))}
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
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium text-white ${modeColors[mode]}`}>{modeLabels[mode]}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {QUICK_CHIPS.map((chip) => (
                              <button
                                key={chip.label}
                                onClick={() => {
                                  if (chip.mode) setMode(chip.mode);
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
                                onClick={() => setMode(option.id)}
                                className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                                  mode === option.id
                                    ? `${modeColors[option.id]} border-transparent text-white`
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
                            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
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
                                  setMode("auto");
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
                                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                                  ...workspace,
                                  settings: { ...workspace.settings, styleMode: e.target.value as StyleMode },
                                }))}
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
                                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                                  ...workspace,
                                  settings: { ...workspace.settings, languageLock: e.target.value },
                                }))}
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
                                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                                  ...workspace,
                                  settings: { ...workspace.settings, memoryEnabled: e.target.checked },
                                }))}
                              />
                            </label>
                            <textarea
                              value={activeWorkspace.settings.memoryNotes}
                              onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                                ...workspace,
                                settings: { ...workspace.settings, memoryNotes: e.target.value },
                              }))}
                              placeholder="Pinned memory for this workspace"
                              rows={3}
                              className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${inputBg}`}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => updateWorkspace(activeWorkspace.id, (workspace) => ({ ...workspace, settings: { ...workspace.settings, memoryNotes: "" } }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
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
                <div className="border-t border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
                  <div className="mx-auto max-w-5xl space-y-2">
                    {file ? (
                      <div className="flex flex-wrap gap-2">
                        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${state.dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                          <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="max-w-[240px] truncate">{file.name}</span>
                          <button
                            onClick={() => {
                              setFile(null);
                              setFilePreview(null);
                              setMode("auto");
                            }}
                            className="ml-1 text-[11px] opacity-70 hover:opacity-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {queuedMessages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {queuedMessages.map((queuedMessage, index) => {
                          const isActive = loading && index === 0;
                          const queueNumber = loading ? index : index + 1;
                          const queuedLabel = queuedMessage.text || queuedMessage.file?.name || "Queued message";
                          return (
                            <div
                              key={queuedMessage.id}
                              className={`flex max-w-full items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                                isActive
                                  ? state.dark
                                    ? "border-blue-800 bg-blue-950/30 text-blue-100"
                                    : "border-blue-200 bg-blue-50 text-blue-800"
                                  : state.dark
                                    ? "border-slate-700 bg-slate-900 text-slate-200"
                                    : "border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">{isActive ? "Sending now" : `Queued ${queueNumber}`}</div>
                                <div className="truncate opacity-80">{queuedLabel}</div>
                              </div>
                              {!isActive ? (
                                <button
                                  onClick={() => removeQueuedMessage(queuedMessage.id)}
                                  className="flex h-5 w-5 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
                                  title="Remove queued message"
                                  aria-label="Remove queued message"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {composerPreview && message.trim() ? (
                      <div className={`rounded-2xl border px-4 py-3 text-sm ${state.dark ? "border-slate-800 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        <ReactMarkdown>{message}</ReactMarkdown>
                      </div>
                    ) : null}

                    <div className={`flex items-end gap-2 rounded-2xl border p-2 shadow-sm ${state.dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"}`}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${state.dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-600"}`}
                        title="Attach file"
                        aria-label="Attach file"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>

                      <div className={`hidden items-center gap-1 rounded-xl p-1 sm:flex ${state.dark ? "border border-slate-800 bg-slate-900" : "border border-slate-200 bg-slate-100"}`}>
                        <button
                          onClick={() => setMode("code")}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${assistantMode === "code" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          <span>Kod</span>
                        </button>
                        <button
                          onClick={() => setMode("chat")}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${assistantMode === "chat" ? "bg-white text-purple-700 shadow-sm dark:bg-slate-800 dark:text-purple-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
                        >
                          <MessageSquareText className="h-3.5 w-3.5" />
                          <span>Chat</span>
                        </button>
                        <select
                          value={auxiliaryMode}
                          onChange={(e) => setMode(e.target.value as Mode)}
                          className={`rounded-lg border-0 bg-transparent px-2 py-2 text-xs font-medium ${state.dark ? "text-slate-200" : "text-slate-700"}`}
                        >
                          <option value="auto">Auto</option>
                          <option value="search">Search</option>
                          <option value="image">Image</option>
                          <option value="upload">File</option>
                        </select>
                      </div>

                      <textarea
                        ref={inputRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            queueComposerMessage();
                          }
                        }}
                        placeholder="Wiadomosc... (Enter to send)"
                        rows={1}
                        className={`flex-1 resize-none border-0 bg-transparent px-3 py-3 text-sm focus:outline-none ${state.dark ? "text-slate-100 placeholder-slate-500" : "text-slate-900 placeholder-slate-400"}`}
                        style={{ minHeight: 44, maxHeight: 180 }}
                      />

                      <button
                        onClick={() => setComposerPreview((prev) => !prev)}
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${composerPreview ? (state.dark ? "border-blue-800 bg-blue-950/40 text-blue-200" : "border-blue-200 bg-blue-50 text-blue-700") : (state.dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-600")}`}
                        title="Preview message"
                        aria-label="Preview message"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      <button
                        onClick={queueComposerMessage}
                        disabled={!message.trim() && !file}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                        title={loading ? "Add to queue" : "Send message"}
                        aria-label={loading ? "Add to queue" : "Send message"}
                      >
                        {loading ? <Plus className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </>
  );
}