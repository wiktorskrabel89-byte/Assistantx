"use client";

/**
 * MeridianDiagnosticsCard — Settings → Zaawansowane diagnostics surface.
 *
 * Web-app scope of Bug 1: this codebase does NOT spawn the Python sidecar
 * (only the Electron jarvis/desktop/ app does). Here, "Python script
 * offline" reduces to:
 *   • Is FastAPI at 127.0.0.1:8000 reachable? (/health ping)
 *   • What's the latency?
 *   • Did the last ping cross a threshold (>3s = unreachable)?
 *   • Show the rolling log so the user / dev can see the trend
 *
 * The richer "stdout/stderr tail" and "auto-restart" knobs from the spec
 * live in the Electron app — they require process-spawn access we don't
 * have here. This component still provides:
 *   • Live status pill (Running / Degraded / Offline)
 *   • Terminal-stream log of the last ~50 pings (ox-terminal style)
 *   • Manual "Ping now" button
 *   • Auto-refresh toggle (default ON, 10s interval)
 *
 * Color tokens: --ox-green for healthy, --ox-amber for degraded
 * (latency > 1s but reachable), --ox-red for offline.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Pause, Play, RefreshCw } from "lucide-react";

type PingStatus = "ok" | "degraded" | "fail";
type LogEntry = { ts: number; status: PingStatus; detail: string };

const LATENCY_DEGRADED_MS = 1000;
const REQUEST_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 10_000;
const LOG_CAP = 50;

const STATUS_COLOR: Record<PingStatus, string> = {
  ok: "var(--ox-green)",
  degraded: "var(--ox-amber)",
  fail: "var(--ox-red)",
};
const STATUS_LABEL: Record<PingStatus, string> = {
  ok: "Działa",
  degraded: "Spowolniony",
  fail: "Offline",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export type MeridianDiagnosticsCardProps = {
  /** FastAPI base URL. Defaults to the local dev port (127.0.0.1:8000). */
  apiBase?: string;
  className?: string;
};

export function MeridianDiagnosticsCard({
  apiBase = "http://127.0.0.1:8000",
  className,
}: MeridianDiagnosticsCardProps) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pinging, setPinging] = useState(false);
  const cancelledRef = useRef(false);
  const terminalRef = useRef<HTMLDivElement | null>(null);

  const latest = log[log.length - 1];

  const ping = useCallback(async () => {
    if (pinging || cancelledRef.current) return;
    setPinging(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const start = performance.now();
    let entry: LogEntry;
    try {
      const res = await fetch(`${apiBase}/health`, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        entry = { ts: Date.now(), status: "fail", detail: `HTTP ${res.status} (${latency}ms)` };
      } else {
        const status: PingStatus = latency > LATENCY_DEGRADED_MS ? "degraded" : "ok";
        entry = { ts: Date.now(), status, detail: `200 ${latency}ms` };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const reason = err instanceof Error ? err.message : String(err);
      entry = { ts: Date.now(), status: "fail", detail: reason };
    }
    if (cancelledRef.current) return;
    setLog((prev) => {
      const next = [...prev, entry];
      return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
    });
    setPinging(false);
  }, [apiBase, pinging]);

  // Auto-refresh loop. Strict-mode-safe (cancelledRef + cleanup).
  useEffect(() => {
    cancelledRef.current = false;
    if (!autoRefresh) return;
    void ping();
    const id = setInterval(() => void ping(), POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
    // We intentionally exclude `ping` from deps — it changes whenever pinging
    // toggles, which would reset the interval mid-cycle. Capturing the
    // closure-stable apiBase is enough since auto-refresh restarts on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, apiBase]);

  // Auto-scroll the terminal to bottom as entries arrive.
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [log.length]);

  return (
    <section
      className={`ox-panel ${className ?? ""}`}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14 }}
      aria-label="Diagnostyka backendu"
    >
      {/* Header — status pill + label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div
            style={{
              color: "var(--ox-text-hi)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Activity className="h-3.5 w-3.5" style={{ color: "var(--ox-cyan)" }} />
            Backend FastAPI · /health
          </div>
          <div
            style={{
              color: "var(--ox-text-mid)",
              fontFamily: "var(--ox-font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.04em",
            }}
          >
            {apiBase}
          </div>
        </div>

        <div
          role="status"
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            border: `1px solid ${latest ? STATUS_COLOR[latest.status] : "var(--ox-border)"}`,
            borderRadius: 999,
            fontFamily: "var(--ox-font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: latest ? STATUS_COLOR[latest.status] : "var(--ox-text-dim)",
            background: "var(--ox-bg2)",
          }}
        >
          <span
            className="ox-status-dot"
            style={{
              background: latest ? STATUS_COLOR[latest.status] : "var(--ox-text-dim)",
              boxShadow: latest && latest.status !== "fail" ? `0 0 6px ${STATUS_COLOR[latest.status]}` : undefined,
            }}
          />
          {latest ? STATUS_LABEL[latest.status] : "Czekam…"}
        </div>
      </div>

      {/* Controls — ping + auto-refresh toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => void ping()}
          disabled={pinging}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: "var(--ox-bg3)",
            border: "1px solid var(--ox-border)",
            borderRadius: 6,
            color: "var(--ox-cyan)",
            fontFamily: "var(--ox-font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: pinging ? "wait" : "pointer",
            opacity: pinging ? 0.6 : 1,
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Ping teraz
        </button>
        <button
          type="button"
          onClick={() => setAutoRefresh((v) => !v)}
          aria-pressed={autoRefresh}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: autoRefresh ? "var(--ox-bg3)" : "transparent",
            border: `1px solid ${autoRefresh ? "var(--ox-cyan-dim)" : "var(--ox-border)"}`,
            borderRadius: 6,
            color: autoRefresh ? "var(--ox-cyan)" : "var(--ox-text-mid)",
            fontFamily: "var(--ox-font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {autoRefresh ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          Auto · 10s
        </button>
      </div>

      {/* Terminal stream — rolling log */}
      <div
        ref={terminalRef}
        className="ox-terminal"
        style={{ height: 160 }}
        aria-label="Log zdrowia backendu"
      >
        {log.length === 0 ? (
          <div style={{ color: "var(--ox-text-dim)" }}>{"// Czekam na pierwszy ping…"}</div>
        ) : (
          log.map((entry, i) => (
            <div key={`${entry.ts}-${i}`} style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "var(--ox-text-dim)", flexShrink: 0 }}>{formatTime(entry.ts)}</span>
              <span style={{ color: STATUS_COLOR[entry.status], flexShrink: 0 }}>
                [{entry.status.toUpperCase()}]
              </span>
              <span style={{ color: "var(--ox-text-code)" }}>{entry.detail}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
