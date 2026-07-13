"use client";

/**
 * Workspace → Umiejętności. Real, wired to Skill Confidence store.
 *
 * Lists every tracked skill with: confidence score, success rate, usage
 * count, runtime average. Sorted by confidence descending (matches how the
 * router will pick when two skills could handle the same request).
 *
 * Empty state shows a one-line explanation + a "log demo skill" button so
 * the panel is exercise-able before any real skill executions land.
 */

import { Zap, Trash2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "../SectionCard";
import {
  computeConfidence,
  rankSkills,
  trackSkillSuccess,
  trackSkillFailure,
  wipeSkills,
  type SkillStats,
} from "../../../lib/skill-confidence";

type Row = { id: string; stats: SkillStats; confidence: number };

const DEMO_SKILLS = [
  "build-landing-page",
  "summarize-research",
  "fix-typescript-error",
];

export function SkillsSection() {
  const [rows, setRows] = useState<Row[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => setRows(rankSkills()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => setRows(rankSkills()));
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const seedDemo = useCallback(() => {
    // Build a varied demo dataset so the panel shows the sort order in action.
    trackSkillSuccess("build-landing-page", 12_400);
    trackSkillSuccess("build-landing-page", 9_800);
    trackSkillSuccess("build-landing-page", 11_300);
    trackSkillFailure("build-landing-page", 4_500);
    trackSkillSuccess("summarize-research", 3_100);
    trackSkillSuccess("summarize-research", 2_900);
    trackSkillFailure("fix-typescript-error", 6_000);
    trackSkillSuccess("fix-typescript-error", 5_200);
    refresh();
  }, [refresh]);

  const handleWipe = useCallback(() => {
    if (typeof window === "undefined") return;
    const ok = window.confirm("Wyczyścić wszystkie wskaźniki umiejętności?");
    if (!ok) return;
    wipeSkills();
    refresh();
  }, [refresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard
        Icon={Zap}
        title="Confidence ranking"
        description="Router preferuje wyższą pewność. Recency-weighted (świeższe sukcesy ważą więcej)."
        actions={
          rows.length > 0 ? (
            <button type="button" onClick={handleWipe} style={dangerButtonStyle}>
              <Trash2 className="h-3 w-3" />
              {"Wymaż"}
            </button>
          ) : (
            <button type="button" onClick={seedDemo} style={primaryButtonStyle}>
              <Sparkles className="h-3 w-3" />
              {"Dodaj demo"}
            </button>
          )
        }
      >
        {rows.length === 0 ? (
          <div
            className="ox-glass"
            style={{
              padding: "20px 16px",
              borderRadius: 8,
              textAlign: "center",
              color: "var(--ox-text-mid)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            Brak wpisów. Skille będą trafiać tutaj automatycznie po pierwszych egzekucjach
            ({DEMO_SKILLS.length === 3 ? `np. ${DEMO_SKILLS.join(", ")}` : null}).
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map(({ id, stats, confidence }) => (
              <SkillRow key={id} id={id} stats={stats} confidence={confidence} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SkillRow({ id, stats, confidence }: Row) {
  const total = stats.successCount + stats.failureCount;
  const successPct = total > 0 ? Math.round((stats.successCount / total) * 100) : 0;
  const avgRuntime = stats.usageCount > 0 ? Math.round(stats.totalRuntimeMs / stats.usageCount) : 0;
  const confidencePct = Math.round(confidence * 100);
  const confidenceColor =
    confidence > 0.75 ? "var(--ox-green)" : confidence > 0.4 ? "var(--ox-cyan)" : "var(--ox-amber)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto auto",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--ox-border)",
        background: "var(--ox-bg2)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            color: "var(--ox-text-hi)",
            fontFamily: "var(--ox-font-mono)",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {id}
        </span>
        <span style={{ color: "var(--ox-text-dim)", fontFamily: "var(--ox-font-mono)", fontSize: 10 }}>
          ostatni wynik · {stats.lastOutcome ?? "—"}
        </span>
      </div>
      <Metric label="Pewność" value={`${confidencePct}%`} accent={confidenceColor} bold />
      <Metric label="Sukces" value={`${successPct}%`} />
      <Metric label="Użycia" value={String(stats.usageCount)} />
      <Metric label="Avg t" value={avgRuntime > 0 ? `${(avgRuntime / 1000).toFixed(1)}s` : "—"} />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 56 }}>
      <span
        style={{
          color: "var(--ox-text-dim)",
          fontFamily: "var(--ox-font-mono)",
          fontSize: 9,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: accent ?? "var(--ox-text-hi)",
          fontFamily: "var(--ox-font-mono)",
          fontSize: bold ? 14 : 12,
          fontWeight: bold ? 700 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// Re-export computeConfidence so consumers can derive their own scores
// without a duplicate import; not strictly used by the section itself.
export { computeConfidence };

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  background: "var(--ox-bg3)",
  border: "1px solid var(--ox-cyan-dim)",
  borderRadius: 6,
  color: "var(--ox-cyan)",
  fontFamily: "var(--ox-font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  background: "transparent",
  border: "1px solid var(--ox-red)",
  borderRadius: 6,
  color: "var(--ox-red)",
  fontFamily: "var(--ox-font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};
