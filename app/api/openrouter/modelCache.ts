/**
 * Shared module-level cache for OpenRouter /v1/models.
 * On the server, the cache persists across requests within a process (reset by TTL).
 * On the client, the cache persists for the duration of the page session.
 */

export type OpenRouterModel = {
  id: string;
  description?: string;
};

type ModelsResponse = {
  data?: OpenRouterModel[];
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedModels: OpenRouterModel[] | null = null;
let cacheExpiry = 0;

export async function getCachedModels(): Promise<OpenRouterModel[]> {
  if (cachedModels !== null && Date.now() < cacheExpiry) {
    return cachedModels;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) {
      return cachedModels ?? [];
    }
    const json = (await res.json()) as ModelsResponse;
    cachedModels = Array.isArray(json.data) ? json.data : [];
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return cachedModels;
  } catch {
    return cachedModels ?? [];
  }
}

/**
 * Returns the latest model ID that starts with each given prefix,
 * all from a single (possibly cached) fetch.
 */
export async function fetchLatestModelIds(
  prefixes: string[],
): Promise<Record<string, string | null>> {
  const models = await getCachedModels();
  const result: Record<string, string | null> = {};

  for (const prefix of prefixes) {
    const filtered = models.filter((m) => m.id.startsWith(prefix));
    if (filtered.length === 0) {
      result[prefix] = null;
      continue;
    }
    filtered.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    result[prefix] = filtered[0].id;
  }

  return result;
}
