"use client";

import type { ReactNode } from "react";

const LIME = "#d7fa8a";

/** Small lime pill used to label each section ("THE PROBLEM", "THE SOLUTION", ...). */
export function SectionKicker({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em]"
      style={{ borderColor: "rgba(215,250,138,0.3)", color: LIME, background: "rgba(215,250,138,0.05)" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: LIME, boxShadow: `0 0 6px ${LIME}` }} />
      {children}
    </span>
  );
}

/** Standard section heading: kicker + title + optional subtitle. */
export function SectionHeading({
  kicker,
  title,
  subtitle,
  className = "",
  center = false,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  className?: string;
  center?: boolean;
}) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""} ${className}`}>
      <SectionKicker>{kicker}</SectionKicker>
      <h2
        className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl"
        style={{ letterSpacing: "-0.03em" }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-base leading-7" style={{ color: "rgba(245,245,240,0.55)" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** Dark glass card with subtle border, hover-lift, and optional accent glow. */
export function Card({
  children,
  className = "",
  accent = LIME,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-0.5 ${className}`}
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.025)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${accent}55`;
        e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${accent}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.4)";
      }}
    >
      {children}
    </div>
  );
}

/** Monospace terminal-style code block used for log/CLI snippets. */
export function Terminal({ lines, className = "" }: { lines: string[]; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 font-mono text-[11px] leading-6 sm:text-xs ${className}`}
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.5)" }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ color: line.startsWith("✓") ? LIME : "rgba(215,250,138,0.7)" }}>
          {line}
          {i === lines.length - 1 ? (
            <span
              className="ml-1 inline-block h-3 w-1.5 align-middle"
              style={{ background: LIME, animation: "terminal-blink 1s steps(1) infinite" }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Soft radial glow blob for decorative section backgrounds. */
export function GlowOrb({ className = "", color = "rgba(215,250,138,0.16)" }: { className?: string; color?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full ${className}`}
      style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
    />
  );
}
