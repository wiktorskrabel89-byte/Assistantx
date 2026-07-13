"use client";

/**
 * MeridianVoiceOrb — VEGA-style orb that lives in the Czat tab and renders
 * the active voice state. State machine matches the reference's 5 cards:
 *
 *   idle       → dim star, slow 3s pulse, no rings, no bars
 *   wake       → 2 expanding cyan rings + glow ramp + small bar shimmer
 *   listening  → 4 staggered concentric rings + real-time FFT-style bars (cyan)
 *   processing → 3 spinning purple rings, rotating border, no bars
 *   speaking   → green halo + TTS waveform-style bars
 *
 * Animations live in globals.css (vega-idle-pulse, vega-ring-expand,
 * vega-spin, vega-bar-dance, vega-bar-wave). Bars are pseudo-FFT for the
 * skeleton stage — Step 9 will pipe real Web Audio AnalyserNode data via
 * the `bars` prop, replacing the CSS-driven heights.
 *
 * Token discipline: every color is var(--ox-*); reduced-motion handled by the
 * global rule in globals.css ([data-vega-state] * { animation: none }).
 */

import type { CSSProperties } from "react";
import { MeridianStarMark } from "./MeridianStarMark";

export type VoiceState = "idle" | "wake" | "listening" | "processing" | "speaking";

export type MeridianVoiceOrbProps = {
  state: VoiceState;
  /**
   * Optional live FFT amplitudes (0..1, one per bar). When provided overrides
   * the CSS-driven dance and renders true mic data. Length determines bar
   * count; safe range 8–24.
   */
  bars?: number[];
  /** Caption shown under the orb. Defaults to a Polish label per state. */
  caption?: string;
  /** When true, suppresses the caption entirely (and its reserved height). */
  hideCaption?: boolean;
  /** Outer diameter in px. Default 160. */
  size?: number;
  className?: string;
};

const DEFAULT_CAPTION: Record<VoiceState, string> = {
  idle: "Wake word wyłączony",
  wake: "Hey Jarvis",
  listening: "Słucham…",
  processing: "Myślę…",
  speaking: "Odpowiadam…",
};

/** Token map per state — drives ring/bar/glow colours via CSS variables. */
const STATE_COLOR: Record<VoiceState, { core: string; ring: string; bar: string; glow: string }> = {
  idle:       { core: "var(--ox-text-dim)",   ring: "transparent",        bar: "var(--ox-text-dim)",  glow: "transparent" },
  wake:       { core: "var(--ox-cyan)",       ring: "var(--ox-cyan)",      bar: "var(--ox-cyan)",      glow: "rgba(0,240,255,0.35)" },
  listening:  { core: "var(--ox-cyan)",       ring: "var(--ox-cyan-dim)",  bar: "var(--ox-cyan)",      glow: "rgba(0,240,255,0.22)" },
  processing: { core: "var(--ox-purple)",     ring: "var(--ox-purple)",    bar: "var(--ox-purple-dim)", glow: "rgba(120,80,220,0.30)" },
  speaking:   { core: "var(--ox-green)",      ring: "var(--ox-green)",     bar: "var(--ox-green)",     glow: "rgba(80,220,120,0.30)" },
};

const DEFAULT_BAR_COUNT = 16;

function ringCount(state: VoiceState): number {
  if (state === "wake") return 2;
  if (state === "listening") return 4;
  if (state === "processing") return 3;
  return 0;
}

function isBarsState(state: VoiceState): boolean {
  return state === "wake" || state === "listening" || state === "speaking";
}

export function MeridianVoiceOrb({
  state,
  bars,
  caption,
  hideCaption = false,
  size = 160,
  className,
}: MeridianVoiceOrbProps) {
  const colors = STATE_COLOR[state];
  const rings = ringCount(state);
  const showBars = isBarsState(state);
  const barCount = bars?.length ?? DEFAULT_BAR_COUNT;
  const barAnim = state === "speaking" ? "vega-bar-wave" : "vega-bar-dance";

  return (
    <div
      data-vega-state={state}
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      {/* Orb — concentric stack: rings (absolute) + star (relative) */}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
          // The radial glow halo behind the star (purple for processing,
          // cyan/green for the rest). Painted as a soft radial background.
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 65%)`,
          borderRadius: "50%",
        }}
      >
        {/* Expanding / spinning rings layer */}
        {Array.from({ length: rings }).map((_, i) => {
          const isSpinning = state === "processing";
          const ringStyle: CSSProperties = {
            position: "absolute",
            inset: "20%",
            borderRadius: "50%",
            border: `1px solid ${colors.ring}`,
            pointerEvents: "none",
            transformOrigin: "center",
            animationTimingFunction: "var(--ox-ease)",
            animationIterationCount: "infinite",
            animationName: isSpinning ? "vega-spin" : "vega-ring-expand",
            animationDuration: isSpinning ? `${2 + i * 0.6}s` : `${2.4}s`,
            animationDelay: isSpinning ? `${i * -0.3}s` : `${i * (state === "wake" ? 0.6 : 0.45)}s`,
            opacity: isSpinning ? 0.55 : 1,
          };
          // Spinning rings keep static size — use a fixed inset variation per
          // index so each ring sits at a different radius.
          if (isSpinning) {
            const inset = 12 + i * 8;
            ringStyle.inset = `${inset}%`;
          }
          return <span key={`vega-ring-${i}`} className="vega-ring" style={ringStyle} />;
        })}

        {/* Star core. Idle gets the slow pulse; other states keep it steady  */}
        {/* so the rings and bars carry the motion.                           */}
        <div
          style={{
            color: colors.core,
            filter:
              state === "idle"
                ? "drop-shadow(0 0 6px rgba(70,79,94,0.4))"
                : `drop-shadow(0 0 12px ${colors.glow})`,
            animation:
              state === "idle"
                ? "vega-idle-pulse 3s var(--ox-ease) infinite"
                : undefined,
            transformOrigin: "center",
          }}
        >
          <MeridianStarMark
            size={Math.round(size * 0.6)}
            withHalo
            haloOpacity={state === "idle" ? 0.12 : 0.28}
          />
        </div>
      </div>

      {/* FFT-style bars under the orb. Skipped for idle + processing. */}
      {showBars ? (
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 3,
            height: 28,
            width: size * 0.95,
            justifyContent: "center",
          }}
        >
          {Array.from({ length: barCount }).map((_, i) => {
            const live = bars?.[i];
            const baseHeight = live !== undefined ? `${Math.max(2, live * 100)}%` : "30%";
            const inlineStyle: CSSProperties = {
              width: 3,
              height: baseHeight,
              borderRadius: 2,
              background: colors.bar,
              boxShadow: `0 0 6px ${colors.glow}`,
              transformOrigin: "bottom",
              animation:
                live === undefined
                  ? `${barAnim} ${0.9 + (i % 5) * 0.07}s var(--ox-ease) ${i * -0.06}s infinite`
                  : undefined,
            };
            return <span key={`vega-bar-${i}`} className="vega-bar" style={inlineStyle} />;
          })}
        </div>
      ) : (
        // Reserve vertical space so layout doesn't jitter when bars appear.
        <div aria-hidden="true" style={{ height: 28 }} />
      )}

      {/* Caption */}
      {hideCaption ? null : (
        <div
          style={{
            color: state === "idle" ? "var(--ox-text-dim)" : "var(--ox-text-hi)",
            fontFamily: "var(--ox-font-sans)",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {caption ?? DEFAULT_CAPTION[state]}
        </div>
      )}
    </div>
  );
}
