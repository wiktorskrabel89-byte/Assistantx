import { fetchLatestModelIds } from "./modelCache";

export async function fetchLatestModelId(prefix: string): Promise<string | null> {
  const results = await fetchLatestModelIds([prefix]);
  return results[prefix] ?? null;
}
