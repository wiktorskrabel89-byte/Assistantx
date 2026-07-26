"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteWaitlistRowButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const del = async () => {
    if (!window.confirm(`Delete waitlist signup for ${email}?\n\nThis removes the row from Supabase. It cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Delete failed: ${data.error || res.status}`);
        return;
      }
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
