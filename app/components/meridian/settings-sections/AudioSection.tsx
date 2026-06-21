"use client";

/**
 * Settings → Audio. Microphone device, noise cancellation toggle, wake-word
 * sensitivity slider, voice mode (Wake / PTT / Always Listening), and a
 * live waveform stub. All values persist via Memory V1 preferences so they
 * survive reloads.
 *
 * Per design rule 6: no mic button in chat UI. PTT lives here as a setting.
 */

import { Mic, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard, SectionField } from "../SectionCard";
import { getPreference, setPreference } from "../../../lib/memory-v1";

type VoiceMode = "wake-word" | "push-to-talk" | "always-listening";

const PREF = {
  device: "audio.deviceId",
  noiseSuppression: "audio.noiseSuppression",
  echoCancellation: "audio.echoCancellation",
  wakeSensitivity: "audio.wakeSensitivity",
  voiceMode: "audio.voiceMode",
} as const;

export function AudioSection() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [wakeSensitivity, setWakeSensitivity] = useState<number>(50);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("wake-word");

  // Hydrate prefs after mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => {
      setDeviceId(String(getPreference<string>(PREF.device, "") ?? ""));
      setNoiseSuppression(getPreference<boolean>(PREF.noiseSuppression, true) ?? true);
      setEchoCancellation(getPreference<boolean>(PREF.echoCancellation, true) ?? true);
      const s = Number(getPreference<number>(PREF.wakeSensitivity, 50) ?? 50);
      setWakeSensitivity(Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : 50);
      const m = getPreference<string>(PREF.voiceMode, "wake-word");
      setVoiceMode(
        m === "push-to-talk" || m === "always-listening" || m === "wake-word"
          ? (m as VoiceMode)
          : "wake-word",
      );
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Enumerate mic devices (no permission needed for labels until granted,
  // but the list is still useful — Chrome shows generic labels pre-permission).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return;
        setDevices(all.filter((d) => d.kind === "audioinput"));
      })
      .catch(() => {
        /* not supported / blocked — leave list empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard
        Icon={Mic}
        title="Mikrofon"
        description="Urządzenie wejściowe, redukcja szumów i echo. Bez przycisku mikrofonu w czacie — aktywacja przez wake word."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SectionField label="Urządzenie wejściowe">
            <select
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setPreference(PREF.device, e.target.value);
              }}
              style={selectStyle}
            >
              <option value="">Domyślne urządzenie systemu</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mikrofon · ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </SectionField>

          <SectionField label="Tryb głosu">
            <select
              value={voiceMode}
              onChange={(e) => {
                const m = e.target.value as VoiceMode;
                setVoiceMode(m);
                setPreference(PREF.voiceMode, m);
              }}
              style={selectStyle}
            >
              <option value="wake-word">Wake Word („Hey Jarvis”)</option>
              <option value="push-to-talk">Push-To-Talk (klawisz)</option>
              <option value="always-listening">Always Listening (eksperymentalne)</option>
            </select>
          </SectionField>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <label style={toggleRowStyle}>
            <span style={toggleLabelStyle}>Redukcja szumów (RNNoise / WebRTC NS)</span>
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(e) => {
                setNoiseSuppression(e.target.checked);
                setPreference(PREF.noiseSuppression, e.target.checked);
              }}
            />
          </label>
          <label style={toggleRowStyle}>
            <span style={toggleLabelStyle}>Echo cancellation (wycisz mikrofon podczas TTS)</span>
            <input
              type="checkbox"
              checked={echoCancellation}
              onChange={(e) => {
                setEchoCancellation(e.target.checked);
                setPreference(PREF.echoCancellation, e.target.checked);
              }}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        Icon={Activity}
        title="Czułość wake-word"
        description={`Niższa wartość = mniej fałszywych alarmów. Aktualnie: ${wakeSensitivity}%`}
      >
        <SectionField label="Próg detekcji" hint="Po Phase 9 podpięte do OpenWakeWord / porcupine-web.">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={wakeSensitivity}
            onChange={(e) => {
              const v = Number(e.target.value);
              setWakeSensitivity(v);
              setPreference(PREF.wakeSensitivity, v);
            }}
            style={{ width: "100%", accentColor: "var(--ox-cyan)" }}
          />
        </SectionField>

        {/* Live waveform stub — CSS-driven bars until Web Audio AnalyserNode lands. */}
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 36,
            marginTop: 8,
            padding: "8px 10px",
            background: "var(--ox-bg2)",
            border: "1px solid var(--ox-border)",
            borderRadius: 6,
            justifyContent: "center",
          }}
          className="ox-glass"
        >
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="vega-bar"
              style={{
                width: 3,
                height: "30%",
                background: "var(--ox-cyan)",
                borderRadius: 1.5,
                boxShadow: "0 0 4px rgba(0,240,255,0.4)",
                transformOrigin: "bottom",
                animation: `vega-bar-dance ${0.85 + (i % 7) * 0.06}s var(--ox-ease) ${i * -0.04}s infinite`,
              }}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--ox-bg3)",
  border: "1px solid var(--ox-border)",
  borderRadius: 6,
  color: "var(--ox-text-hi)",
  fontFamily: "var(--ox-font-sans)",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};

const toggleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--ox-border)",
  background: "var(--ox-bg2)",
  cursor: "pointer",
};

const toggleLabelStyle: React.CSSProperties = {
  color: "var(--ox-text-hi)",
  fontFamily: "var(--ox-font-sans)",
  fontSize: 13,
};
