"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

type Mode = "auto" | "chat" | "code" | "image" | "upload";
type ChatEntry = { user: string; ai: string; model: string | null; imageUrl?: string; filePreview?: string };

export default function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [mode, setMode] = useState<Mode>("auto");
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const [listening, setListening] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load chat history from Supabase on mount
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
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Dark mode class on html
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleFile = (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setFilePreview(url);
    setMode("upload");
  };

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const exportChat = () => {
    const text = chat
      .map((c) => `You: ${c.user}\nAI (${c.model ?? ""}): ${c.ai}`)
      .join("\n\n---\n\n");
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

  const startVoice = () => {
    type SpeechRecognitionCtor = new () => SpeechRecognition;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported in this browser. Use Chrome.");
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "pl-PL";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e: SpeechRecognitionEvent) => setMessage(e.results[0][0].transcript);
    rec.start();
  };

  const saveToHistory = async (entry: ChatEntry) => {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: entry.user, ai: entry.ai, model: entry.model, imageUrl: entry.imageUrl }),
    }).catch(() => {});
  };

  const sendMessage = useCallback(async () => {
    if ((!message && !file) || loading) return;
    const userMsg = message;
    setMessage("");
    setLoading(true);

    if (mode === "image") {
      const entry: ChatEntry = { user: userMsg, ai: "Generating image...", model: "DALL-E 3" };
      setChat((prev) => [...prev, entry]);
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userMsg }),
        });
        const data = await res.json();
        const updated: ChatEntry = {
          user: userMsg,
          ai: data.error ?? "",
          model: "DALL-E 3",
          imageUrl: data.url ?? undefined,
        };
        setChat((prev) => {
          const arr = [...prev];
          arr[arr.length - 1] = updated;
          return arr;
        });
        await saveToHistory(updated);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "upload" && file) {
      const preview = filePreview ?? undefined;
      const entry: ChatEntry = { user: userMsg || "What is in this file?", ai: "", model: null, filePreview: preview };
      setChat((prev) => [...prev, entry]);
      setFile(null);
      setFilePreview(null);

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
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;
            try {
              const parsed = JSON.parse(raw);
              if (parsed.model) {
                setChat((prev) => { const a = [...prev]; a[a.length - 1] = { ...a[a.length - 1], model: parsed.model }; return a; });
              }
              if (parsed.token) {
                setChat((prev) => { const a = [...prev]; a[a.length - 1] = { ...a[a.length - 1], ai: a[a.length - 1].ai + parsed.token }; return a; });
              }
            } catch { /* ignore */ }
          }
        }
        const last = await new Promise<ChatEntry>((resolve) => setChat((prev) => { resolve(prev[prev.length - 1]); return prev; }));
        await saveToHistory(last);
      } finally {
        setLoading(false);
        setMode("auto");
      }
      return;
    }

    const entry: ChatEntry = { user: userMsg, ai: "", model: null };
    setChat((prev) => [...prev, entry]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, mode }),
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
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.model) {
              setChat((prev) => { const a = [...prev]; a[a.length - 1] = { ...a[a.length - 1], model: parsed.model }; return a; });
            }
            if (parsed.token) {
              setChat((prev) => { const a = [...prev]; a[a.length - 1] = { ...a[a.length - 1], ai: a[a.length - 1].ai + parsed.token }; return a; });
            }
          } catch { /* ignore */ }
        }
      }
      const final = await new Promise<ChatEntry>((resolve) => setChat((prev) => { resolve(prev[prev.length - 1]); return prev; }));
      await saveToHistory(final);
    } finally {
      setLoading(false);
    }
  }, [message, mode, loading, file, filePreview]);

  const modeLabels: Record<Mode, string> = {
    auto: "🤖 Auto",
    chat: "💬 Chat (GPT-4.5)",
    code: "💻 Code (Claude 4.6)",
    image: "🎨 Image (DALL-E 3)",
    upload: "📎 File",
  };

  const modeColors: Record<Mode, string> = {
    auto: "bg-blue-600",
    chat: "bg-blue-600",
    code: "bg-purple-600",
    image: "bg-emerald-600",
    upload: "bg-orange-500",
  };

  const bg = dark ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900";
  const cardBg = dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const inputBg = dark ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400";
  const codeBg = dark ? "bg-gray-950" : "bg-gray-100";

  let codeBlockIdx = 0;

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-200`}>
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Moje AI</h1>
          <div className="flex gap-2">
            {chat.length > 0 && (
              <>
                <button onClick={exportChat} className="px-3 py-1.5 text-sm rounded-lg border border-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Export chat">
                  ⬇ Export
                </button>
                <button onClick={clearChat} className="px-3 py-1.5 text-sm rounded-lg border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Clear chat">
                  🗑 Clear
                </button>
              </>
            )}
            <button onClick={() => setDark((d) => !d)} className={`px-3 py-1.5 text-sm rounded-lg border ${dark ? "border-yellow-400 text-yellow-400" : "border-gray-400"} hover:opacity-80 transition-colors`}>
              {dark ? "☀ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>

        {/* Mode buttons */}
        <div className="flex gap-2 flex-wrap mb-4">
          {(["auto", "chat", "code", "image"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                mode === m ? `${modeColors[m]} text-white border-transparent` : `border-gray-300 ${dark ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"}`
              }`}
            >
              {modeLabels[m]}
            </button>
          ))}
          {/* File upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              mode === "upload" ? `${modeColors.upload} text-white border-transparent` : `border-gray-300 ${dark ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"}`
            }`}
          >
            {modeLabels.upload}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.txt,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {/* File preview */}
        {filePreview && file?.type.startsWith("image/") && (
          <div className={`mb-3 p-2 rounded-xl border ${cardBg} flex items-center gap-3`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={filePreview} alt="preview" className="h-16 w-16 object-cover rounded-lg" />
            <span className="text-sm text-gray-500">{file.name}</span>
            <button onClick={() => { setFile(null); setFilePreview(null); setMode("auto"); }} className="ml-auto text-red-400 hover:text-red-600 text-lg">✕</button>
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
          {chat.length === 0 && (
            <div className="text-center text-gray-400 mt-16 text-lg">
              👋 Send a message to start chatting
            </div>
          )}
          {chat.map((c, i) => {
            return (
              <div key={i} className="space-y-2">
                {/* User bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[80%]">
                    {c.filePreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.filePreview} alt="file" className="h-20 rounded-xl mb-1 ml-auto block" />
                    )}
                    <div className="bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm text-sm">
                      {c.user}
                    </div>
                  </div>
                </div>
                {/* AI bubble */}
                <div className="flex justify-start">
                  <div className="max-w-[85%] space-y-1">
                    <div className="text-xs text-gray-400 ml-1">{c.model ?? "AI"}</div>
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt={c.user} className="rounded-xl max-w-full" />
                    ) : (
                      <div className={`${cardBg} border px-4 py-3 rounded-2xl rounded-tl-sm text-sm`}>
                        {c.ai || (i === chat.length - 1 && loading ? (
                          <span className="animate-pulse">▋</span>
                        ) : null)}
                        {c.ai && (
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
                                      <div className={`flex items-center justify-between px-3 py-1 rounded-t-lg text-xs text-gray-400 ${dark ? "bg-gray-900" : "bg-gray-200"}`}>
                                        <span>{match?.[1] ?? "code"}</span>
                                        <button onClick={() => copyCode(codeStr, idx)} className="hover:text-white transition-colors">
                                          {copied === idx ? "✓ Copied!" : "Copy"}
                                        </button>
                                      </div>
                                      <SyntaxHighlighter
                                        style={dark ? oneDark : oneLight}
                                        language={match?.[1] ?? "text"}
                                        PreTag="div"
                                      >
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
                              blockquote({ children }) { return <blockquote className={`border-l-4 border-gray-400 pl-3 italic my-2 ${dark ? "text-gray-400" : "text-gray-600"}`}>{children}</blockquote>; },
                              h1({ children }) { return <h1 className="text-xl font-bold mb-2">{children}</h1>; },
                              h2({ children }) { return <h2 className="text-lg font-bold mb-2">{children}</h2>; },
                              h3({ children }) { return <h3 className="text-base font-bold mb-1">{children}</h3>; },
                            }}
                          >
                            {c.ai}
                          </ReactMarkdown>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className={`${cardBg} border rounded-2xl p-3 flex flex-col gap-2`}>
          <div className="flex gap-2 items-end">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={mode === "image" ? "Describe the image to generate..." : mode === "upload" ? "Ask about the file... (optional)" : "Type a message... (Enter to send, Shift+Enter for newline)"}
              disabled={loading}
              rows={1}
              className={`flex-1 resize-none rounded-xl px-3 py-2 text-sm border ${inputBg} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50`}
              style={{ minHeight: 40, maxHeight: 160 }}
            />
            {/* Voice button */}
            <button
              onClick={startVoice}
              disabled={loading}
              className={`p-2 rounded-xl border transition-colors ${listening ? "bg-red-500 text-white border-red-500" : `${dark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}`}
              title="Voice input"
            >
              🎤
            </button>
            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={loading || (!message && !file)}
              className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${modeColors[mode]}`}
            >
              {loading ? (mode === "image" ? "⏳" : "...") : (mode === "image" ? "Generate" : "Send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}