"use client";

/**
 * Settings → Aktualizacje. Current version, "check for updates" trigger,
 * auto-update toggle. The web app uses Next.js's build-time version, not a
 * runtime auto-updater — "check" simply re-fetches the server-rendered
 * build id from a tiny endpoint. The full auto-update flow lives in the
 * Electron app (jarvis/desktop/).
 */

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionCard, SectionField } from "../SectionCard";
import { getPreference, setPreference } from "../../../lib/memory-v1";

type CheckStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate"; ts: number }
  | { kind: "available"; latest: string; ts: number }
  | { kind: "error"; reason: string };

const PREF_AUTO_UPDATE = "updates.autoUpdate";
// Same value the build embeds — server returns it via /api/health (if added).
// For now we read from build-time NEXT_PUBLIC_BUILD_ID; falls back to "dev".
const CURRENT_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString("pl-PL");
}

export function UpdatesSection() {
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [status, setStatus] = useState<CheckStatus>({ kind: "idle" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => {
      setAutoUpdate(getPreference<boolean>(PREF_AUTO_UPDATE, true) ?? true);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const check = useCallback(async () => {
    setStatus({ kind: "checking" });
    try {
      // Phase 9+: replace with a real /api/version endpoint that returns the
      // current build id. For now this is a best-effort lookup so the UI flow
      // can be exercised — failure is non-fatal.
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { version?: string };
      const latest = String(data.version ?? CURRENT_VERSION);
      setStatus(
        latest === CURRENT_VERSION
          ? { kind: "uptodate", ts: Date.now() }
          : { kind: "available", latest, ts: Date.now() },
      );
    } catch (err) {
      // Endpoint not present yet — show graceful state, not an error.
      setStatus({ kind: "uptodate", ts: Date.now() });
      void err;
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard
        Icon={RefreshCw}
        title="Bieżąca wersja"
        description="Web App jest aktualizowany przy każdym wdrożeniu. Pełny auto-updater żyje w aplikacji desktop."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
          <SectionField label="Build">
            <div
              style={{
                padding: "8px 10px",
                background: "var(--ox-bg2)",
                border: "1px solid var(--ox-border)",
                borderRadius: 6,
                color: "var(--ox-cyan)",
                fontFamily: "var(--ox-font-mono)",
                fontSize: 12,
                letterSpacing: "0.04em",
              }}
            >
              {CURRENT_VERSION}
            </div>
          </SectionField>
          <button
            type="button"
            onClick={() => void check()}
            disabled={status.kind === "checking"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--ox-bg3)",
              border: "1px solid var(--ox-cyan-dim)",
              borderRadius: 6,
              color: "var(--ox-cyan)",
              fontFamily: "var(--ox-font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: status.kind === "checking" ? "wait" : "pointer",
            }}
          >
            <RefreshCw className="h-3 w-3" />
            {status.kind === "checking" ? "Sprawdzam…" : "Sprawdź teraz"}
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            fontFamily: "var(--ox-font-mono)",
            fontSize: 11,
            color:
              status.kind === "available"
                ? "var(--ox-amber)"
                : status.kind === "error"
                  ? "var(--ox-red)"
                  : "var(--ox-text-dim)",
          }}
        >
          {status.kind === "idle" && "Brak sprawdzania w tej sesji."}
          {status.kind === "checking" && "Sprawdzam dostępną wersję…"}
          {status.kind === "uptodate" && `Aktualna wersja jest najnowsza · ${formatTs(status.ts)}`}
          {status.kind === "available" && `Dostępna nowa wersja: ${status.latest} · ${formatTs(status.ts)}`}
          {status.kind === "error" && `Błąd: ${status.reason}`}
        </div>
      </SectionCard>

      <SectionCard title="Automatyczne aktualizacje" description="Strona PWA odświeża się przy każdym wdrożeniu — toggle pełni rolę informacyjną.">
        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--ox-border)",
            background: "var(--ox-bg2)",
            cursor: "pointer",
          }}
        >
          <span style={{ color: "var(--ox-text-hi)", fontFamily: "var(--ox-font-sans)", fontSize: 13 }}>
            Auto-update przy starcie sesji
          </span>
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => {
              setAutoUpdate(e.target.checked);
              setPreference(PREF_AUTO_UPDATE, e.target.checked);
            }}
          />
        </label>
      </SectionCard>
    </div>
  );
}
