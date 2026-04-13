export type ModelOption = {
  id: string;
  label: string;
  description: string;
};

export type VoiceLanguageOption = {
  code: string;
  label: string;
  instruction: string;
};

export const CHAT_MODELS: ModelOption[] = [
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    description: "Balanced everyday chat model.",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    description: "Fast general-purpose chat.",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    description: "Strong reasoning and writing.",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Fast compact OpenAI model.",
  },
  {
    id: "x-ai/grok-3-mini",
    label: "Grok 3 Mini",
    description: "Quick conversational answers.",
  },
];

export const CODE_MODELS: ModelOption[] = [
  {
    id: "deepseek/deepseek-v3.2",
    label: "DeepSeek V3.2",
    description: "Fast coding model.",
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    description: "Reasoning-heavy coding model.",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    description: "High-quality code generation.",
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    description: "Premium code and analysis model.",
  },
  {
    id: "qwen/qwen3-235b-a22b",
    label: "Qwen 3 235B",
    description: "Large open model for code tasks.",
  },
];

export const SEARCH_MODELS: ModelOption[] = [
  {
    id: "perplexity/sonar",
    label: "Perplexity Sonar",
    description: "Web-aware research answers.",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    description: "Long-context research model.",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Fallback search summarizer.",
  },
];

export const VOICE_LANGUAGE_OPTIONS: VoiceLanguageOption[] = [
  { code: "auto", label: "Auto detect", instruction: "Detect the user's language and always answer in that same language." },
  { code: "ar", label: "Arabic", instruction: "Always answer only in Arabic." },
  { code: "bn", label: "Bengali", instruction: "Always answer only in Bengali." },
  { code: "bg", label: "Bulgarian", instruction: "Always answer only in Bulgarian." },
  { code: "ca", label: "Catalan", instruction: "Always answer only in Catalan." },
  { code: "zh", label: "Chinese", instruction: "Always answer only in Chinese." },
  { code: "hr", label: "Croatian", instruction: "Always answer only in Croatian." },
  { code: "cs", label: "Czech", instruction: "Always answer only in Czech." },
  { code: "da", label: "Danish", instruction: "Always answer only in Danish." },
  { code: "nl", label: "Dutch", instruction: "Always answer only in Dutch." },
  { code: "en", label: "English", instruction: "Always answer only in English." },
  { code: "et", label: "Estonian", instruction: "Always answer only in Estonian." },
  { code: "fi", label: "Finnish", instruction: "Always answer only in Finnish." },
  { code: "fr", label: "French", instruction: "Always answer only in French." },
  { code: "de", label: "German", instruction: "Always answer only in German." },
  { code: "el", label: "Greek", instruction: "Always answer only in Greek." },
  { code: "he", label: "Hebrew", instruction: "Always answer only in Hebrew." },
  { code: "hi", label: "Hindi", instruction: "Always answer only in Hindi." },
  { code: "hu", label: "Hungarian", instruction: "Always answer only in Hungarian." },
  { code: "id", label: "Indonesian", instruction: "Always answer only in Indonesian." },
  { code: "it", label: "Italian", instruction: "Always answer only in Italian." },
  { code: "ja", label: "Japanese", instruction: "Always answer only in Japanese." },
  { code: "ko", label: "Korean", instruction: "Always answer only in Korean." },
  { code: "lv", label: "Latvian", instruction: "Always answer only in Latvian." },
  { code: "lt", label: "Lithuanian", instruction: "Always answer only in Lithuanian." },
  { code: "ms", label: "Malay", instruction: "Always answer only in Malay." },
  { code: "no", label: "Norwegian", instruction: "Always answer only in Norwegian." },
  { code: "fa", label: "Persian", instruction: "Always answer only in Persian." },
  { code: "pl", label: "Polish", instruction: "Always answer only in Polish." },
  { code: "pt", label: "Portuguese", instruction: "Always answer only in Portuguese." },
  { code: "ro", label: "Romanian", instruction: "Always answer only in Romanian." },
  { code: "ru", label: "Russian", instruction: "Always answer only in Russian." },
  { code: "sr", label: "Serbian", instruction: "Always answer only in Serbian." },
  { code: "sk", label: "Slovak", instruction: "Always answer only in Slovak." },
  { code: "sl", label: "Slovenian", instruction: "Always answer only in Slovenian." },
  { code: "es", label: "Spanish", instruction: "Always answer only in Spanish." },
  { code: "sv", label: "Swedish", instruction: "Always answer only in Swedish." },
  { code: "ta", label: "Tamil", instruction: "Always answer only in Tamil." },
  { code: "te", label: "Telugu", instruction: "Always answer only in Telugu." },
  { code: "th", label: "Thai", instruction: "Always answer only in Thai." },
  { code: "tr", label: "Turkish", instruction: "Always answer only in Turkish." },
  { code: "uk", label: "Ukrainian", instruction: "Always answer only in Ukrainian." },
  { code: "ur", label: "Urdu", instruction: "Always answer only in Urdu." },
  { code: "vi", label: "Vietnamese", instruction: "Always answer only in Vietnamese." },
];

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;
export const DEFAULT_CODE_MODEL = CODE_MODELS[0].id;
export const DEFAULT_SEARCH_MODEL = SEARCH_MODELS[0].id;
export const DEFAULT_VOICE_LANGUAGE = VOICE_LANGUAGE_OPTIONS[0].code;