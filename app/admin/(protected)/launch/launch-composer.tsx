"use client";

import { useState } from "react";

export function LaunchComposer({ audienceSize }: { audienceSize: number }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>Hey there,</p><p>Big update:</p><p>— The AssistantX team</p>");
  const [text, setText] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);

  const create = async () => {
    if (creating) return;
    setStatus(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          subject,
          body_html: html,
          body_text: text || null,
          scheduled_for: scheduledFor
            ? new Date(scheduledFor).toISOString()
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Failed: ${data.error || res.status}`);
        return;
      }
      setLaunchId(data.launch.id);
      const when =
        data.launch.status === "scheduled" && data.launch.scheduled_for
          ? ` — will send at ${new Date(data.launch.scheduled_for).toLocaleString()}`
          : "";
      setStatus(`Saved as "${data.launch.name}" (${data.launch.status})${when}.`);
    } finally {
      setCreating(false);
    }
  };

  const send = async () => {
    if (!launchId || sending) return;
    const confirmed = window.confirm(
      `Send this launch to ${audienceSize.toLocaleString()} confirmed recipients?\n\nType SEND on the next dialog to proceed.`,
    );
    if (!confirmed) return;
    const typed = window.prompt("Type SEND to confirm.");
    if (typed !== "SEND") {
      setStatus("Send cancelled — you did not type SEND.");
      return;
    }
    setSending(true);
    setStatus("Sending…");
    try {
      const res = await fetch("/api/admin/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", launchId, confirm: "SEND" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Send failed: ${data.error || res.status}`);
        return;
      }
      setStatus(`Sent. ok=${data.result.ok}/${data.result.total}, failed=${data.result.failed}.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 shadow-2xl shadow-purple-500/5 sm:p-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight">New launch</h2>
        <span className="text-xs text-white/40">
          Audience (confirmed): <span className="text-white/70 font-semibold">{audienceSize.toLocaleString()}</span>
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Name (internal, unique)
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="v1.0-launch"
            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm normal-case tracking-normal focus:outline-none focus:border-violet-500/50"
          />
        </label>
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Subject line
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="AssistantX is here"
            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm normal-case tracking-normal focus:outline-none focus:border-violet-500/50"
          />
        </label>
      </div>

      <label className="mt-4 block text-xs uppercase tracking-wider text-white/50">
        HTML body
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm font-mono normal-case tracking-normal focus:outline-none focus:border-violet-500/50"
        />
      </label>

      <label className="mt-4 block text-xs uppercase tracking-wider text-white/50">
        Plain-text fallback (optional)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm font-mono normal-case tracking-normal focus:outline-none focus:border-violet-500/50"
        />
      </label>

      <label className="mt-4 block text-xs uppercase tracking-wider text-white/50">
        Schedule (optional — local time)
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm normal-case tracking-normal focus:outline-none focus:border-violet-500/50"
        />
        <span className="mt-1 block text-[10px] normal-case tracking-normal text-white/40">
          Leave empty to save as draft. Cron sweeps every 5 minutes.
        </span>
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={create}
          disabled={creating || !name || !subject || !html}
          className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20 transition disabled:opacity-60 disabled:pointer-events-none"
        >
          {creating ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!launchId || sending}
          className="group relative rounded-full overflow-hidden px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-60 disabled:pointer-events-none"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
          <span className="relative z-10">{sending ? "Sending…" : "Send now"}</span>
        </button>
        <p className="text-xs text-white/40">
          {launchId ? `Ready to send draft ${launchId.slice(0, 8)}…` : "Save a draft first."}
        </p>
      </div>

      {status && <p className="mt-4 text-sm text-violet-300/90">{status}</p>}
    </div>
  );
}
