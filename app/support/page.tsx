"use client";
import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { Send, Bot, User, Mail } from "lucide-react";

interface Message {
  role: "assistant" | "user";
  content: string;
}

const SUPPORT_INSTRUCTIONS =
  "You are the AssistantX Support Assistant. Your ONLY job is to answer questions about the AssistantX website, its features, pricing plans, account management, integrations, privacy policy, terms of service, and how to use the platform. " +
  "If a user asks anything unrelated to AssistantX (e.g. general knowledge, coding help, creative writing, math, etc.), politely decline and redirect them to ask about AssistantX instead. " +
  "Never generate code, essays, stories, or any content unrelated to AssistantX support topics. " +
  "Be friendly, concise, and helpful.";

const SUPPORT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export default function SupportPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 Hi! I'm the AssistantX Support Assistant. I can help you with questions about the AssistantX platform — features, plans, account settings, integrations, and more. What can I help you with?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll whenever a new message bubble is appended (user send or assistant placeholder).
  // messageCount is incremented twice per send: once when the user bubble is appended,
  // and again when the assistant placeholder is appended — not on every streaming token.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setMessageCount((n) => n + 1);

    const history = messages
      .reduce<Array<{ user: string; ai: string }>>((acc, msg, i, arr) => {
        if (msg.role === "user") {
          const next = arr[i + 1];
          acc.push({ user: msg.content, ai: next?.role === "assistant" ? next.content : "" });
        }
        return acc;
      }, []);

    // Track synchronously whether the assistant placeholder bubble was appended so that
    // the catch block can decide whether to trigger auto-scroll without relying on a
    // variable mutated inside a setMessages updater (which React may execute later).
    let assistantPlaceholderAppended = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: "chat",
          modelId: SUPPORT_MODEL,
          assistantInstructions: SUPPORT_INSTRUCTIONS,
          history,
          style: "concise",
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}): ${errText || res.statusText}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      assistantPlaceholderAppended = true;
      setMessageCount((n) => n + 1);

      let done = false;
      let buf = "";
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        buf += decoder.decode(value, { stream: !done });
        const lines = buf.split("\n");
        // Keep the last (potentially partial) line in the buffer
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed.token === "string") {
              reply += parsed.token;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: reply };
                return updated;
              });
            }
          } catch {
            // ignore non-JSON SSE lines (status/model metadata events)
            if (process.env.NODE_ENV === "development") console.debug("SSE parse skip:", data);
          }
        }
      }

      // Process any remaining buffered data after the stream closes without a trailing newline
      if (buf.startsWith("data: ")) {
        const data = buf.slice(6).trim();
        if (data && data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed.token === "string") {
              reply += parsed.token;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: reply };
                return updated;
              });
            }
          } catch {
            if (process.env.NODE_ENV === "development") console.debug("SSE parse skip:", data);
          }
        }
      }

      if (!reply) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, I couldn't get a response. Please try again.",
          };
          return updated;
        });
      }
    } catch (err) {
      console.error("Support chat error:", err);
      // Update the existing assistant placeholder if one was already appended,
      // otherwise add a new message and trigger auto-scroll.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, there was an error. Please try again.",
          };
          return updated;
        }
        return [...prev, { role: "assistant", content: "Sorry, there was an error. Please try again." }];
      });
      if (!assistantPlaceholderAppended) {
        setMessageCount((n) => n + 1);
      }
    }

    setLoading(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 bg-gray-900 shadow-md">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">AssistantX Support</h1>
          <p className="text-xs text-gray-400">Ask me anything about the platform</p>
        </div>
        <a
          href="mailto:support.assistantx.pl@gmail.com"
          className="ml-auto flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Mail size={15} />
          support.assistantx.pl@gmail.com
        </a>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-white ${
                  msg.role === "assistant" ? "bg-blue-600" : "bg-gray-600"
                }`}
              >
                {msg.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "assistant"
                    ? "bg-gray-800 text-gray-100 rounded-tl-sm"
                    : "bg-blue-600 text-white rounded-tr-sm"
                }`}
              >
                {msg.content || (loading && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="border-t border-gray-800 bg-gray-900 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            className="flex-1 resize-none bg-gray-800 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 max-h-40 min-h-[44px]"
            placeholder="Ask about AssistantX features, plans, or how to use the platform…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">
          This assistant only answers questions about AssistantX.
        </p>
      </div>
    </div>
  );
}
