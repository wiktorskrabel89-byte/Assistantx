export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  pl: "Polish",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  tr: "Turkish",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
};

const LANG_PATTERNS: Array<{ lang: string; name: string; patterns: RegExp[] }> = [
  {
    lang: "pl", name: "Polish",
    patterns: [
      /\b(elo|siema|hej|cześć|dzień dobry|dobra|spoko|git|okej|okej|co tam|co słychać|dziękuję|proszę|przepraszam|tak|nie|ile|gdzie|kiedy|jak|co|dlaczego|który|która|które)\b/i,
      /[ąćęłńóśźż]/,
      /\b(jest|są|były|będzie|mam|masz|ma|mamy|macie|mają|idę|idziesz|idzie|chcę|chcesz|mogę|możesz|można|trzeba|wiem|widzę|rozumiem|powiedz|napisz|zrób|pomóż|sprawdź)\b/i,
    ],
  },
  {
    lang: "de", name: "German",
    patterns: [
      /\b(hallo|guten|tag|morgen|abend|bitte|danke|ja|nein|wie|was|wo|wann|warum|wer|ich|du|er|sie|wir|ihr|sie|ein|eine|der|die|das|und|oder|aber|mit|für|von)\b/i,
      /[äöüß]/,
    ],
  },
  {
    lang: "fr", name: "French",
    patterns: [
      /\b(bonjour|salut|merci|oui|non|comment|quoi|où|quand|pourquoi|qui|je|tu|il|elle|nous|vous|ils|elles|un|une|le|la|les|et|ou|mais|avec|pour|de|du|des)\b/i,
      /[àâæçéèêëîïôœùûüÿ]/,
    ],
  },
  {
    lang: "es", name: "Spanish",
    patterns: [
      /\b(hola|buenos|días|gracias|sí|no|cómo|qué|dónde|cuándo|por qué|quién|yo|tú|él|ella|nosotros|vosotros|ellos|un|una|el|la|los|las|y|o|pero|con|para|de)\b/i,
      /[áéíóúüñ¿¡]/,
    ],
  },
  {
    lang: "pt", name: "Portuguese",
    patterns: [
      /\b(olá|oi|obrigado|obrigada|sim|não|como|o que|onde|quando|por que|quem|eu|tu|ele|ela|nós|vocês|eles|um|uma|o|a|os|as|e|ou|mas|com|para|de|do|da)\b/i,
      /[ãõâêôàáéíóúç]/,
    ],
  },
  { lang: "ru", name: "Russian", patterns: [/[\u0400-\u04FF]/] },
  { lang: "zh", name: "Chinese", patterns: [/[\u4E00-\u9FFF\u3400-\u4DBF]/] },
  { lang: "ja", name: "Japanese", patterns: [/[\u3040-\u309F\u30A0-\u30FF]/] },
  { lang: "ko", name: "Korean", patterns: [/[\uAC00-\uD7AF\u1100-\u11FF]/] },
  { lang: "ar", name: "Arabic", patterns: [/[\u0600-\u06FF]/] },
  {
    lang: "tr", name: "Turkish",
    patterns: [
      /\b(merhaba|selam|teşekkür|evet|hayır|nasıl|ne|nerede|ne zaman|neden|kim|ben|sen|o|biz|siz|onlar|bir|ve|veya|ama|ile|için|bu|şu|o)\b/i,
      /[çğışöü]/,
    ],
  },
  {
    lang: "it", name: "Italian",
    patterns: [
      /\b(ciao|buongiorno|grazie|sì|no|come|cosa|dove|quando|perché|chi|io|tu|lui|lei|noi|voi|loro|un|una|il|la|i|le|e|o|ma|con|per|di|del|della)\b/i,
      /[àèéìíîòóùú]/,
    ],
  },
  {
    lang: "nl", name: "Dutch",
    patterns: [/\b(hallo|hoi|dank|ja|nee|hoe|wat|waar|wanneer|waarom|wie|ik|jij|hij|zij|wij|jullie|zij|een|de|het|en|of|maar|met|voor|van)\b/i],
  },
  {
    lang: "en", name: "English",
    patterns: [/\b(hello|hi|hey|thanks|thank you|yes|no|how|what|where|when|why|who|i|you|he|she|we|they|the|a|an|and|or|but|with|for|is|are|was|were|have|has|do|does|can|will|please|help)\b/i],
  },
];

export function detectLanguage(text: string): { lang: string; name: string } | null {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;

  const scores: Record<string, { name: string; score: number }> = {};
  for (const { lang, name, patterns } of LANG_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = trimmed.match(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g")));
      if (matches) score += matches.length;
    }
    if (score > 0) scores[lang] = { name, score };
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  if (ranked.length === 0) return null;

  const [topLang, topData] = ranked[0];
  const secondScore = ranked[1]?.[1].score ?? 0;
  if (topData.score <= secondScore && topLang !== "en") return { lang: "en", name: "English" };
  return { lang: topLang, name: topData.name };
}
