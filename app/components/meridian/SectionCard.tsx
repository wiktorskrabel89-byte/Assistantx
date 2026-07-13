"use client";

/**
 * SectionCard — the one card primitive every Settings + Workspace sub-section
 * uses. Centralizes the ox-panel surface, header layout, and action-slot so
 * the sub-section files stay tight (no repeated box scaffolding).
 *
 *   ┌─ icon · title ───────────────── actions ─┐
 *   │ optional description line                  │
 *   ├────────────────────────────────────────────┤
 *   │ children                                   │
 *   └────────────────────────────────────────────┘
 *
 * Pure presentation — no state. Token discipline: every colour is --ox-*.
 */

import type { ComponentType, CSSProperties, ReactNode } from "react";

export type LucideIconLike = ComponentType<{ className?: string; style?: CSSProperties }>;

export type SectionCardProps = {
  Icon?: LucideIconLike;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Adds the cyan glow halo around the card. Default false (quiet by default). */
  glow?: boolean;
  className?: string;
};

export function SectionCard({
  Icon,
  title,
  description,
  actions,
  children,
  glow = false,
  className,
}: SectionCardProps) {
  return (
    <section
      className={`ox-panel ${glow ? "ox-glow-cyan" : ""} ${className ?? ""}`.trim()}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14 }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--ox-text-hi)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" style={{ color: "var(--ox-cyan)" }} /> : null}
            <span>{title}</span>
          </div>
          {description ? (
            <span
              style={{
                color: "var(--ox-text-mid)",
                fontFamily: "var(--ox-font-sans)",
                fontSize: 11.5,
                lineHeight: 1.5,
              }}
            >
              {description}
            </span>
          ) : null}
        </div>
        {actions ? <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

/** Small label-above-control wrapper for forms inside cards. */
export function SectionField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          color: "var(--ox-text-mid)",
          fontFamily: "var(--ox-font-mono)",
          fontSize: 10,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span style={{ color: "var(--ox-text-dim)", fontFamily: "var(--ox-font-sans)", fontSize: 11 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
