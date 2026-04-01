"use client";
import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<{user: string, ai: string}[]>([]);

  async function sendMessage() {
    if (!message) return;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();

    setChat([...chat, { user: message, ai: data.reply }]);
    setMessage("");
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Moje AI</h1>

      {chat.map((c, i) => (
        <div key={i}>
          <p><b>Ty:</b> {c.user}</p>
          <p><b>AI:</b> {c.ai}</p>
        </div>
      ))}

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Napisz coś..."
      />
      <button onClick={sendMessage}>Wyślij</button>
    </main>
  );
}