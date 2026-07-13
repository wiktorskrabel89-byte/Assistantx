"use client";

/**
 * MeridianDevTools — floating developer overlay for debugging the Meridian
 * migration in flight. Toggled with Ctrl+Shift+D (or Cmd+Shift+D on macOS).
 *
 * Default open in development, closed in production — but the shortcut works
 * everywhere so you can flip it on against the live app to diagnose issues.
 *
 * Surfaces:
 *   1. Voice-state preview — cycle through the 5 VEGA states; the orb is
 *      mirrored inline so you can compare the design to the live wiring.
 *   2. Token inspector — live `--ox-*` values resolved via getComputedStyle.
 *      Colours are rendered as chips so you can spot a missing token at a
 *      glance (an unresolved var stays blank).
 *   3. API health — pings the FastAPI `/health` endpoint (127.0.0.1:8000 by
 *      default; override via `apiBase` prop) and reports latency or the
 *      failure reason. Auto-refreshes every 10s while open.
 *   4. Build/env info — NODE_ENV, viewport size, user agent slice, deviceMemory
 *      and hardwareConcurrency when the browser exposes them.
 *   5. Copy diagnostics — dumps every panel above into the clipboard as a
 *      newline-delimited block, ready to paste into a bug report.
 *
 * Pure presentation — no global side-effects beyond the keydown listener and
 * the health-ping timer (both torn down on unmount).
 */

import { useCallback, useEffect, useState } from "react";
import { MeridianVoiceOrb, type VoiceState } from "./MeridianVoiceOrb";
import { useMeridianDevTools } from "./useMeridianDevTools";

const TOKEN_KEYS = [
  "--ox-bg",
  "--ox-bg1",
  "--ox-bg2",
  "--ox-bg3",
  "--ox-border",
  "--ox-cyan",
  "--ox-cyan-dim",
  "--ox-purple",
  "--ox-amber",
  "--ox-green",
  "--ox-red",
  "--ox-text-hi",
  "--ox-text-mid",
  "--ox-text-dim",
] as const;

const VOICE_STATES: VoiceState[] = ["idle", "wake", "listening", "processing", "speaking"];

type HealthResult =
  | { status: "pending" }
  | { status: "ok"; latencyMs: number; body?: unknown }
  | { status: "fail"; reason: string };

export type MeridianDevToolsProps = {
  /** Defaults to "http://127.0.0.1:8000" (the FastAPI dev port). */
  apiBase?: string;
  /**
   * Controlled open state. When omitted, the panel reads from the shared
   * useMeridianDevTools hook (localStorage-backed, settable from Settings →
   * Zaawansowane → Dev Tools toggle). When supplied, the parent owns the
   * state and `onOpenChange` MUST be supplied too — otherwise the keyboard
   * shortcut becomes a no-op.
   */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
};

export function MeridianDevTools({
  apiBase = "http://127.0.0.1:8000",
  open,
  onOpenChange,
}: MeridianDevToolsProps) {
  const [hookEnabled, setHookEnabled] = useMeridianDevTools();
  const isControlled = open !== undefined;
  const isOpen = isControlled ? Boolean(open) : hookEnabled;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) {
        onOpenChange?.(next);
      } else {
        setHookEnabled(next);
      }
    },
    [isControlled, onOpenChange, setHookEnabled],
  );

  const [voiceState, setVoiceState] = useState<VoiceState>("listening");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<HealthResult>({ status: "pending" });

  // Keyboard toggle — Ctrl+Shift+D (or Cmd+Shift+D on macOS). Drives the
  // SAME source as the Settings toggle so they stay in sync.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod || !event.shiftKey) return;
      if (event.key !== "D" && event.key !== "d") return;
      event.preventDefault();
      setOpen(!isOpen);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, isOpen]);

  // Token resolution — read from <html>'s computed style so theme overrides
  // (.dark, .theme-*) flow through. Re-runs whenever the panel opens.
  // The setState-in-effect rule fires here because React 19 prefers state
  // derived during render; that's not possible here — getComputedStyle
  // requires a mounted DOM. Defer with rAF so the read happens AFTER paint,
  // avoiding the cascading-render concern the rule guards against.
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const key of TOKEN_KEYS) {
        next[key] = styles.getPropertyValue(key).trim();
      }
      setTokens(next);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen]);

  // Health pinger — polls every 10s while open. AbortController prevents
  // unhandled-rejection noise when the panel closes mid-flight.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function ping() {
      const controller = new AbortController();
      const start = performance.now();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${apiBase}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (cancelled) return;
        if (!res.ok) {
          setHealth({ status: "fail", reason: `HTTP ${res.status}` });
        } else {
          let body: unknown = undefined;
          try { body = await res.json(); } catch { body = undefined; }
          setHealth({ status: "ok", latencyMs: Math.round(performance.now() - start), body });
        }
      } catch (err) {
        clearTimeout(timeout);
        if (cancelled) return;
        setHealth({ status: "fail", reason: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!cancelled) timerId = setTimeout(ping, 10_000);
      }
    }
    void ping();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isOpen, apiBase]);

  const copyDiagnostics = useCallback(async () => {
    const lines: string[] = [];
    lines.push(`MeridianDevTools snapshot @ ${new Date().toISOString()}`);
    lines.push("");
    lines.push("[env]");
    lines.push(`  NODE_ENV  : ${process.env.NODE_ENV ?? "?"}`);
    if (typeof window !== "undefined") {
      lines.push(`  viewport  : ${window.innerWidth}x${window.innerHeight}`);
      lines.push(`  userAgent : ${navigator.userAgent.slice(0, 120)}`);
      const nav = navigator as Navigator & { deviceMemory?: number };
      if (nav.deviceMemory) lines.push(`  deviceMem : ${nav.deviceMemory}GB`);
      lines.push(`  hwCores   : ${navigator.hardwareConcurrency}`);
    }
    lines.push("");
    lines.push("[tokens]");
    for (const key of TOKEN_KEYS) {
      lines.push(`  ${key.padEnd(16)}: ${tokens[key] || "(unresolved)"}`);
    }
    lines.push("");
    lines.push("[api-health]");
    if (health.status === "pending") lines.push("  pending…");
    else if (health.status === "ok") lines.push(`  ok ${health.latencyMs}ms`);
    else lines.push(`  fail: ${health.reason}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      // Clipboard might be blocked (insecure context). Fall back to console.
      console.log(lines.join("\n"));
    }
  }, [tokens, health]);

  if (!isOpen) return null;

  return (
    <div
      role="complementary"
      aria-label="Meridian dev tools"
      data-ox-anim
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: 380,
        maxHeight: "70vh",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "var(--ox-bg1)",
        border: "1px solid var(--ox-border)",
        borderRadius: 10,
        boxShadow: "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,240,255,0.08)",
        overflow: "hidden",
        fontFamily: "var(--ox-font-sans)",
        color: "var(--ox-text-hi)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid var(--ox-border)",
          background: "var(--ox-bg2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--ox-font-mono)",
            fontSize: 11,
            color: "var(--ox-cyan-dim)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span className="ox-status-dot" style={{ background: "var(--ox-cyan)" }} />
          DevTools · Ctrl+Shift+D
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Zamknij dev tools"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ox-text-dim)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
        <DevSection title="Voice state preview">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {VOICE_STATES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setVoiceState(s)}
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  fontFamily: "var(--ox-font-mono)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: voiceState === s ? "var(--ox-bg3)" : "transparent",
                  color: voiceState === s ? "var(--ox-cyan)" : "var(--ox-text-mid)",
                  border: `1px solid ${voiceState === s ? "var(--ox-cyan-dim)" : "var(--ox-border)"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", placeItems: "center", padding: "12px 0" }}>
            <MeridianVoiceOrb state={voiceState} size={120} />
          </div>
        </DevSection>

        <DevSection title="Tokens">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {TOKEN_KEYS.map((key) => {
              const value = tokens[key] || "";
              const isColor = value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl");
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--ox-font-mono)",
                    fontSize: 10,
                    color: "var(--ox-text-mid)",
                  }}
                >
                  {isColor ? (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: value,
                        border: "1px solid var(--ox-border)",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span style={{ width: 10, height: 10, flexShrink: 0 }} />
                  )}
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {key.replace("--ox-", "")}: {value || "?"}
                  </span>
                </div>
              );
            })}
          </div>
        </DevSection>

        <DevSection title="API health">
          <div style={{ fontFamily: "var(--ox-font-mono)", fontSize: 11, color: "var(--ox-text-mid)" }}>
            <div style={{ marginBottom: 4, color: "var(--ox-text-dim)" }}>{apiBase}/health</div>
            {health.status === "pending" ? (
              <span style={{ color: "var(--ox-amber)" }}>● pinging…</span>
            ) : health.status === "ok" ? (
              <span style={{ color: "var(--ox-green)" }}>● ok · {health.latencyMs}ms</span>
            ) : (
              <span style={{ color: "var(--ox-red)" }}>● fail · {health.reason}</span>
            )}
          </div>
        </DevSection>

        <DevSection title="Env">
          <EnvDump />
        </DevSection>

        <button
          type="button"
          onClick={copyDiagnostics}
          style={{
            padding: "6px 8px",
            background: "var(--ox-bg2)",
            border: "1px solid var(--ox-border)",
            borderRadius: 4,
            color: "var(--ox-cyan)",
            fontFamily: "var(--ox-font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Skopiuj diagnostykę
        </button>
      </div>
    </div>
  );
}

function DevSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        style={{
          fontFamily: "var(--ox-font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ox-text-dim)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function EnvDump() {
  const [snapshot, setSnapshot] = useState<{
    env: string;
    viewport: string;
    deviceMemory?: number;
    hwCores: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Defer to next frame so the synchronous-setState-in-effect concern
    // becomes a post-paint update — matches the rule's intent without
    // sacrificing the "read navigator after mount" requirement.
    const rafId = window.requestAnimationFrame(() => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      setSnapshot({
        env: process.env.NODE_ENV ?? "?",
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        deviceMemory: nav.deviceMemory,
        hwCores: navigator.hardwareConcurrency,
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  if (!snapshot) return null;
  return (
    <div style={{ fontFamily: "var(--ox-font-mono)", fontSize: 11, color: "var(--ox-text-mid)", lineHeight: 1.7 }}>
      <div>NODE_ENV · {snapshot.env}</div>
      <div>viewport · {snapshot.viewport}</div>
      <div>cores · {snapshot.hwCores}</div>
      {snapshot.deviceMemory !== undefined ? <div>memory · {snapshot.deviceMemory}GB</div> : null}
    </div>
  );
}
