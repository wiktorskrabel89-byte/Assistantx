// ai-config.ts
// Add free models to the model selector for both coding and chatting

export const CHAT_MODELS = [
  {
    id: "openrouter/elephant-alpha",
    label: "Elephant Alpha (Free)",
    description: "100B, $0, strong chat and code"
  },
  {
    id: "meta-llama/llama-4-scout:free",
    label: "Llama 4 Scout (Free)",
    description: "Open, $0, chat and code"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (Free)",
    description: "Open, $0, chat and code"
  }
];

export const CODE_MODELS = [
  {
    id: "openrouter/elephant-alpha",
    label: "Elephant Alpha (Free)",
    description: "100B, $0, strong chat and code"
  },
  {
    id: "meta-llama/llama-4-scout:free",
    label: "Llama 4 Scout (Free)",
    description: "Open, $0, chat and code"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (Free)",
    description: "Open, $0, chat and code"
  }
];

export const SEARCH_MODELS = [
  {
    id: "perplexity/sonar",
    label: "Perplexity Sonar",
    description: "Web search and research"
  }
];

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polish" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "tr", label: "Turkish" },
  { value: "ru", label: "Russian" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" }
];
