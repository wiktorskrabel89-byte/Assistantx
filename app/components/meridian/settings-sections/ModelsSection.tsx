"use client";

/**
 * Settings → Modele. The 6-lane router config UI per spec.
 *
 *   Chat              · cheap conversational
 *   Coding            · standard code generation
 *   Coding Extended   · hard algorithms, refactors, architecture
 *   Reasoning         · deep research, multi-step CoT
 *   Vision            · screen / image context (auto-activated)
 *   Supervisor        · routes requests, estimates cost + runtime
 *
 * UI only this turn — actual routing logic (Step 9 AI systems) reads these
 * preferences but isn't implemented. The Memory V1 preference keys are the
 * stable contract the router will consume.
 */

import { Cpu, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard, SectionField } from "../SectionCard";
import { getPreference, setPreference } from "../../../lib/memory-v1";

type LaneId = "chat" | "coding" | "coding-extended" | "reasoning" | "vision" | "supervisor";

type LaneDef = {
  id: LaneId;
  label: string;
  description: string;
  prefKey: string;
  defaultModel: string;
};

const LANES: LaneDef[] = [
  { id: "chat",            label: "Chat Model",           description: "Codzienna konwersacja, lekkie zadania.", prefKey: "models.chat",          defaultModel: "google/gemini-2.5-flash" },
  { id: "coding",          label: "Coding Model",         description: "Standardowe zadania programistyczne.", prefKey: "models.coding",        defaultModel: "qwen/qwen3-32b" },
  { id: "coding-extended", label: "Coding Extended",      description: "Złożone algorytmy, refactoring, architektura.", prefKey: "models.codingExtended", defaultModel: "openai/gpt-oss-120b:free" },
  { id: "reasoning",       label: "Reasoning Model",      description: "Deep research, multi-step thinking, chain-of-thought.", prefKey: "models.reasoning",     defaultModel: "deepseek/deepseek-r1" },
  { id: "vision",          label: "Vision Model",         description: "Zrzuty ekranu, obrazy — aktywowany automatycznie.", prefKey: "models.vision",        defaultModel: "meta-llama/llama-4-scout" },
  { id: "supervisor",      label: "Supervisor Model",     description: "Wybiera model, oszacowuje koszt i runtime, routuje agentów.", prefKey: "models.supervisor",    defaultModel: "openai/gpt-oss-120b:free" },
];

const MODEL_CATALOGUE = [
  "google/gemini-2.5-flash",
  "qwen/qwen3-32b",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-4-scout",
  "deepseek/deepseek-r1",
  "anthropic/claude-haiku-4.5",
  "groq/llama-3.3-70b",
  "ollama/qwen2.5-coder:14b",
];

export function ModelsSection() {
  const [assignments, setAssignments] = useState<Record<LaneId, string>>({
    chat: "",
    coding: "",
    "coding-extended": "",
    reasoning: "",
    vision: "",
    supervisor: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => {
      const next: Record<LaneId, string> = { ...assignments };
      for (const lane of LANES) {
        next[lane.id] = String(getPreference<string>(lane.prefKey, lane.defaultModel) ?? lane.defaultModel);
      }
      setAssignments(next);
    });
    return () => window.cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLane(id: LaneId, model: string) {
    setAssignments((prev) => ({ ...prev, [id]: model }));
    const def = LANES.find((l) => l.id === id);
    if (def) setPreference(def.prefKey, model);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard
        Icon={Cpu}
        title="Router 6-lane"
        description="Przypisz model do każdej ścieżki. Router (Phase 9) odczyta te wartości i pokieruje zapytania."
        glow
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {LANES.map((lane) => (
            <SectionField key={lane.id} label={lane.label} hint={lane.description}>
              <select
                value={assignments[lane.id]}
                onChange={(e) => updateLane(lane.id, e.target.value)}
                style={{
                  padding: "8px 10px",
                  background: "var(--ox-bg3)",
                  border: "1px solid var(--ox-border)",
                  borderRadius: 6,
                  color: "var(--ox-text-hi)",
                  fontFamily: "var(--ox-font-mono)",
                  fontSize: 12,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {MODEL_CATALOGUE.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {/* Allow current value even if not in catalogue (router override). */}
                {!MODEL_CATALOGUE.includes(assignments[lane.id]) && assignments[lane.id] ? (
                  <option value={assignments[lane.id]}>{assignments[lane.id]}</option>
                ) : null}
              </select>
            </SectionField>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        Icon={Sparkles}
        title="Tryb optymalizacji kosztów"
        description="Phase 9 — Supervisor wybierze dostawcę zgodnie z trybem."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["cheapest", "fastest", "best-quality", "balanced"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled
              style={{
                padding: "6px 12px",
                background: "var(--ox-bg2)",
                border: "1px solid var(--ox-border)",
                borderRadius: 6,
                color: "var(--ox-text-dim)",
                fontFamily: "var(--ox-font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "not-allowed",
                opacity: 0.6,
              }}
            >
              {mode === "cheapest" ? "Najtaniej" : mode === "fastest" ? "Najszybciej" : mode === "best-quality" ? "Najlepsza jakość" : "Zbalansowany"}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
