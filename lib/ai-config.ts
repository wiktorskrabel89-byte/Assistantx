export type ModelOption = {
  id: string;
  label: string;
  description: string;
};

export type LanguageOption = {
  code: string;
  label: string;
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
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    description: "Latest frontier coding model.",
  },
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

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "auto", label: "Auto detect" },
  { code: "ar", label: "Arabic" },
  { code: "bn", label: "Bengali" },
  { code: "bg", label: "Bulgarian" },
  { code: "ca", label: "Catalan" },
  { code: "zh", label: "Chinese" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "ms", label: "Malay" },
  { code: "no", label: "Norwegian" },
  { code: "fa", label: "Persian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sr", label: "Serbian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "vi", label: "Vietnamese" },
];

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;
export const DEFAULT_CODE_MODEL = "openai/gpt-5.4";
export const DEFAULT_SEARCH_MODEL = SEARCH_MODELS[0].id;
