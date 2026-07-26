"use client";

import { useEffect, useState } from "react";

type Copy = { eyebrow: string; label: string; days: string; hours: string; minutes: string; seconds: string; live: string };
const COPY: Record<"en" | "pl", Copy> = {
  en: {
    eyebrow: "Launch",
    label: "AssistantX unlocks in",
    days: "days",
    hours: "hours",
    minutes: "min",
    seconds: "sec",
    live: "We&apos;re live — sign up above",
  },
  pl: {
    eyebrow: "Premiera",
    label: "AssistantX odblokuje się za",
    days: "dni",
    hours: "godz",
    minutes: "min",
    seconds: "sek",
    live: "Już działamy — dołącz powyżej",
  },
};

function diffParts(target: number, now: number) {
  const rawMs = Math.max(0, target - now);
  const s = Math.floor(rawMs / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return { days, hours, minutes, seconds, ended: rawMs === 0 };
}

function Tile({ value, label }: { value: number; label: string }) {
  const padded = value.toString().padStart(2, "0");
  return (
    <div className="min-w-[68px] flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-center backdrop-blur-sm">
      <p className="tabular-nums font-black text-2xl sm:text-3xl bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
        {padded}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-white/40">{label}</p>
    </div>
  );
}

export function LaunchCountdown({ targetIso, lang = "en" }: { targetIso: string; lang?: "en" | "pl" }) {
  const target = new Date(targetIso).getTime();
  const valid = Number.isFinite(target) && target > 0;

  const [parts, setParts] = useState(() => diffParts(target, Date.now()));

  useEffect(() => {
    if (!valid) return;
    const t = setInterval(() => setParts(diffParts(target, Date.now())), 1000);
    return () => clearInterval(t);
  }, [target, valid]);

  if (!valid) return null;
  const copy = COPY[lang] ?? COPY.en;

  return (
    <div className="mt-8 flex flex-col items-center gap-3 hero-scroll">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-300/70">
        {copy.eyebrow}
      </p>
      {parts.ended ? (
        <p
          className="text-sm text-white/70"
          dangerouslySetInnerHTML={{ __html: copy.live }}
        />
      ) : (
        <>
          <p className="text-xs text-white/50">{copy.label}</p>
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <Tile value={parts.days} label={copy.days} />
            <Tile value={parts.hours} label={copy.hours} />
            <Tile value={parts.minutes} label={copy.minutes} />
            <Tile value={parts.seconds} label={copy.seconds} />
          </div>
        </>
      )}
    </div>
  );
}
