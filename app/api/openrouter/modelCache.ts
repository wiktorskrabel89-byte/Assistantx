/**
 * Local model registry — replaces the previous OpenRouter /v1/models remote fetch.
 * All model data comes from lib/ai-config.ts; no network calls are made.
 */

import { ALL_MODELS } from "@/lib/ai-config";

export type OpenRouterModel = {
  id: string;
  description?: string;
};

/** Returns the local curated model list. No network call is made.
 *  The async signature is kept for backward compatibility with existing callers.
 */
export async function getCachedModels(): Promise<OpenRouterModel[]> {
  return ALL_MODELS;
}

/**
 * Returns the "latest" model ID that starts with each given prefix, selected
 * from the local curated list using numeric locale-compare sort.
 * The async signature is kept for backward compatibility with existing callers.
 */
export async function fetchLatestModelIds(
  prefixes: string[],
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const prefix of prefixes) {
    const matches = ALL_MODELS.filter((m) => m.id.startsWith(prefix));
    if (matches.length === 0) {
      result[prefix] = null;
      continue;
    }
    const sorted = [...matches].sort((a, b) =>
      b.id.localeCompare(a.id, undefined, { numeric: true })
    );
    result[prefix] = sorted[0].id;
  }
  return result;
}
