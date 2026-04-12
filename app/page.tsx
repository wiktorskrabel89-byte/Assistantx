"use client";
import { useState, useCallback, useEffect, useRef, memo } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { VoiceModal } from "./components/VoiceModal";

type Mode = "chat" | "upload";
type StyleMode = "concise" | "detailed" | "step-by-step";
type Folder = "All" | "Work" | "Personal" | "Ideas" | "Debugging";
type ChatEntry = {
  user: string;
  ai: string;
  model: string | null;
  imageUrl?: string;
  filePreview?: string;
  reasoning?: string;
  routeReason?: string;
  status?: string;
  folder?: Exclude<Folder, "All">;
};

type ChatListProps = {
  chat: ChatEntry[];
  loading: boolean;
  dark: boolean;
  cardBg: string;
  codeBg: string;
  copied: number | null;
  speaking: number | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onSpeak: (text: string, idx: number) => void;
  onCopyCode: (code: string, idx: number) => void;
  openReasoning: Set<number>;
  onToggleReasoning: (i: number) => void;
  onRegenerate: (i: number) => void;
  onEditUser: (text: string) => void;
  onResponseAction: (action: "summarize" | "checklist" | "translate" | "commit", text: string) => void;
  activeFolder: Folder;
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
  onRegenerate,
  onEditUser,
  onResponseAction,
  activeFolder,
}: ChatListProps) {
  let codeBlockIdx = 0;
  const visibleChat = chat
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .filter(({ entry }) => activeFolder === "All" || (entry.folder ?? "Work") === activeFolder);
  const lastOriginalIndex = visibleChat.length > 0 ? visibleChat[visibleChat.length - 1].originalIndex : -1;

  return (
    <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
      {visibleChat.length === 0 && (
        <div className={`text-center mt-16 text-base px-6 py-8 rounded-3xl border backdrop-blur-sm ${dark ? "text-cyan-100/80 border-cyan-400/20 bg-cyan-500/10" : "text-cyan-900/80 border-cyan-600/20 bg-cyan-100/60"}`}>
          Start a chat or drop a file to begin.
        </div>
      )}
      {visibleChat.map(({ entry: c, originalIndex }, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[80%]">
              {c.filePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.filePreview} alt="file" className="h-20 rounded-xl mb-1 ml-auto block" />
              )}
              <div className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm shadow-lg shadow-cyan-500/20">
                {c.user}
              </div>
              <button onClick={() => onEditUser(c.user)} className={`text-[11px] mt-1 ${dark ? "text-cyan-300" : "text-cyan-700"}`}>
                Edit & resend
              </button>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[85%] space-y-1">
              {c.reasoning && (
                <div className={`mb-1 text-xs rounded-xl px-3 py-2 border ${dark ? "bg-purple-950/30 border-purple-800/30 text-purple-300" : "bg-purple-50 border-purple-200 text-purple-700"}`}>
                  <button onClick={() => onToggleReasoning(originalIndex)} className="w-full text-left flex items-center gap-2 font-medium">
                    <span>Reasoning</span>
                    {loading && originalIndex === lastOriginalIndex
                      ? <span className="animate-pulse ml-1">●</span>
                      : <span className="ml-auto">{openReasoning.has(originalIndex) ? "▲" : "▼"}</span>}
                  </button>
                  {(openReasoning.has(originalIndex) || (loading && originalIndex === lastOriginalIndex)) && (
                    <div className="mt-2 whitespace-pre-wrap max-h-40 overflow-y-auto opacity-80 leading-relaxed">
                      {c.reasoning}
                    </div>
                  )}
                </div>
              )}

              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt={c.user} className="rounded-xl max-w-full" />
              ) : (
                <div className={`${cardBg} border px-4 py-3 rounded-2xl rounded-tl-sm text-sm shadow-sm`}>
                  {!c.ai && originalIndex === lastOriginalIndex && loading ? (
                    <span className="inline-flex items-center gap-2 text-gray-400 text-xs py-1">
                      <span className="inline-block h-2 w-20 rounded-full bg-gradient-to-r from-cyan-400/40 via-blue-400/80 to-cyan-400/40 bg-[length:200%_100%] animate-[pulse_1.2s_ease-in-out_infinite]" />
                      <span>{c.status ?? "Thinking..."}</span>
                    </span>
                  ) : originalIndex === lastOriginalIndex && loading ? (
                    <div>
                      {c.status && <div className="text-[11px] opacity-70 mb-1">{c.status}</div>}
                      <span className="whitespace-pre-wrap leading-relaxed">{c.ai}</span>
                    </div>
                  ) : (
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className ?? "");
                          const codeStr = String(children).replace(/\n$/, "");
                          const isBlock = match || codeStr.includes("\n");
                          if (isBlock) {
                            const idx = codeBlockIdx++;
                            return (
                              <div className="relative my-2">
                                <div className={`flex items-center justify-between px-3 py-1 rounded-t-lg text-xs text-gray-400 ${dark ? "bg-slate-950" : "bg-slate-200"}`}>
                                  <span>{match?.[1] ?? "code"}</span>
                                  <button onClick={() => onCopyCode(codeStr, idx)} className="hover:text-white transition-colors">
                                    {copied === idx ? "✓ Copied!" : "Copy"}
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
                        p({ children }) { return <p className="mb-2 last:mb-0">{children}</p>; },
                        ul({ children }) { return <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>; },
                        ol({ children }) { return <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>; },
                      }}
                    >
                      {c.ai}
                    </ReactMarkdown>
                  )}
                </div>
              )}

              {c.model && (
                <div className={`text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-2 border ${dark ? "text-cyan-200 border-cyan-700/40 bg-cyan-950/30" : "text-cyan-800 border-cyan-300/70 bg-cyan-50"}`}>
                  <span>{c.model}</span>
                  {c.routeReason && <span className="opacity-70">• {c.routeReason}</span>}
                </div>
              )}

              {c.ai && !c.imageUrl && (
                <div className="flex flex-wrap gap-2 text-xs mt-1">
                  <button
                    onClick={() => onSpeak(c.ai, originalIndex)}
                    disabled={speaking !== null && speaking !== originalIndex}
                    className={`transition-colors ${speaking === originalIndex ? "text-cyan-400 animate-pulse" : "text-gray-400 hover:text-cyan-400"}`}
                  >
                    {speaking === originalIndex ? "Stop" : "Listen"}
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(c.ai)} className={`${dark ? "text-cyan-300" : "text-cyan-700"}`}>Copy</button>
                  <button onClick={() => onResponseAction("summarize", c.ai)} className={`${dark ? "text-cyan-300" : "text-cyan-700"}`}>Summarize</button>
                  <button onClick={() => onResponseAction("checklist", c.ai)} className={`${dark ? "text-cyan-300" : "text-cyan-700"}`}>Checklist</button>
                  <button onClick={() => onResponseAction("translate", c.ai)} className={`${dark ? "text-cyan-300" : "text-cyan-700"}`}>Translate</button>
                  <button onClick={() => onResponseAction("commit", c.ai)} className={`${dark ? "text-cyan-300" : "text-cyan-700"}`}>Commit msg</button>
                  <button onClick={() => onRegenerate(originalIndex)} className={`${dark ? "text-emerald-300" : "text-emerald-700"}`}>Retry other model</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );
});

export default function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const [listening, setListening] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileTextPreview, setFileTextPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [openReasoning, setOpenReasoning] = useState<Set<number>>(new Set());
  const [styleMode, setStyleMode] = useState<StyleMode>("concise");
  const [languageLock, setLanguageLock] = useState<string>("auto");
  const [activeFolder, setActiveFolder] = useState<Folder>("All");
  const [composeFolder, setComposeFolder] = useState<Exclude<Folder, "All">>("Work");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<string[]>([]);

  const quickChips = [
    "Explain this code: ",
    "Fix this bug: ",
    "Generate tests for: ",
    "Summarize this file: ",
    "Create API endpoint for: ",
  ];

  const toggleReasoning = useCallback((i: number) => {
    setOpenReasoning((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  }, []);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length) {
          setChat(
            data.messages.map((m: { user_message: string; ai_message: string; model: string; image_url?: string }) => ({
              user: m.user_message,
              ai: m.ai_message,
              model: m.model,
              imageUrl: m.image_url ?? undefined,
              folder: "Work",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleFile = async (f: File) => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(f);
    const url = URL.createObjectURL(f);
    setFilePreview(url);
    setMode("upload");
    if (f.type.startsWith("text/") || /\.(md|ts|tsx|js|jsx|json|py|txt|yaml|yml|css|html)$/i.test(f.name)) {
      try {
        const content = await f.text();
        setFileTextPreview(content.slice(0, 900));
      } catch {
        setFileTextPreview(null);
      }
    } else {
      setFileTextPreview(null);
    }
  };

  const clearAttachedFile = useCallback(() => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    setFileTextPreview(null);
    setMode("chat");
  }, [filePreview]);

  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    // Allow selecting the same file again by clearing the previous value.
    input.value = "";
    input.click();
  }, []);

  const copyCode = useCallback((code: string, idx: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const speak = useCallback(async (text: string, idx: number) => {
    if (speaking !== null) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setSpeaking(null);
      return;
    }
    const clean = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/[*_~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s/gm, "")
      .trim();
    if (!clean) return;

    setSpeaking(idx);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean.slice(0, 2000) }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const { audioContent } = await res.json();
      const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(null); audioRef.current = null; };
      audio.onerror = () => { setSpeaking(null); audioRef.current = null; };
      audio.play();
    } catch {
      setSpeaking(null);
    }
  }, [speaking]);

  const exportChat = () => {
    const text = chat.map((c) => `You: ${c.user}\nAI (${c.model ?? ""}): ${c.ai}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat-export.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = async () => {
    setChat([]);
    await fetch("/api/history", { method: "DELETE" }).catch(() => {});
  };

  const startVoice = async () => {
    if (listening) {
      processorRef.current?.disconnect();
      processorRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      setListening(false);

      const chunks = pcmChunksRef.current.splice(0);
      if (chunks.length === 0) return;

      setLoading(true);
      try {
        const res = await fetch("/api/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunks }),
        });
        const data = await res.json();
        if (data.transcript) setMessage((prev) => prev + (prev ? " " : "") + data.transcript);
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
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const outLen = Math.floor(input.length / sampleRatio);
        const out = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const s = input[Math.floor(i * sampleRatio)];
          out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
        }
        const bytes = new Uint8Array(out.buffer);
        let bin = "";
        for (let b = 0; b < bytes.length; b++) bin += String.fromCharCode(bytes[b]);
        pcmChunksRef.current.push(btoa(bin));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      setListening(true);
    } catch {
      alert("Microphone error");
    }
  };

  const saveToHistory = async (entry: ChatEntry) => {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: entry.user, ai: entry.ai, model: entry.model, imageUrl: entry.imageUrl }),
    }).catch(() => {});
  };

  const sendMessage = useCallback(async (override?: { text?: string; forceModelId?: string; folder?: Exclude<Folder, "All"> }) => {
    const raw = override?.text ?? message;
    const trimmed = raw.trim();
    const parsed = trimmed.startsWith("/chat ")
      ? { mode: "chat" as Mode, text: trimmed.replace(/^\/chat\s+/, "") }
      : trimmed === "/chat"
        ? { mode: "chat" as Mode, text: "" }
        : { mode, text: raw };
    const effectiveMode = override?.forceModelId ? "chat" : parsed.mode;
    const userMsg = parsed.text;

    if ((!userMsg && !file) || loading) return;

    setMessage("");
    setLoading(true);

    if (effectiveMode === "upload" && file) {
      const preview = filePreview ?? undefined;
      const entry: ChatEntry = { user: userMsg || "What is in this file?", ai: "", model: null, status: "Uploading file...", filePreview: preview, folder: override?.folder ?? composeFolder };
      setChat((prev) => [...prev, entry]);
      setFile(null);
      setFilePreview(null);
      setFileTextPreview(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("message", userMsg || "What is in this file?");

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const rawLine = line.slice(6).trim();
            if (rawLine === "[DONE]") break;
            try {
              const parsedLine = JSON.parse(rawLine);
              if (parsedLine.model) {
                setChat((prev) => {
                  const a = [...prev];
                  a[a.length - 1] = { ...a[a.length - 1], model: parsedLine.model };
                  return a;
                });
              }
              if (parsedLine.status) {
                setChat((prev) => {
                  const a = [...prev];
                  a[a.length - 1] = { ...a[a.length - 1], status: parsedLine.status };
                  return a;
                });
              }
              if (parsedLine.token) {
                setChat((prev) => {
                  const a = [...prev];
                  a[a.length - 1] = { ...a[a.length - 1], status: "Writing response in real time...", ai: a[a.length - 1].ai + parsedLine.token };
                  return a;
                });
              }
            } catch {}
          }
        }
      } finally {
        setLoading(false);
        setMode("chat");
      }
      return;
    }

    const entry: ChatEntry = { user: userMsg, ai: "", model: null, folder: override?.folder ?? composeFolder };
    entry.status = "Analyzing prompt...";
    setChat((prev) => [...prev, entry]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          modelId: override?.forceModelId,
          style: styleMode,
          languageLock,
          history: chat.filter((c) => c.ai && !c.imageUrl).map((c) => ({ user: c.user, ai: c.ai })),
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const rawLine = line.slice(6).trim();
          if (rawLine === "[DONE]") break;
          try {
            const parsedLine = JSON.parse(rawLine);
            if (parsedLine.model || parsedLine.routeReason) {
              setChat((prev) => {
                const a = [...prev];
                a[a.length - 1] = {
                  ...a[a.length - 1],
                  model: parsedLine.model ?? a[a.length - 1].model,
                  routeReason: parsedLine.routeReason ?? a[a.length - 1].routeReason,
                };
                return a;
              });
            }
            if (parsedLine.status) {
              setChat((prev) => {
                const a = [...prev];
                a[a.length - 1] = { ...a[a.length - 1], status: parsedLine.status };
                return a;
              });
            }
            if (parsedLine.reasoning) {
              setChat((prev) => {
                const a = [...prev];
                a[a.length - 1] = { ...a[a.length - 1], reasoning: (a[a.length - 1].reasoning ?? "") + parsedLine.reasoning };
                return a;
              });
            }
            if (parsedLine.token) {
              setChat((prev) => {
                const a = [...prev];
                a[a.length - 1] = { ...a[a.length - 1], status: "Writing response in real time...", ai: a[a.length - 1].ai + parsedLine.token };
                return a;
              });
            }
          } catch {}
        }
      }
      setChat((prev) => {
        const a = [...prev];
        a[a.length - 1] = { ...a[a.length - 1], status: undefined };
        return a;
      });
      const final = await new Promise<ChatEntry>((resolve) => setChat((prev) => { resolve(prev[prev.length - 1]); return prev; }));
      await saveToHistory(final);
    } finally {
      setLoading(false);
    }
  }, [message, mode, loading, file, filePreview, chat, composeFolder, styleMode, languageLock]);

  const handleRegenerate = useCallback((idx: number) => {
    const target = chat[idx];
    if (!target) return;
    const isDeepSeek = (target.model ?? "").toLowerCase().includes("deepseek");
    const alternate = isDeepSeek ? "google/gemini-2.5-flash-lite" : "deepseek/deepseek-v3.2";
    void sendMessage({ text: target.user, forceModelId: alternate, folder: target.folder ?? "Work" });
  }, [chat, sendMessage]);

  const handleResponseAction = useCallback((action: "summarize" | "checklist" | "translate" | "commit", text: string) => {
    const snippet = text.slice(0, 3000);
    const prompts: Record<typeof action, string> = {
      summarize: `Summarize this response into key points:\n\n${snippet}`,
      checklist: `Turn this into a practical checklist:\n\n${snippet}`,
      translate: `Translate this to ${languageLock === "auto" ? "English" : languageLock} and keep meaning exact:\n\n${snippet}`,
      commit: `Create a concise git commit message based on this:\n\n${snippet}`,
    };
    setMode("chat");
    setMessage(prompts[action]);
    inputRef.current?.focus();
  }, [languageLock]);

  const editPrompt = useCallback((text: string) => {
    setMode("chat");
    setMessage(text);
    inputRef.current?.focus();
  }, []);

  const bg = dark
    ? "bg-[radial-gradient(circle_at_15%_20%,rgba(6,182,212,0.22),transparent_32%),radial-gradient(circle_at_85%_0%,rgba(34,197,94,0.18),transparent_30%),linear-gradient(145deg,#0b1220,#111827_45%,#0f172a)] text-gray-100"
    : "bg-[radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.35),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(250,204,21,0.28),transparent_28%),linear-gradient(145deg,#ecfeff,#e0f2fe_45%,#f0fdf4)] text-slate-900";
  const cardBg = dark ? "bg-slate-900/70 border-cyan-400/20 backdrop-blur-md" : "bg-white/75 border-cyan-700/20 backdrop-blur-md";
  const inputBg = dark ? "bg-slate-800/80 border-slate-600 text-gray-100 placeholder-gray-400" : "bg-white/85 border-cyan-900/20 text-slate-900 placeholder-slate-500";
  const codeBg = dark ? "bg-slate-950" : "bg-slate-100";

  return (
    <>
      <div className={`min-h-screen ${bg} transition-colors duration-200`}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={`absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl ${dark ? "bg-cyan-500/20" : "bg-cyan-300/40"}`} />
          <div className={`absolute top-24 right-0 h-80 w-80 rounded-full blur-3xl ${dark ? "bg-emerald-500/20" : "bg-emerald-300/45"}`} />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 py-6 flex flex-col h-screen">
          <div className={`flex items-center justify-between mb-4 rounded-2xl border px-4 py-3 ${cardBg}`}>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Moje AI</h1>
              <p className={`text-xs mt-0.5 ${dark ? "text-cyan-100/70" : "text-cyan-900/70"}`}>Colorful multi-tool assistant</p>
            </div>
            <div className="flex gap-2">
              {chat.length > 0 && (
                <>
                  <button onClick={exportChat} className="px-3 py-1.5 text-sm rounded-lg border border-cyan-500/50 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/15 transition-colors">Export</button>
                  <button onClick={clearChat} className="px-3 py-1.5 text-sm rounded-lg border border-rose-400/70 text-rose-500 hover:bg-rose-500/10 transition-colors">Clear</button>
                </>
              )}
              <button onClick={() => setVoiceOpen(true)} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${dark ? "border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/15" : "border-cyan-600/40 text-cyan-700 hover:bg-cyan-100/70"}`}>Voice</button>
              <button onClick={() => setDark((d) => !d)} className={`px-3 py-1.5 text-sm rounded-lg border ${dark ? "border-amber-300 text-amber-300 hover:bg-amber-500/15" : "border-amber-600/40 text-amber-700 hover:bg-amber-100/70"} transition-colors`}>
                {dark ? "Light" : "Dark"}
              </button>
            </div>
          </div>

          <div className={`flex gap-2 flex-wrap mb-3 rounded-2xl border px-3 py-2 ${cardBg}`}>
            <button onClick={() => setMode("chat")} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${mode === "chat" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-transparent" : "border-gray-300/60"}`}>Chat</button>

            <select value={styleMode} onChange={(e) => setStyleMode(e.target.value as StyleMode)} className={`px-2 py-1 rounded-lg text-xs border ${inputBg}`}>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="step-by-step">Step-by-step</option>
            </select>
            <select value={languageLock} onChange={(e) => setLanguageLock(e.target.value)} className={`px-2 py-1 rounded-lg text-xs border ${inputBg}`}>
              <option value="auto">Language: Auto</option>
              <option value="en">English</option>
              <option value="pl">Polish</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </select>
            <select value={composeFolder} onChange={(e) => setComposeFolder(e.target.value as Exclude<Folder, "All">)} className={`px-2 py-1 rounded-lg text-xs border ${inputBg}`}>
              <option value="Work">Work</option>
              <option value="Personal">Personal</option>
              <option value="Ideas">Ideas</option>
              <option value="Debugging">Debugging</option>
            </select>
            <input ref={fileInputRef} type="file" accept="image/*,.txt,.pdf,.md,.ts,.tsx,.js,.jsx,.json,.py" className="hidden" onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            {(["All", "Work", "Personal", "Ideas", "Debugging"] as Folder[]).map((f) => (
              <button key={f} onClick={() => setActiveFolder(f)} className={`text-xs px-2.5 py-1 rounded-full border ${activeFolder === f ? "bg-cyan-600 text-white border-transparent" : `${dark ? "border-slate-600" : "border-slate-300"}`}`}>
                {f}
              </button>
            ))}
          </div>

          {filePreview && (
            <div className={`mb-3 p-2 rounded-2xl border ${cardBg} flex flex-col gap-2`}>
              {file?.type.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreview} alt="preview" className="h-24 w-24 object-cover rounded-lg" />
              )}
              <span className="text-sm">{file?.name}</span>
              {fileTextPreview && <pre className={`text-xs p-2 rounded-lg overflow-auto max-h-32 ${dark ? "bg-slate-800" : "bg-slate-100"}`}>{fileTextPreview}</pre>}
              <button onClick={clearAttachedFile} className="text-red-400 text-sm self-end">Remove file</button>
            </div>
          )}

          <ChatList
            chat={chat}
            loading={loading}
            dark={dark}
            cardBg={cardBg}
            codeBg={codeBg}
            copied={copied}
            speaking={speaking}
            chatEndRef={chatEndRef}
            onSpeak={speak}
            onCopyCode={copyCode}
            openReasoning={openReasoning}
            onToggleReasoning={toggleReasoning}
            onRegenerate={handleRegenerate}
            onEditUser={editPrompt}
            onResponseAction={handleResponseAction}
            activeFolder={activeFolder}
          />

          <div className={`${cardBg} border rounded-3xl p-3 flex flex-col gap-2 shadow-xl shadow-cyan-900/10`}>
            <div className="flex gap-2 flex-wrap">
              {quickChips.map((chip) => (
                <button key={chip} onClick={() => { setMode("chat"); setMessage(chip); inputRef.current?.focus(); }} className={`text-xs px-2.5 py-1 rounded-full border ${dark ? "border-cyan-700/40 text-cyan-200" : "border-cyan-300 text-cyan-700"}`}>
                  {chip.replace(/: $/, "")}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void sendMessage(); return; }
                  if (e.key === "ArrowUp" && !message.trim() && chat.length > 0) {
                    e.preventDefault();
                    const lastUser = [...chat].reverse().find((c) => c.user)?.user;
                    if (lastUser) setMessage(lastUser);
                  }
                }}
                placeholder={mode === "upload" ? "Ask about the file... (Ctrl/Cmd+Enter to send)" : "Type a message... ask for image generation naturally, or use /chat"}
                disabled={loading}
                rows={1}
                className={`flex-1 resize-none rounded-2xl px-3 py-2.5 text-sm border ${inputBg} focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors disabled:opacity-50`}
                style={{ minHeight: 44, maxHeight: 180 }}
              />
              <button
                onClick={() => {
                  if (file) clearAttachedFile();
                  else openFilePicker();
                }}
                disabled={loading}
                className={`p-2 rounded-2xl border ${mode === "upload" ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-transparent" : `${dark ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}`}
                title={file ? "Remove attached file" : "Attach file"}
              >
                {file ? "✕" : "📎"}
              </button>
              <button onClick={startVoice} disabled={loading} className={`p-2 rounded-2xl border ${listening ? "bg-rose-500 text-white border-rose-500" : `${dark ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}`}>Mic</button>
              <button onClick={() => void sendMessage()} disabled={loading || (!message && !file)} className={`px-4 py-2 rounded-2xl text-sm font-semibold text-white disabled:opacity-40 ${mode === "upload" ? "bg-gradient-to-r from-orange-500 to-amber-500" : "bg-gradient-to-r from-cyan-500 to-blue-600"}`}>
                {loading ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {voiceOpen && <VoiceModal onClose={() => setVoiceOpen(false)} dark={dark} />}
    </>
  );
}
