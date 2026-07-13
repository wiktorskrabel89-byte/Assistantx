"use client";

/**
 * Settings → O programie. Version row, hardware profile (browser-detectable
 * subset — full GPU/VRAM detection lives in the desktop app), installed
 * models list (the Modele section's assignments mirrored read-only), license.
 */

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "../SectionCard";

type HardwareSnapshot = {
  cores: number;
  deviceMemoryGb: number | null;
  userAgent: string;
  language: string;
  platform: string;
};

const CURRENT_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

export function AboutSection() {
  const [hw, setHw] = useState<HardwareSnapshot | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      setHw({
        cores: navigator.hardwareConcurrency || 0,
        deviceMemoryGb: nav.deviceMemory ?? null,
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform || "?",
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard Icon={Info} title="Wersja" description="Build aktualnej sesji.">
        <DefList
          rows={[
            ["Produkt", "Jarvis (AssistantX)"],
            ["Build", CURRENT_VERSION],
            ["Środowisko", String(process.env.NODE_ENV ?? "?")],
          ]}
        />
      </SectionCard>

      <SectionCard title="Profil sprzętu" description="To, co przeglądarka pozwala wyczytać. Pełen profil GPU/VRAM jest w wersji desktop.">
        {hw ? (
          <DefList
            rows={[
              ["Rdzenie CPU", String(hw.cores || "?")],
              ["Pamięć urządzenia", hw.deviceMemoryGb !== null ? `${hw.deviceMemoryGb} GB` : "nieznana"],
              ["Język systemu", hw.language],
              ["Platforma", hw.platform],
              ["User agent", hw.userAgent],
            ]}
          />
        ) : (
          <div style={{ color: "var(--ox-text-dim)", fontFamily: "var(--ox-font-mono)", fontSize: 11 }}>
            Wczytuję snapshot sprzętu…
          </div>
        )}
      </SectionCard>

      <SectionCard title="Licencja" description="Kod stack-u jest własnościowy. Komponenty open-source — patrz package.json.">
        <p style={{ margin: 0, color: "var(--ox-text-mid)", fontFamily: "var(--ox-font-sans)", fontSize: 12, lineHeight: 1.6 }}>
          {"© "}
          {new Date().getFullYear()}
          {" AssistantX. Wszelkie prawa zastrzeżone."}
        </p>
      </SectionCard>
    </div>
  );
}

function DefList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl
      style={{
        margin: 0,
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        rowGap: 6,
        columnGap: 14,
        fontFamily: "var(--ox-font-mono)",
        fontSize: 11,
      }}
    >
      {rows.map(([k, v]) => (
        <>
          <dt
            key={`k-${k}`}
            style={{ color: "var(--ox-text-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            {k}
          </dt>
          <dd
            key={`v-${k}`}
            style={{
              margin: 0,
              color: "var(--ox-text-hi)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {v || "—"}
          </dd>
        </>
      ))}
    </dl>
  );
}
