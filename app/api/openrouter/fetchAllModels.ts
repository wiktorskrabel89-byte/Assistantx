import { getCachedModels, type OpenRouterModel } from "./modelCache";

export type { OpenRouterModel };

export async function fetchAllModels(): Promise<OpenRouterModel[]> {
  return getCachedModels();
}
