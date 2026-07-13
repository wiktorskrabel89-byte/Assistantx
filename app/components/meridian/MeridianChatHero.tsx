"use client";

/**
 * MeridianChatHero — NEW welcome design for the Czat tab's empty state.
 *
 * Not a copy of the reference's top banner. The Czat tab's hero is its own
 * composition that uses the Meridian primitives — VEGA orb (full size,
 * state-animated), a Polish greeting, and three hint cards that prime the
 * user on how to start a conversation. Once the conversation begins, this
 * collapses into the inline VoiceStrip rendered above the chat thread.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │                                                │
 *   │                  [ VEGA orb ]                  │  ← size-160 orb
 *   │            Cześć — jestem Jarvis.              │  ← greeting
 *   │      Powiedz „Hey Jarvis", wpisz polecenie     │  ← sub
 *   │              lub otwórz Workspace.             │
 *   │                                                │
 *   │  ┌─ Hint ─┐  ┌─ Hint ─┐  ┌─ Hint ─┐          │
 *   │  │ Voice  │  │ Type   │  │ Brain  │          │  ← 3 ox-glass cards
 *   │  └────────┘  └────────┘  └────────┘          │
 *   │                                                │
 *   └────────────────────────────────────────────────┘
 *
 * When `state === "idle"` and the user hasn't sent a message, the hero is
 * the centerpiece. When `compact` is true (caller's chat thread has content),
 * it shrinks to a slim header with the orb at 56px, hints hidden, caption
 * inline beside the orb.
 *
 * Renders the orb via MeridianVoiceOrb so the shared animation tokens are
 * the single source of motion — no parallel keyframes here.
 */

import { MessageSquare, Mic, LayoutGrid } from "lucide-react";
import { MeridianVoiceOrb, type VoiceState } from "./MeridianVoiceOrb";

const HINTS: Array<{ Icon: typeof Mic; title: string; body: string }> = [
  {
    Icon: Mic,
    title: "Powiedz „Hey Jarvis”",
    body: "Wake word zawsze nasłuchuje. Wystarczy mówić — bez przycisku.",
  },
  {
    Icon: MessageSquare,
    title: "Wpisz polecenie",
    body: "Czat, kod, research, automatyzacja — wszystko w jednym oknie.",
  },
  {
    Icon: LayoutGrid,
    title: "Otwórz Workspace",
    body: "Projekty, pamięć, lekcje i zaplanowane zadania w jednym miejscu.",
  },
];

export type MeridianChatHeroProps = {
  /** Drives the orb animation. Default "idle" — the welcome state. */
  state?: VoiceState;
  /**
   * When true, render the slim header variant (chat thread has messages).
   * The orb shrinks, hints disappear, greeting becomes a single line.
   */
  compact?: boolean;
  /** Override the user-facing greeting. Defaults to a Polish hello. */
  greeting?: string;
  className?: string;
};

export function MeridianChatHero({
  state = "idle",
  compact = false,
  greeting,
  className,
}: MeridianChatHeroProps) {
  const heading = greeting ?? "Cześć — jestem Jarvis.";

  // Slim header — chat is in progress, the orb gets out of the way.
  if (compact) {
    return (
      <div
        className={className}
        data-vega-state={state}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "var(--ox-bg1)",
          border: "1px solid var(--ox-border)",
          borderRadius: 10,
        }}
      >
        <MeridianVoiceOrb state={state} size={56} hideCaption />
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span
            style={{
              color: "var(--ox-text-hi)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {heading}
          </span>
          <span
            style={{
              color: "var(--ox-text-mid)",
              fontFamily: "var(--ox-font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {state === "idle" ? "Gotowy" : state}
          </span>
        </div>
      </div>
    );
  }

  // Full welcome variant — the centerpiece of the empty Czat tab.
  return (
    <div
      className={className}
      data-vega-state={state}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 28,
        padding: "32px 24px 40px",
      }}
    >
      <MeridianVoiceOrb state={state} size={160} hideCaption />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
        <h2
          style={{
            margin: 0,
            color: "var(--ox-text-hi)",
            fontFamily: "var(--ox-font-sans)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {heading}
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--ox-text-mid)",
            fontFamily: "var(--ox-font-sans)",
            fontSize: 13,
            lineHeight: 1.55,
            maxWidth: 480,
          }}
        >
          Powiedz {"„"}Hey Jarvis{"”"}, wpisz polecenie poniżej lub przejdź do Workspace,
          aby pracować z projektami, pamięcią i lekcjami.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          width: "100%",
          maxWidth: 720,
        }}
      >
        {HINTS.map(({ Icon, title, body }, index) => (
          <HintCard key={title} Icon={Icon} title={title} body={body} index={index} />
        ))}
      </div>
    </div>
  );
}

function HintCard({
  Icon,
  title,
  body,
  index,
}: {
  Icon: typeof Mic;
  title: string;
  body: string;
  index: number;
}) {
  // Per-card shimmer delay — derived from index so the trio pulses in a
  // staggered wave rather than in unison. Deterministic (no Math.random in
  // render — React 19's hooks rule flags impure calls during render).
  const animDelay = `${index * 0.7}s`;
  return (
    <div
      className="ox-glass ox-glow-cyan"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "14px 14px",
        borderRadius: 10,
        animation: "vega-idle-pulse 4s var(--ox-ease) infinite",
        animationDelay: animDelay,
      }}
    >
      <Icon className="h-4 w-4" style={{ color: "var(--ox-cyan)" }} />
      <div
        style={{
          color: "var(--ox-text-hi)",
          fontFamily: "var(--ox-font-sans)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "var(--ox-text-mid)",
          fontFamily: "var(--ox-font-sans)",
          fontSize: 11.5,
          lineHeight: 1.5,
        }}
      >
        {body}
      </div>
    </div>
  );
}
