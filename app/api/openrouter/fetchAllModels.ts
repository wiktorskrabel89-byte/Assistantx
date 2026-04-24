// Fetches all available models from OpenRouter API
export async function fetchAllModels(): Promise<any[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}
