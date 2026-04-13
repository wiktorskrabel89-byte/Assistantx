"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { VoiceModal } from "./components/VoiceModal";
import {
  CHAT_MODELS,
  CODE_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CODE_MODEL,
  DEFAULT_SEARCH_MODEL,
  DEFAULT_VOICE_LANGUAGE,
  SEARCH_MODELS,
  VOICE_LANGUAGE_OPTIONS,
} from "@/lib/ai-config";

type Mode = "auto" | "code" | "chat" | "search" | "image" | "upload";
type StyleMode = "concise" | "detailed" | "step-by-step";
type ResponseAction = "summarize" | "checklist" | "translate" | "commit";

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
  chatModel: string;
  codeModel: string;
  searchModel: string;
  memoryEnabled: boolean;
  memoryNotes: string;
  voiceLanguage: string;
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
    chatModel: DEFAULT_CHAT_MODEL,
    codeModel: DEFAULT_CODE_MODEL,
    searchModel: DEFAULT_SEARCH_MODEL,
    memoryEnabled: true,
    memoryNotes: "",
    voiceLanguage: DEFAULT_VOICE_LANGUAGE,
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

    return {
      ...workspace,
      chats,
      activeChatId,
      settings: {
        ...createSettings(),
        ...workspace.settings,
      },
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
}: ChatListProps) {
  let codeBlockIdx = 0;

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
      {chat.length === 0 && (
        <div className="text-center text-gray-400 mt-16 text-lg">
          Start a chat, switch models, search the web, or upload a file.
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
                {entry.model && <span>{entry.model}</span>}
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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<string[]>([]);
  const importedShareRef = useRef(false);

  const activeWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
    [state]
  );

  const activeChat = useMemo(
    () => activeWorkspace.chats.find((chat) => chat.id === activeWorkspace.activeChatId) ?? activeWorkspace.chats[0],
    [activeWorkspace]
  );

  const artifacts = useMemo(() => extractArtifacts(activeChat.messages), [activeChat.messages]);

  const bg = state.dark ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-900";
  const cardBg = state.dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const inputBg = state.dark ? "bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400";
  const codeBg = state.dark ? "bg-gray-950" : "bg-gray-100";

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
    document.documentElement.classList.toggle("dark", state.dark);
  }, [state.dark]);

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
    if (!loaded || importedShareRef.current || typeof window === "undefined") return;
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
  }, [loaded]);

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
  }, [filePreview]);

  const startVoiceInput = useCallback(async () => {
    if (listening) {
      processorRef.current?.disconnect();
      processorRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setListening(false);

      const chunks = pcmChunksRef.current.splice(0);
      if (chunks.length === 0) return;

      setLoading(true);
      try {
        const response = await fetch("/api/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunks }),
        });
        const data = await response.json();
        if (data.transcript) {
          setMessage((prev) => prev + (prev ? " " : "") + data.transcript);
        }
      } catch (error) {
        console.error("STT request failed:", error);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      pcmChunksRef.current = [];

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const sampleRatio = ctx.sampleRate / 16000;
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const outLen = Math.floor(input.length / sampleRatio);
        const out = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const sample = input[Math.floor(i * sampleRatio)];
          out[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
        }
        const bytes = new Uint8Array(out.buffer);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        pcmChunksRef.current.push(btoa(bin));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setListening(true);
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "";
      const messageText = error instanceof Error ? error.message : String(error);
      if (name === "NotAllowedError") alert("Microphone permission is blocked. Allow microphone access in the browser address bar.");
      else if (name === "NotFoundError") alert("No microphone was found.");
      else alert(`Microphone error: ${messageText}`);
    }
  }, [listening]);

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

  const currentModelId = useMemo(() => {
    switch (mode) {
      case "chat":
        return activeWorkspace.settings.chatModel;
      case "code":
        return activeWorkspace.settings.codeModel;
      case "search":
        return activeWorkspace.settings.searchModel;
      default:
        return null;
    }
  }, [activeWorkspace.settings, mode]);

  const sendMessage = useCallback(async () => {
    if ((!message && !file) || loading) return;

    const workspaceId = activeWorkspace.id;
    const chatId = activeChat.id;
    const userMsg = message.trim();
    const activeSettings = activeWorkspace.settings;
    const history = activeSettings.memoryEnabled
      ? activeChat.messages.filter((entry) => entry.ai && !entry.imageUrl).map((entry) => ({ user: entry.user, ai: entry.ai }))
      : [];

    setMessage("");
    setLoading(true);

    const title = activeChat.messages.length === 0 || activeChat.title === NEW_CHAT_TITLE
      ? deriveTitle(userMsg || file?.name || NEW_CHAT_TITLE)
      : activeChat.title;

    if (mode === "image") {
      const pending = createMessage({
        user: userMsg,
        ai: "",
        model: "Pollinations.ai (Free)",
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
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "upload" && file) {
      const pending = createMessage({
        user: userMsg || `Analyze ${file.name}`,
        ai: "",
        model: null,
        fileName: file.name,
        filePreview: filePreview ?? undefined,
        status: "Uploading file...",
      });
      updateChat(workspaceId, chatId, (chat) => ({
        ...chat,
        title,
        messages: [...chat.messages, pending],
      }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("message", userMsg || `What is in ${file.name}?`);

      setFile(null);
      setFilePreview(null);

      try {
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        await consumeStream(response, workspaceId, chatId);
      } finally {
        setLoading(false);
        setMode("auto");
      }
      return;
    }

    const pending = createMessage({
      user: userMsg,
      ai: "",
      model: currentModelId,
      fileName: file?.name ?? undefined,
      status: "Analyzing prompt...",
    });
    updateChat(workspaceId, chatId, (chat) => ({
      ...chat,
      title,
      messages: [...chat.messages, pending],
    }));

    try {
      const modelId = mode === "code"
        ? activeSettings.codeModel
        : mode === "chat"
          ? activeSettings.chatModel
          : mode === "search"
            ? activeSettings.searchModel
            : undefined;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          mode,
          modelId,
          allowedModels: mode === "auto" ? [activeSettings.chatModel, activeSettings.codeModel] : undefined,
          history,
          memoryNotes: activeSettings.memoryNotes,
          style: activeSettings.styleMode,
          languageLock: activeSettings.languageLock,
        }),
      });

      await consumeStream(response, workspaceId, chatId);
    } finally {
      setLoading(false);
    }
  }, [
    activeChat.id,
    activeChat.messages,
    activeChat.title,
    activeWorkspace.id,
    activeWorkspace.settings,
    consumeStream,
    currentModelId,
    file,
    filePreview,
    loading,
    message,
    mode,
    updateChat,
    updateLastMessage,
  ]);

  const createWorkspaceAction = useCallback(() => {
    const name = window.prompt("Workspace name", `Workspace ${state.workspaces.length + 1}`)?.trim();
    if (!name) return;
    const workspace = createWorkspace(name);
    setState((prev) => ({
      ...prev,
      workspaces: [workspace, ...prev.workspaces],
      activeWorkspaceId: workspace.id,
    }));
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
      markdown.push(`\n## AI${entry.model ? ` (${entry.model})` : ""}\n${entry.ai}`);
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

  return (
    <>
      <div className={`min-h-screen ${bg}`}>
        <div className="mx-auto max-w-[1700px] px-4 py-4 h-screen grid gap-4 xl:grid-cols-[290px,minmax(0,1fr),360px] lg:grid-cols-[290px,minmax(0,1fr)] grid-cols-1">
          <aside className={`rounded-3xl border p-4 flex flex-col gap-4 min-h-0 ${cardBg}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">Moje AI</h1>
                <p className="text-xs text-gray-500 mt-1">Personal workspaces stored in this browser.</p>
              </div>
              <button onClick={() => setState((prev) => ({ ...prev, dark: !prev.dark }))} className="text-xs rounded-xl border px-3 py-2 border-gray-300 dark:border-gray-700">
                {state.dark ? "Light" : "Dark"}
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Workspaces</h2>
                <button onClick={createWorkspaceAction} className="text-xs text-blue-500 hover:underline">New</button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {state.workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => setState((prev) => ({ ...prev, activeWorkspaceId: workspace.id }))}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                      workspace.id === activeWorkspace.id
                        ? state.dark
                          ? "border-blue-500 bg-blue-950/30"
                          : "border-blue-400 bg-blue-50"
                        : state.dark
                          ? "border-gray-800 hover:bg-gray-800"
                          : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{workspace.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{workspace.chats.length} chats</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            renameWorkspace(workspace.id);
                          }}
                          className="text-xs text-gray-400 hover:text-blue-500"
                        >
                          Rename
                        </span>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteWorkspace(workspace.id);
                          }}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          Delete
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 min-h-0 flex flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Chats</h2>
                <button onClick={createChatAction} className="text-xs text-blue-500 hover:underline">New</button>
              </div>
              <div className="space-y-2 overflow-y-auto min-h-0">
                {activeWorkspace.chats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => updateWorkspace(activeWorkspace.id, (workspace) => ({ ...workspace, activeChatId: chat.id }))}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                      chat.id === activeChat.id
                        ? state.dark
                          ? "border-violet-500 bg-violet-950/30"
                          : "border-violet-400 bg-violet-50"
                        : state.dark
                          ? "border-gray-800 hover:bg-gray-800"
                          : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{chat.title}</div>
                        <div className="text-xs text-gray-500 mt-1">{chat.messages.length} messages</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            renameChat(chat.id);
                          }}
                          className="text-xs text-gray-400 hover:text-blue-500"
                        >
                          Rename
                        </span>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteChat(chat.id);
                          }}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          Delete
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3 overflow-y-auto">
              <h2 className="text-sm font-semibold">Workspace memory and models</h2>

              <label className="text-xs text-gray-500 block">Chat model</label>
              <select
                value={activeWorkspace.settings.chatModel}
                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                  ...workspace,
                  settings: { ...workspace.settings, chatModel: e.target.value },
                }))}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
              >
                {CHAT_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>

              <label className="text-xs text-gray-500 block">Code model</label>
              <select
                value={activeWorkspace.settings.codeModel}
                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                  ...workspace,
                  settings: { ...workspace.settings, codeModel: e.target.value },
                }))}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
              >
                {CODE_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>

              <label className="text-xs text-gray-500 block">Search model</label>
              <select
                value={activeWorkspace.settings.searchModel}
                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                  ...workspace,
                  settings: { ...workspace.settings, searchModel: e.target.value },
                }))}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
              >
                {SEARCH_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>

              <label className="text-xs text-gray-500 block">Response style</label>
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

              <label className="text-xs text-gray-500 block">Reply language</label>
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

              <label className="text-xs text-gray-500 block">Default voice language</label>
              <select
                value={activeWorkspace.settings.voiceLanguage}
                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                  ...workspace,
                  settings: { ...workspace.settings, voiceLanguage: e.target.value },
                }))}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
              >
                {VOICE_LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>

              <label className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm">
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

              <label className="text-xs text-gray-500 block">Pinned memory for this workspace</label>
              <textarea
                value={activeWorkspace.settings.memoryNotes}
                onChange={(e) => updateWorkspace(activeWorkspace.id, (workspace) => ({
                  ...workspace,
                  settings: { ...workspace.settings, memoryNotes: e.target.value },
                }))}
                placeholder="Facts to remember across chats in this workspace, e.g. preferred tone, project stack, user role..."
                rows={4}
                className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${inputBg}`}
              />

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => updateWorkspace(activeWorkspace.id, (workspace) => ({ ...workspace, settings: { ...workspace.settings, memoryNotes: "" } }))} className="text-xs rounded-xl border px-3 py-2 border-gray-300 dark:border-gray-700">
                  Clear pinned memory
                </button>
                <button onClick={clearActiveChat} className="text-xs rounded-xl border px-3 py-2 border-red-300 text-red-500 dark:border-red-900">
                  Clear active chat
                </button>
              </div>
            </div>
          </aside>

          <main className={`rounded-3xl border flex flex-col min-h-0 ${cardBg}`}>
            <div className="border-b border-gray-200 dark:border-gray-800 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">{activeWorkspace.name}</div>
                <div className="text-2xl font-bold mt-1">{activeChat.title}</div>
                <div className="text-sm text-gray-500 mt-2">
                  Current mode: {modeLabels[mode]}
                  {currentModelId ? ` • ${currentModelId}` : ""}
                  {` • ${activeWorkspace.settings.styleMode}`}
                  {activeWorkspace.settings.languageLock !== "auto" ? ` • ${activeWorkspace.settings.languageLock}` : ""}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <button onClick={copyShareLink} className="px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700">{copied === "share-link" ? "Link copied" : "Share"}</button>
                <button onClick={exportMarkdown} className="px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700">Export MD</button>
                <button onClick={exportJson} className="px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700">Export JSON</button>
                <button
                  onClick={() => {
                    if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app")) {
                      alert("Voice mode doesn't work on Vercel serverless. Use Northflank, Render, or local dev.");
                      return;
                    }
                    setVoiceOpen(true);
                  }}
                  className="px-3 py-2 text-sm rounded-xl border border-purple-400 text-purple-600 dark:border-purple-700 dark:text-purple-300"
                >
                  Voice mode
                </button>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
              {(["auto", "code", "chat", "search", "image"] as Mode[]).map((entryMode) => (
                <button
                  key={entryMode}
                  onClick={() => setMode(entryMode)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    mode === entryMode
                      ? `${modeColors[entryMode]} text-white border-transparent`
                      : `border-gray-300 ${state.dark ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"}`
                  }`}
                >
                  {modeLabels[entryMode]}
                </button>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  mode === "upload"
                    ? `${modeColors.upload} text-white border-transparent`
                    : `border-gray-300 ${state.dark ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"}`
                }`}
              >
                File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.txt,.md,.csv,.json,.pdf,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.xml,.yml,.yaml"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {file && (
              <div className="px-5 pt-4">
                <div className={`rounded-2xl border ${cardBg} px-3 py-3 flex items-center gap-3`}>
                  {filePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={filePreview} alt="preview" className="h-14 w-14 object-cover rounded-xl" />
                  ) : (
                    <div className={`h-14 w-14 rounded-xl flex items-center justify-center text-xs ${state.dark ? "bg-gray-800" : "bg-gray-100"}`}>
                      FILE
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-gray-500 truncate">{file.type || "unknown file type"}</div>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setFilePreview(null);
                      setMode("auto");
                    }}
                    className="ml-auto text-red-500 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 px-5 py-4">
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
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 px-5 py-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => {
                      if (chip.mode) setMode(chip.mode);
                      setComposerText(chip.text);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border ${state.dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={
                    mode === "image"
                      ? "Describe the image to generate..."
                      : mode === "upload"
                        ? "Ask about the selected file..."
                        : mode === "search"
                          ? "Search the web for something current..."
                          : "Type a message..."
                  }
                  disabled={loading}
                  rows={1}
                  className={`flex-1 resize-none rounded-2xl px-4 py-3 text-sm border ${inputBg} focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50`}
                  style={{ minHeight: 48, maxHeight: 180 }}
                />
                <button
                  onClick={() => void startVoiceInput()}
                  disabled={loading}
                  className={`p-3 rounded-2xl border transition-colors ${listening ? "bg-red-500 text-white border-red-500" : `${state.dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}`}
                  title="Voice input"
                >
                  Mic
                </button>
                <button
                  onClick={() => void sendMessage()}
                  disabled={loading || (!message.trim() && !file)}
                  className={`px-4 py-3 rounded-2xl text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${modeColors[mode]}`}
                >
                  {loading ? "Working..." : mode === "image" ? "Generate" : mode === "search" ? "Search" : "Send"}
                </button>
              </div>
            </div>
          </main>

          <aside className="hidden xl:block min-h-0">
            <ArtifactPanel artifacts={artifacts} dark={state.dark} copied={copied} onCopyCode={copyCode} />
          </aside>
        </div>
      </div>

      {voiceOpen && (
        <VoiceModal
          onClose={() => setVoiceOpen(false)}
          dark={state.dark}
          language={activeWorkspace.settings.voiceLanguage}
          onLanguageChange={(language) => updateWorkspace(activeWorkspace.id, (workspace) => ({
            ...workspace,
            settings: { ...workspace.settings, voiceLanguage: language },
          }))}
        />
      )}
    </>
  );
}