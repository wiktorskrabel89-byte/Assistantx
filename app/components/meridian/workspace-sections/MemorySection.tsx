"use client";

/**
 * Workspace → Pamięć. Real, wired to Memory V1.
 *
 *   5 buckets: Preferences · Custom Instructions · Project Knowledge ·
 *              Conversation Memory · Long Term Memory
 *
 * This screen is the user's view into what Jarvis remembers about THEM
 * (strict separation from the Knowledge store). Read-mostly with two
 * write actions:
 *   • Add a long-term note ("Remember this:")
 *   • Wipe everything (with confirm)
 */

import { Brain, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionCard, SectionField } from "../SectionCard";
import {
  forgetLongTerm,
  rememberLongTerm,
  readMemory,
  wipeMemory,
  type MemoryV1Schema,
} from "../../../lib/memory-v1";

export function MemorySection() {
  const [snapshot, setSnapshot] = useState<MemoryV1Schema | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => setSnapshot(readMemory()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => setSnapshot(readMemory()));
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handleRemember = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    rememberLongTerm({ kind: "note", text });
    setDraft("");
    refresh();
  }, [draft, refresh]);

  const handleForget = useCallback(
    (id: string) => {
      forgetLongTerm(id);
      refresh();
    },
    [refresh],
  );

  const handleWipe = useCallback(() => {
    if (typeof window === "undefined") return;
    const ok = window.confirm("Wymazać CAŁĄ pamięć? Tej operacji nie da się cofnąć.");
    if (!ok) return;
    wipeMemory();
    refresh();
  }, [refresh]);

  if (!snapshot) {
    return (
      <div style={{ color: "var(--ox-text-dim)", fontFamily: "var(--ox-font-mono)", fontSize: 11 }}>
        Wczytuję pamięć…
      </div>
    );
  }

  const prefCount = Object.keys(snapshot.preferences).length;
  const projectCount = Object.keys(snapshot.projectKnowledge).length;
  const ltm = snapshot.longTermMemory;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard
        Icon={Brain}
        title="Wskaźniki"
        description="Co aktualnie żyje w pamięci użytkownika. Wiedza ogólna jest w osobnym sklepie."
        actions={
          <button type="button" onClick={handleWipe} style={dangerButtonStyle}>
            <Trash2 className="h-3 w-3" />
            {"Wymaż wszystko"}
          </button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <Stat label="Preferencje" value={prefCount} />
          <Stat label="Projekty" value={projectCount} />
          <Stat label="Konwersacje" value={snapshot.conversationMemory.length} cap={500} />
          <Stat label="Long-term" value={ltm.length} cap={2000} />
        </div>
      </SectionCard>

      <SectionCard title="Dodaj wpis długoterminowy" description="Trafia do Long Term Memory; router może go przywołać przy podobnym pytaniu.">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRemember();
            }}
            placeholder="np. „Zawsze odpowiadaj zwięźle”"
            style={inputStyle}
          />
          <button type="button" onClick={handleRemember} style={primaryButtonStyle}>
            <Plus className="h-3 w-3" />
            {"Zapamiętaj"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={`Long-term memory · ${ltm.length}`} description="Najnowsze na górze.">
        {ltm.length === 0 ? (
          <div style={{ color: "var(--ox-text-dim)", fontFamily: "var(--ox-font-sans)", fontSize: 12 }}>
            Brak wpisów. Dodaj pierwszy powyżej.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {[...ltm].reverse().slice(0, 25).map((entry) => (
              <li
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--ox-border)",
                  background: "var(--ox-bg2)",
                }}
              >
                <span
                  style={{
                    color: "var(--ox-cyan)",
                    fontFamily: "var(--ox-font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                    minWidth: 56,
                  }}
                >
                  {entry.kind}
                </span>
                <span style={{ flex: 1, color: "var(--ox-text-hi)", fontSize: 13 }}>{entry.text}</span>
                <button
                  type="button"
                  onClick={() => handleForget(entry.id)}
                  aria-label={`Usuń wpis: ${entry.text}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--ox-text-dim)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Custom instructions" description="Stały kontekst dla każdej rozmowy.">
        <SectionField label="System prompt">
          <div
            style={{
              padding: 10,
              border: "1px solid var(--ox-border)",
              borderRadius: 6,
              background: "var(--ox-bg2)",
              color: snapshot.customInstructions.systemPrompt ? "var(--ox-text-hi)" : "var(--ox-text-dim)",
              fontFamily: "var(--ox-font-mono)",
              fontSize: 11.5,
              minHeight: 60,
              whiteSpace: "pre-wrap",
            }}
          >
            {snapshot.customInstructions.systemPrompt || "(pusty — edycja w follow-on)"}
          </div>
        </SectionField>
      </SectionCard>
    </div>
  );
}

function Stat({ label, value, cap }: { label: string; value: number; cap?: number }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--ox-border)",
        background: "var(--ox-bg2)",
      }}
    >
      <div
        style={{
          color: "var(--ox-text-dim)",
          fontFamily: "var(--ox-font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ color: "var(--ox-cyan)", fontFamily: "var(--ox-font-mono)", fontSize: 18, fontWeight: 700, marginTop: 2 }}>
        {value}
        {cap !== undefined ? (
          <span style={{ color: "var(--ox-text-dim)", fontSize: 11, fontWeight: 400 }}> / {cap}</span>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  background: "var(--ox-bg3)",
  border: "1px solid var(--ox-border)",
  borderRadius: 6,
  color: "var(--ox-text-hi)",
  fontFamily: "var(--ox-font-sans)",
  fontSize: 13,
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  background: "var(--ox-cyan)",
  border: "1px solid var(--ox-cyan)",
  borderRadius: 6,
  color: "var(--ox-bg)",
  fontFamily: "var(--ox-font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontWeight: 700,
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
