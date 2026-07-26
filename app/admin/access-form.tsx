"use client";

import { useState } from "react";

export function AdminAccessForm() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.status === 401) {
        setErr("Wrong code.");
        return;
      }
      if (!res.ok) {
        setErr("Something went wrong. Try again.");
        return;
      }
      window.location.href = "/admin/dashboard";
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#050508] text-white flex items-center justify-center px-6">
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(120,80,220,0.18), transparent)" }}
        />
      </div>

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl shadow-purple-500/10 backdrop-blur-xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          AssistantX
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-tight">Control Center</h1>
        <p className="mt-2 text-sm text-white/50">Enter your access code to continue.</p>

        <label htmlFor="admin-code" className="mt-8 block text-xs uppercase tracking-wider text-white/50">
          Access code
        </label>
        <input
          id="admin-code"
          type="password"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
          className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
          placeholder="••••••••"
        />

        {err && <p className="mt-3 text-xs text-red-400/80">{err}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 group relative w-full py-3 rounded-xl text-sm font-semibold overflow-hidden transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
          <span className="relative z-10">{submitting ? "Verifying…" : "Enter"}</span>
        </button>

        <p className="mt-6 text-[11px] leading-relaxed text-white/25 text-center">
          Access is logged. This area is restricted to authorized administrators.
        </p>
      </form>
    </main>
  );
}
