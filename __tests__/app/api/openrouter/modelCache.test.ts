/**
 * @jest-environment node
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeOkResponse(models: unknown[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: models }),
  });
}

describe("getCachedModels", () => {
  // Isolate module between tests to reset module-level cache state.
  type Mod = typeof import("@/app/api/openrouter/modelCache");
  let mod: Mod;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/app/api/openrouter/modelCache");
  });

  it("fetches from the API on the first call and returns the model list", async () => {
    mockFetch.mockImplementationOnce(() =>
      makeOkResponse([{ id: "openai/gpt-4o" }, { id: "anthropic/claude-3" }])
    );
    const models = await mod.getCachedModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("openai/gpt-4o");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models");
  });

  it("returns the cached result on a subsequent call without fetching again", async () => {
    mockFetch.mockImplementationOnce(() => makeOkResponse([{ id: "openai/gpt-4o" }]));
    await mod.getCachedModels(); // populate cache
    await mod.getCachedModels(); // should hit cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when the API responds with a non-ok status", async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve({ ok: false }));
    const models = await mod.getCachedModels();
    expect(models).toEqual([]);
  });

  it("returns an empty array when fetch throws a network error", async () => {
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")));
    const models = await mod.getCachedModels();
    expect(models).toEqual([]);
  });

  it("returns an empty array when the API response has no 'data' field", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );
    const models = await mod.getCachedModels();
    expect(models).toEqual([]);
  });

  it("returns an empty array when 'data' is not an array", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: "not-an-array" }) })
    );
    const models = await mod.getCachedModels();
    expect(models).toEqual([]);
  });

  it("re-fetches after the 5-minute cache TTL expires", async () => {
    jest.useFakeTimers();

    const firstModels = [{ id: "model-v1" }];
    const secondModels = [{ id: "model-v2" }];

    mockFetch.mockImplementationOnce(() => makeOkResponse(firstModels));
    const first = await mod.getCachedModels();
    expect(first[0].id).toBe("model-v1");

    // Advance past the 5-minute TTL
    jest.advanceTimersByTime(6 * 60 * 1000);

    mockFetch.mockImplementationOnce(() => makeOkResponse(secondModels));
    const second = await mod.getCachedModels();
    expect(second[0].id).toBe("model-v2");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it("returns the stale cache when a non-ok response is received after expiry", async () => {
    jest.useFakeTimers();

    mockFetch.mockImplementationOnce(() => makeOkResponse([{ id: "cached-model" }]));
    await mod.getCachedModels(); // populate cache

    jest.advanceTimersByTime(6 * 60 * 1000);

    // Second fetch fails
    mockFetch.mockImplementationOnce(() => Promise.resolve({ ok: false }));
    const models = await mod.getCachedModels();
    expect(models[0].id).toBe("cached-model");

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// fetchLatestModelIds
// ---------------------------------------------------------------------------
describe("fetchLatestModelIds", () => {
  type Mod = typeof import("@/app/api/openrouter/modelCache");
  let mod: Mod;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/app/api/openrouter/modelCache");
  });

  it("returns the matching model ID for a given prefix", async () => {
    mockFetch.mockImplementationOnce(() =>
      makeOkResponse([{ id: "openai/gpt-4o" }, { id: "anthropic/claude-3" }])
    );
    const result = await mod.fetchLatestModelIds(["openai/"]);
    expect(result["openai/"]).toBe("openai/gpt-4o");
  });

  it("returns null for a prefix that matches no models", async () => {
    mockFetch.mockImplementationOnce(() => makeOkResponse([{ id: "openai/gpt-4o" }]));
    const result = await mod.fetchLatestModelIds(["anthropic/"]);
    expect(result["anthropic/"]).toBeNull();
  });

  it("returns the lexicographically latest model ID when multiple models match", async () => {
    mockFetch.mockImplementationOnce(() =>
      makeOkResponse([
        { id: "openai/gpt-4o-2024-05" },
        { id: "openai/gpt-4o-2024-11" },
        { id: "openai/gpt-4o-2024-08" },
      ])
    );
    const result = await mod.fetchLatestModelIds(["openai/gpt-4o"]);
    expect(result["openai/gpt-4o"]).toBe("openai/gpt-4o-2024-11");
  });

  it("handles multiple prefixes in a single call", async () => {
    mockFetch.mockImplementationOnce(() =>
      makeOkResponse([
        { id: "openai/gpt-4o" },
        { id: "anthropic/claude-3" },
        { id: "google/gemini-pro" },
      ])
    );
    const result = await mod.fetchLatestModelIds(["openai/", "anthropic/", "missing/"]);
    expect(result["openai/"]).toBe("openai/gpt-4o");
    expect(result["anthropic/"]).toBe("anthropic/claude-3");
    expect(result["missing/"]).toBeNull();
  });

  it("returns an empty object for an empty prefixes array", async () => {
    mockFetch.mockImplementationOnce(() => makeOkResponse([{ id: "openai/gpt-4o" }]));
    const result = await mod.fetchLatestModelIds([]);
    expect(result).toEqual({});
    // fetch is still called because we go through getCachedModels, but the
    // result map should be empty.
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles an exact prefix match (full model ID as prefix)", async () => {
    mockFetch.mockImplementationOnce(() =>
      makeOkResponse([{ id: "openai/gpt-4o" }, { id: "anthropic/claude-3" }])
    );
    const result = await mod.fetchLatestModelIds(["openai/gpt-4o"]);
    expect(result["openai/gpt-4o"]).toBe("openai/gpt-4o");
  });
});

// ---------------------------------------------------------------------------
// fetchLatestModelId (singular wrapper in models.ts)
// ---------------------------------------------------------------------------
describe("fetchLatestModelId", () => {
  type ModelsMod = typeof import("@/app/api/openrouter/models");
  let modelsMod: ModelsMod;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelsMod = require("@/app/api/openrouter/models");
  });

  it("returns the matching model ID for a prefix", async () => {
    mockFetch.mockImplementationOnce(() => makeOkResponse([{ id: "openai/gpt-4o" }]));
    const id = await modelsMod.fetchLatestModelId("openai/");
    expect(id).toBe("openai/gpt-4o");
  });

  it("returns null when no model matches the prefix", async () => {
    mockFetch.mockImplementationOnce(() => makeOkResponse([{ id: "openai/gpt-4o" }]));
    const id = await modelsMod.fetchLatestModelId("anthropic/");
    expect(id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchAllModels (thin wrapper in fetchAllModels.ts)
// ---------------------------------------------------------------------------
describe("fetchAllModels", () => {
  type FetchMod = typeof import("@/app/api/openrouter/fetchAllModels");
  let fetchMod: FetchMod;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fetchMod = require("@/app/api/openrouter/fetchAllModels");
  });

  it("delegates to getCachedModels and returns the model list", async () => {
    mockFetch.mockImplementationOnce(() =>
      makeOkResponse([{ id: "openai/gpt-4o", description: "Latest GPT-4o" }])
    );
    const models = await fetchMod.fetchAllModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("openai/gpt-4o");
  });

  it("returns an empty array when the upstream API is unavailable", async () => {
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")));
    const models = await fetchMod.fetchAllModels();
    expect(models).toEqual([]);
  });
});
