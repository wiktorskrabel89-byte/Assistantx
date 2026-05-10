"use client";
import { useState, useRef } from "react";
import { APP_FORCED_MODEL_ID, APP_FORCED_THINKING_EFFORT } from "@/lib/ai-config";

export default function PublicChatWidget() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I’m the AssistantX bot. Ask me anything about this website or its features." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  async function sendMessage() {
    if (!input.trim()) return;
    setMessages((msgs) => [...msgs, { role: "user", content: input }]);
    setLoading(true);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          mode: "chat",
          history: messages.filter((m) => m.role === "user").map((m) => ({ user: m.content, ai: "" })),
          assistantInstructions: "You are a helpful website assistant. Only answer questions about AssistantX, its features, usage, and policies. If the question is unrelated, politely decline.",
          style: "concise",
          modelId: APP_FORCED_MODEL_ID,
          thinkingEffort: APP_FORCED_THINKING_EFFORT,
          allowedModels: [APP_FORCED_MODEL_ID],
        }),
      });
      let reply = "";
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          reply += decoder.decode(value);
        }
        // Try to extract the last AI message from the SSE stream
        const match = reply.match(/\{"token":"([^"]+)"/g);
        const last = match ? match.map((m) => JSON.parse(m + '"}').token).join("") : "Sorry, I couldn't get a response.";
        setMessages((msgs) => [...msgs, { role: "assistant", content: last }]);
      }
    } catch {
      setMessages((msgs) => [...msgs, { role: "assistant", content: "Sorry, there was an error. Please try again." }]);
    }
    setLoading(false);
  }

  return (
    <div className="fixed bottom-8 right-8 z-50 flex w-80 max-w-full flex-col rounded-xl border border-blue-200 bg-white shadow-lg">
      <div className="border-b p-4 font-bold text-blue-800">Ask AssistantX</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ maxHeight: 300 }}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === "assistant" ? "text-gray-800" : "text-right text-blue-700"}>{m.content}</div>
        ))}
        {loading && <div className="text-gray-600">AssistantX is typing…</div>}
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
          className="rounded-br-xl bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 disabled:opacity-50"
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
