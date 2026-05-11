export const DEFAULT_WEB_WAKE_PHRASE = "Hey AssistantX";

export type VoiceProfile = {
  id: string;
  label: string;
  description: string;
  preferredVoiceName: string[];
  rate: number;
  pitch: number;
};

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: "default",
    label: "Default",
    description: "Neutral and clear everyday voice.",
    preferredVoiceName: ["Google US English", "Samantha", "Microsoft Aria", "en-US"],
    rate: 1,
    pitch: 1,
  },
  {
    id: "jarvis",
    label: "JARVIS",
    description: "Deep and authoritative.",
    preferredVoiceName: ["Google UK English Male", "Daniel", "Microsoft David", "en-GB"],
    rate: 0.92,
    pitch: 0.9,
  },
  {
    id: "nova",
    label: "Nova",
    description: "Warm and expressive.",
    preferredVoiceName: ["Google UK English Female", "Serena", "Victoria", "en-GB"],
    rate: 1.02,
    pitch: 1.08,
  },
  {
    id: "echo",
    label: "Echo",
    description: "Crisp and technical.",
    preferredVoiceName: ["Alex", "Microsoft Mark", "Google US English", "en-US"],
    rate: 1.04,
    pitch: 0.98,
  },
  {
    id: "aria",
    label: "Aria",
    description: "Smooth and supportive.",
    preferredVoiceName: ["Aria", "Microsoft Aria", "Samantha", "en-US"],
    rate: 0.98,
    pitch: 1.05,
  },
];

export function getVoiceProfile(voiceId?: string): VoiceProfile {
  return VOICE_PROFILES.find((profile) => profile.id === voiceId) ?? VOICE_PROFILES[0];
}

export function resolveSpeechVoice(
  voices: SpeechSynthesisVoice[],
  voiceId: string | undefined,
  language: string,
): SpeechSynthesisVoice | null {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const profile = getVoiceProfile(voiceId);
  for (const preferred of profile.preferredVoiceName) {
    const match = voices.find((voice) => voice.name.toLowerCase().includes(preferred.toLowerCase()));
    if (match) return match;
  }

  const exactLanguage = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase());
  if (exactLanguage) return exactLanguage;

  const baseLanguage = language.trim().split("-")[0]?.toLowerCase();
  const sameLanguageFamily = baseLanguage
    ? voices.find((voice) => voice.lang.toLowerCase().startsWith(baseLanguage))
    : undefined;
  if (sameLanguageFamily) return sameLanguageFamily;

  return voices[0] ?? null;
}
