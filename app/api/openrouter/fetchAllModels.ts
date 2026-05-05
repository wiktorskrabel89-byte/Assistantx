import { ALL_MODELS } from "@/lib/ai-config";

export type OpenRouterModel = { id: string; description?: string };

/** Returns the local curated model list. No network call is made. */
export async function fetchAllModels(): Promise<OpenRouterModel[]> {
  return ALL_MODELS;
}
