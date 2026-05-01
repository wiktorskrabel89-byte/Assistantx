// NOTE: This endpoint and models.ts both hit /v1/models independently. Consider merging or caching to avoid double requests.
// Fetches all available models from OpenRouter API
type OpenRouterModel = {
  id: string;
  description?: string;
};

type OpenRouterModelsResponse = {
  models?: OpenRouterModel[];
};

export async function fetchAllModels(): Promise<OpenRouterModel[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) {
      console.error('fetchAllModels: Response not ok', res.status, res.statusText);
      return [];
    }
    const data = (await res.json()) as OpenRouterModelsResponse;
    if (!data.models) {
      console.error('fetchAllModels: No models in response', data);
    }
    return data.models || [];
  } catch (err) {
    console.error('fetchAllModels: Error fetching models', err);
    return [];
  }
}
