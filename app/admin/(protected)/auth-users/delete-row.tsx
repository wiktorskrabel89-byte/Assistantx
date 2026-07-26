"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAuthUserButton({ id, email }: { id: string; email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const del = async () => {
    if (
      !window.confirm(
        `Delete Supabase auth user ${email ?? id.slice(0, 8)}?\n\nCalls auth.admin.deleteUser (falls back to a direct REST call if the SDK fails). Cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
        cache: "no-store",
      });
      let data: { ok?: boolean; error?: string; method?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      if (!res.ok || !data.ok) {
        alert(`Delete failed: ${data.error || res.status}`);
        return;
      }
      // Hard reload — router.refresh() sometimes serves the previous
      // server-render output back if the route is force-dynamic'd but the
      // cache boundary shifts. Full navigation guarantees the row is gone.
      router.refresh();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={del}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-60"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
