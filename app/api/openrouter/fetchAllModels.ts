import { getCachedModels, type OpenRouterModel } from "./modelCache";
import { CHAT_MODELS, CODE_MODELS } from "@/lib/ai-config";

export type { OpenRouterModel };

/**
 * Local curated model list used as fallback when the OpenRouter API is
 * unreachable (e.g. network failure, CORS, missing key).
 * Deduplicates by model ID from CHAT_MODELS + CODE_MODELS.
 */
export const LOCAL_FALLBACK_MODELS: OpenRouterModel[] = (() => {
  const seen = new Set<string>();
  return [...CHAT_MODELS, ...CODE_MODELS]
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .map((m) => ({ id: m.id, description: m.description }));
})();

export async function fetchAllModels(): Promise<OpenRouterModel[]> {
  const models = await getCachedModels();
  return models.length > 0 ? models : LOCAL_FALLBACK_MODELS;
}
