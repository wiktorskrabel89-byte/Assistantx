// NOTE: This endpoint and fetchAllModels.ts both hit /v1/models independently. Consider merging or caching to avoid double requests.
// Fetches the latest models from OpenRouter API
export async function fetchLatestModelId(prefix: string): Promise<string | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) return null;
    const data = await res.json();
    const models = data.models || [];
    // Filter by prefix and sort by version (assumes version at end, e.g., gpt-5.4, gpt-5.5)
    const filtered = models.filter((m: any) => m.id.startsWith(prefix));
    if (filtered.length === 0) return null;
    filtered.sort((a: any, b: any) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    return filtered[0].id;
  } catch {
    return null;
  }
}
