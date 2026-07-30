"use client";

import { useState } from "react";

export function LaunchDateForm({ initial }: { initial: string }) {
  // initial arrives as an ISO string (or empty) — HTML datetime-local wants YYYY-MM-DDTHH:mm.
  const toInput = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [value, setValue] = useState(toInput(initial));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const save = async (nextValue: string | null) => {
    setBusy(true);
    setStatus(null);
    try {
      const iso = nextValue ? new Date(nextValue).toISOString() : null;
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "launch_date", value: iso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(`Failed: ${data.error || res.status}`);
        return;
      }
      setStatus(iso ? `Saved — countdown active until ${new Date(iso).toLocaleString()}.` : "Cleared — countdown hidden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
        Launch date
      </p>
      <h2 className="mt-1 text-lg font-bold tracking-tight">Countdown on the landing hero</h2>
      <p className="mt-2 text-sm text-white/50">
        Pick a date in the future to show the ticking countdown to visitors. Leave empty to hide it.
        Value is stored in Supabase — no redeploy needed.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50"
        />
        <button
          type="button"
          onClick={() => save(value || null)}
          disabled={busy || !value}
          className="group relative overflow-hidden rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-60 disabled:pointer-events-none"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
          <span className="relative z-10">{busy ? "Saving…" : "Save"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setValue("");
            save(null);
          }}
          disabled={busy}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/70 hover:text-white hover:border-white/20 transition disabled:opacity-60"
        >
          Clear
        </button>
      </div>

      {status && <p className="mt-4 text-sm text-violet-300/90">{status}</p>}
    </div>
  );
}
