// Fetches the latest available models from OpenRouter
// Returns an array of model objects with at least an 'id' property

export async function fetchAllModels(): Promise<Array<{ id: string; [key: string]: any }>> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://moje-ai.vercel.app",
      "X-Title": "Moje AI",
    },
    next: { revalidate: 60 }, // Cache for 1 minute
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  // The API returns { data: [ ...models ] }
  return Array.isArray(data.data) ? data.data : [];
}
