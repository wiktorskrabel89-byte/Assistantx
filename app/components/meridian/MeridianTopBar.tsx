"use client";

/**
 * MeridianTopBar — 44px fixed top chrome for the Meridian shell.
 *
 * Always visible across Czat / Workspace / Ustawienia. Hosts:
 *   - ◈ Jarvis brand mark (left)
 *   - 3 tab buttons (centre) — never hidden, never re-ordered
 *   - HW status pill (right) — CPU%, RAM Gb, connection dot
 *
 * Token discipline: every color is var(--ox-*); transitions use --ox-ease and
 * --ox-duration-base; the rule .ox-anim / data-ox-anim block in globals.css
 * disables animation under prefers-reduced-motion.
 *
 * The component is presentation-only — the parent owns activeTab state and
 * passes onTabChange. This matches the shell composition snippet in the spec.
 */

import { MeridianStarMark } from "./MeridianStarMark";
import {
  MERIDIAN_TAB_LABELS,
  type MeridianHwStatus,
  type MeridianTab,
} from "./types";

const TAB_ORDER: MeridianTab[] = ["chat", "workspace", "settings"];

const CONNECTION_DOT: Record<NonNullable<MeridianHwStatus["connection"]>, string> = {
  idle: "var(--ox-cyan-dim)",
  degraded: "var(--ox-amber)",
  offline: "var(--ox-red)",
};

const CONNECTION_LABEL: Record<NonNullable<MeridianHwStatus["connection"]>, string> = {
  idle: "Połączono",
  degraded: "Pogorszony",
  offline: "Offline",
};

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function formatRam(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}G`;
}

export type MeridianTopBarProps = {
  activeTab: MeridianTab;
  onTabChange: (tab: MeridianTab) => void;
  hwStatus?: MeridianHwStatus;
};

export function MeridianTopBar({
  activeTab,
  onTabChange,
  hwStatus,
}: MeridianTopBarProps) {
  const connection = hwStatus?.connection ?? "idle";

  return (
    <header
      role="banner"
      data-ox-anim
      style={{
        height: 44,
        background: "var(--ox-bg1)",
        borderBottom: "1px solid var(--ox-border)",
      }}
      className="flex shrink-0 items-center justify-between gap-3 px-3"
    >
      {/* Brand mark — left */}
      <div className="flex items-center gap-2 select-none">
        <span style={{ color: "var(--ox-cyan)" }} aria-hidden="true">
          <MeridianStarMark size={18} />
        </span>
        <span
          style={{
            color: "var(--ox-text-hi)",
            fontFamily: "var(--ox-font-ui)",
            fontSize: 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Jarvis
        </span>
      </div>

      {/* Tab buttons — always 3, always visible */}
      <nav role="tablist" aria-label="Sekcje główne" className="flex items-center gap-1">
        {TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`meridian-panel-${tab}`}
              onClick={() => onTabChange(tab)}
              data-ox-anim
              className="relative px-3 py-1 text-[12px] font-medium"
              style={{
                color: isActive ? "var(--ox-text-hi)" : "var(--ox-text-mid)",
                background: isActive ? "var(--ox-bg3)" : "transparent",
                fontFamily: "var(--ox-font-sans)",
                borderRadius: 6,
                transition:
                  "background var(--ox-duration-base) var(--ox-ease), color var(--ox-duration-base) var(--ox-ease)",
              }}
            >
              {MERIDIAN_TAB_LABELS[tab]}
              {isActive ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 8,
                    right: 8,
                    bottom: -1,
                    height: 1,
                    background: "var(--ox-cyan)",
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* HW status pill — right */}
      <div
        role="status"
        aria-label="Stan systemu"
        className="flex items-center gap-2 px-2 py-1"
        style={{
          background: "var(--ox-bg2)",
          border: "1px solid var(--ox-border)",
          borderRadius: 6,
          fontFamily: "var(--ox-font-mono)",
          fontSize: 10,
          color: "var(--ox-text-mid)",
        }}
      >
        <span>CPU {formatPercent(hwStatus?.cpuPercent)}</span>
        <span style={{ color: "var(--ox-text-dim)" }}>·</span>
        <span>RAM {formatRam(hwStatus?.ramGb)}</span>
        <span
          className="ox-status-dot"
          aria-label={CONNECTION_LABEL[connection]}
          title={CONNECTION_LABEL[connection]}
          style={{ background: CONNECTION_DOT[connection] }}
        />
      </div>
    </header>
  );
}
