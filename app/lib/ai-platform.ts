import { createHash, randomUUID } from "node:crypto";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const FAL_FLUX_FAST_URL = "https://fal.run/fal-ai/flux/schnell";
const FAL_FLUX_HIGH_URL = "https://fal.run/fal-ai/flux/dev";
const WEB_CACHE_TTL_MS = 1000 * 60 * 30;

type JsonRecord = Record<string, unknown>;
type SupabaseLikeClient = { from: (table: string) => unknown };

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type WebSearchResponsePayload = {
  answer: string;
  provider: "tavily" | "openrouter-plugin";
  query: string;
  results: TavilySearchResult[];
  cached: boolean;
  expiresAt?: string;
};

export type ImageGenerationOptions = {
  prompt: string;
  quality?: "fast" | "high";
  enhancePrompt?: boolean;
  aspectRatio?: string;
};

export type ImageGenerationResult = {
  url: string;
  provider: string;
  model: string;
  stages: string[];
  promptUsed: string;
};

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createSearchQueryHash(query: string) {
  return createHash("sha256").update(normalizeSearchQuery(query)).digest("hex");
}

export function shouldUseLiveWebSearch(params: {
  requested: boolean;
  mode: string;
  message: string;
  retrievedKnowledgeContext: string;
  cachedAnswerExists: boolean;
}) {
  if (!params.requested) return false;
  if (params.mode === "search") return true;
  if (!params.retrievedKnowledgeContext.trim()) return true;
  if (params.cachedAnswerExists) return false;
  return /\b(today|latest|current|recent|news|price|release|version|202[5-9]|live)\b/i.test(params.message);
}

export function formatWebSearchContext(answer: string, results: TavilySearchResult[]) {
  const sources = results
    .filter((item) => item.url)
    .map((item, index) => `[${index + 1}] ${item.title || item.url}\n${item.url}\n${item.content}`)
    .join("\n\n");

  return [
    answer.trim() ? `Live web findings:\n${answer.trim()}` : "",
    sources ? `Supporting sources:\n${sources}` : "",
  ].filter(Boolean).join("\n\n");
}

export async function getCachedWebSearch(params: {
  supabase: SupabaseLikeClient;
  userId: string;
  query: string;
}) {
  const queryHash = createSearchQueryHash(params.query);
  const table = params.supabase.from("web_search_cache") as {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          maybeSingle: () => Promise<{ data?: JsonRecord | null; error?: { message?: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await table
    .select("query, provider, answer, results, expires_at")
    .eq("user_id", params.userId)
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (error || !data) return null;
  const expiresAt = typeof data.expires_at === "string" ? data.expires_at : null;
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) return null;

  return {
    answer: typeof data.answer === "string" ? data.answer : "",
    provider: data.provider === "tavily" ? "tavily" : "tavily",
    query: typeof data.query === "string" ? data.query : params.query,
    results: Array.isArray(data.results) ? data.results as TavilySearchResult[] : [],
    cached: true,
    expiresAt,
  } satisfies WebSearchResponsePayload;
}

export async function saveWebSearchCache(params: {
  supabase: SupabaseLikeClient;
  userId: string;
  payload: WebSearchResponsePayload;
}) {
  const expiresAt = new Date(Date.now() + WEB_CACHE_TTL_MS).toISOString();
  const table = params.supabase.from("web_search_cache") as {
    upsert: (values: JsonRecord, options?: JsonRecord) => Promise<{ error?: { message?: string } | null }>;
  };
  await table.upsert({
    user_id: params.userId,
    query: params.payload.query,
    query_hash: createSearchQueryHash(params.payload.query),
    provider: params.payload.provider,
    answer: params.payload.answer,
    results: params.payload.results,
    result_count: params.payload.results.length,
    expires_at: expiresAt,
  }, { onConflict: "user_id,query_hash" });
  return expiresAt;
}

export async function runTavilySearch(query: string, maxResults = 5): Promise<WebSearchResponsePayload> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TAVILY_API_KEY");
  }

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with ${response.status}`);
  }

  const payload = await response.json() as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  };

  return {
    answer: payload.answer?.trim() ?? "",
    provider: "tavily",
    query,
    results: Array.isArray(payload.results)
      ? payload.results.map((item) => ({
          title: item.title?.trim() || item.url?.trim() || "Untitled source",
          url: item.url?.trim() || "",
          content: item.content?.trim() || "",
          score: typeof item.score === "number" ? item.score : undefined,
        }))
      : [],
    cached: false,
  };
}

export function buildEnhancedImagePrompt(prompt: string, enhancePrompt = false) {
  const trimmed = prompt.trim();
  if (!enhancePrompt || !trimmed) return trimmed;
  return `${trimmed}, highly detailed, visually cohesive, professional lighting, refined composition`;
}

export function buildPollinationsFallbackUrl(prompt: string, quality: "fast" | "high") {
  const encoded = encodeURIComponent(prompt);
  const model = quality === "high" ? "flux" : "turbo";
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true&model=${model}`;
}

export async function generateImageWithFal(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const promptUsed = buildEnhancedImagePrompt(options.prompt, options.enhancePrompt);
  const quality = options.quality ?? "fast";
  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    return {
      url: buildPollinationsFallbackUrl(promptUsed || options.prompt, quality),
      provider: "Pollinations",
      model: quality === "high" ? "Pollinations FLUX" : "Pollinations Turbo",
      stages: ["Normalizing prompt", "Falling back to Pollinations", "Publishing image URL"],
      promptUsed: promptUsed || options.prompt,
    };
  }

  const endpoint = quality === "high" ? FAL_FLUX_HIGH_URL : FAL_FLUX_FAST_URL;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: promptUsed || options.prompt,
      image_size: options.aspectRatio === "portrait" ? { width: 832, height: 1216 } : { width: 1024, height: 1024 },
      sync_mode: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`fal.ai generation failed ${response.status}: ${body}`);
  }

  const payload = await response.json() as { images?: Array<{ url?: string }>; image?: { url?: string } };
  const url = payload.images?.[0]?.url ?? payload.image?.url;
  if (!url) {
    throw new Error("fal.ai response missing image URL");
  }

  return {
    url,
    provider: "fal.ai",
    model: quality === "high" ? "FLUX.1 Dev" : "FLUX.1 Schnell",
    stages: ["Validating prompt", "Dispatching request to fal.ai", "Rendering FLUX image", "Finalizing image asset"],
    promptUsed: promptUsed || options.prompt,
  };
}

export async function logUsageEvent(params: {
  supabase: SupabaseLikeClient;
  userId?: string | null;
  eventType: string;
  provider?: string;
  model?: string;
  route?: string;
  tokenInput?: number;
  tokenOutput?: number;
  estimatedCostUsd?: number;
  metadata?: JsonRecord;
}) {
  try {
    const table = params.supabase.from("usage_analytics") as {
      insert: (values: JsonRecord) => Promise<{ error?: { message?: string } | null }>;
    };
    await table.insert({
      user_id: params.userId ?? null,
      event_type: params.eventType,
      provider: params.provider ?? null,
      model: params.model ?? null,
      route: params.route ?? null,
      token_input: params.tokenInput ?? null,
      token_output: params.tokenOutput ?? null,
      estimated_cost_usd: params.estimatedCostUsd ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // best effort only
  }
}

export function createGeneratedImageStoragePath(userId: string) {
  return `${userId}/${Date.now()}-${randomUUID()}.png`;
}
