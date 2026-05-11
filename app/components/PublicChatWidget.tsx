"use client";
import { useState, useRef, useEffect } from "react";
import { APP_FORCED_MODEL_ID, APP_FORCED_THINKING_EFFORT } from "@/lib/ai-config";
import { X } from "lucide-react";

interface Props {
  onClose?: () => void;
}

export default function PublicChatWidget({ onClose }: Props) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm the AssistantX bot. Ask me anything about this website or its features." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((msgs) => [...msgs, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    const history = messages.reduce<Array<{ user: string; ai: string }>>((acc, msg, i, arr) => {
      if (msg.role === "user") {
        const next = arr[i + 1];
        acc.push({ user: msg.content, ai: next?.role === "assistant" ? next.content : "" });
      }
      return acc;
    }, []);

    let reply = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: "chat",
          history,
          assistantInstructions:
            "You are a helpful website assistant. Only answer questions about AssistantX, its features, usage, and policies. If the question is unrelated, politely decline.",
          style: "concise",
          modelId: APP_FORCED_MODEL_ID,
          thinkingEffort: APP_FORCED_THINKING_EFFORT,
          allowedModels: [APP_FORCED_MODEL_ID],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}): ${errText || res.statusText}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // Add placeholder assistant message for real-time streaming
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let done = false;
      let buf = "";
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        buf += decoder.decode(value, { stream: !done });
        const lines = buf.split("\n");
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
          }
        }
      }

      // Process any remaining buffered data after the stream closes
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
            // ignore
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
    } catch {
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
    }
    setLoading(false);
  }

  return (
    <div className="fixed bottom-8 right-8 z-50 flex w-80 max-w-full flex-col rounded-xl border border-blue-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-bold text-blue-800">Ask AssistantX</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close chat widget"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ maxHeight: 300 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "assistant" ? "text-gray-800" : "text-right text-blue-700"}
          >
            {m.content || (loading && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="flex border-t"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <input
          ref={inputRef}
          id="public-chat-input"
          name="publicChatInput"
          className="flex-1 px-3 py-2 rounded-bl-xl outline-none"
          placeholder="Ask about this website…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="rounded-br-xl bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 disabled:opacity-100"
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
