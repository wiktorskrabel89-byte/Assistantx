"use client";
import { useState, useCallback } from "react";

type Mode = "auto" | "chat" | "code" | "image";
type ChatEntry = { user: string; ai: string; model: string | null; imageUrl?: string };

export default function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [mode, setMode] = useState<Mode>("auto");
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async () => {
    if (!message || loading) return;
    const userMsg = message;
    setMessage("");
    setLoading(true);

    if (mode === "image") {
      setChat((prev) => [...prev, { user: userMsg, ai: "Generuję obraz...", model: "DALL-E 3" }]);
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userMsg }),
        });
        const data = await res.json();
        setChat((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            user: userMsg,
            ai: data.error ?? "",
            model: "DALL-E 3",
            imageUrl: data.url ?? undefined,
          };
          return updated;
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Add entry with empty AI reply that we'll stream into
    setChat((prev) => [...prev, { user: userMsg, ai: "", model: null }]);

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
              setChat((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1], model: parsed.model };
                return updated;
              });
            }
            if (parsed.token) {
              setChat((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  ai: updated[updated.length - 1].ai + parsed.token,
                };
                return updated;
              });
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [message, mode, loading]);

  const modeLabels: Record<Mode, string> = {
    auto: "Auto",
    chat: "Rozmowa (GPT-4o)",
    code: "Kod (Claude Sonnet)",
    image: "Obraz (DALL-E 3)",
  };

  const modeColors: Record<Mode, string> = {
    auto: "#0070f3",
    chat: "#0070f3",
    code: "#7c3aed",
    image: "#059669",
  };

  return (
    <main style={{ padding: 20, maxWidth: 800 }}>
      <h1>Moje AI</h1>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["auto", "chat", "code", "image"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: mode === m ? modeColors[m] : "#fff",
              color: mode === m ? "#fff" : "#000",
              cursor: "pointer",
              fontWeight: mode === m ? "bold" : "normal",
            }}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {chat.map((c, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <p><b>Ty:</b> {c.user}</p>
          <p><b>AI {c.model ? `(${c.model})` : ""}:</b></p>
          {c.imageUrl ? (
            <img
              src={c.imageUrl}
              alt={c.user}
              style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
            />
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: 12, borderRadius: 6, minHeight: 24 }}>
              {c.ai || (i === chat.length - 1 && loading ? "▋" : "")}
            </pre>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder={mode === "image" ? "Opisz obraz do wygenerowania..." : "Napisz coś..."}
          disabled={loading}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", opacity: loading ? 0.6 : 1 }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            background: loading ? "#999" : modeColors[mode],
            color: "#fff",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? (mode === "image" ? "Generuję..." : "...") : (mode === "image" ? "Generuj" : "Wyślij")}
        </button>
      </div>
    </main>
  );
}