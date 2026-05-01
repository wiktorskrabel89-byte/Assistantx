// ai-config.ts
// Add free models to the model selector for both coding and chatting

export const CHAT_MODELS = [
  {
<<<<<<< HEAD
    id: "nvidia/nemotron-3-super:free",
    label: "Nemotron 3 Super (Free)",
    description: "Nemotron 3 Super, $0, top free model for chat and code"
=======
    id: "meta-llama/llama-4-scout:free",
    label: "Llama 4 Scout (Free)",
    description: "Open, $0, chat and code"
>>>>>>> 2b3e94d (Remove unavailable AI models, keep only one free for code (Ling 2.6 Flash) and one for chat (Llama 4 Scout). Remove Elephant Alpha to fix 404 error.)
  }
];

export const CODE_MODELS = [
  {
<<<<<<< HEAD
    id: "nvidia/nemotron-3-super:free",
    label: "Nemotron 3 Super (Free)",
    description: "Nemotron 3 Super, $0, top free model for code"
=======
    id: "inclusionai/ling-2.6-flash:free",
    label: "Ling 2.6 Flash (Free)",
    description: "Ling-2.6-flash, $0, strong code"
>>>>>>> 2b3e94d (Remove unavailable AI models, keep only one free for code (Ling 2.6 Flash) and one for chat (Llama 4 Scout). Remove Elephant Alpha to fix 404 error.)
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
