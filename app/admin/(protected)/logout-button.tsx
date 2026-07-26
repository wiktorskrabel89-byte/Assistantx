"use client";

import { useState } from "react";

export function AdminLogoutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      window.location.href = "/admin";
    }
  };

  if (compact) {
    return (
      <button
        onClick={logout}
        disabled={busy}
        className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/20 transition-colors disabled:opacity-60"
      >
        {busy ? "…" : "Log out"}
      </button>
    );
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors disabled:opacity-60"
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
