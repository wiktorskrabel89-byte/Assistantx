/**
 * @jest-environment node
 *
 * Tests for the local model registry in app/api/openrouter/modelCache.ts.
 * No network calls are made — all data comes from lib/ai-config.ts.
 */

import { getCachedModels, fetchLatestModelIds } from "@/app/api/openrouter/modelCache";
import { ALL_MODELS } from "@/lib/ai-config";

describe("getCachedModels", () => {
  it("returns a non-empty array", async () => {
    const models = await getCachedModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it("returns the same list as ALL_MODELS from lib/ai-config", async () => {
    const models = await getCachedModels();
    expect(models).toEqual(ALL_MODELS);
  });

  it("every entry has a non-empty id string", async () => {
    const models = await getCachedModels();
    for (const m of models) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  it("calling it twice returns the same reference (idempotent)", async () => {
    const first = await getCachedModels();
    const second = await getCachedModels();
    expect(first).toBe(second);
  });
});

describe("fetchLatestModelIds", () => {
  it("returns null for a prefix that matches no models", async () => {
    const result = await fetchLatestModelIds(["nonexistent/model-"]);
    expect(result["nonexistent/model-"]).toBeNull();
  });

  it("returns a model ID for a prefix that matches at least one model", async () => {
    // ALL_MODELS contains anthropic models
    const result = await fetchLatestModelIds(["anthropic/"]);
    expect(result["anthropic/"]).not.toBeNull();
    expect(result["anthropic/"]!.startsWith("anthropic/")).toBe(true);
  });

  it("returns an empty object for an empty prefixes array", async () => {
    const result = await fetchLatestModelIds([]);
    expect(result).toEqual({});
  });

  it("handles multiple prefixes in a single call", async () => {
    const result = await fetchLatestModelIds(["anthropic/", "openai/", "nonexistent/"]);
    expect(result["anthropic/"]).not.toBeNull();
    expect(result["openai/"]).not.toBeNull();
    expect(result["nonexistent/"]).toBeNull();
  });

  it("returns the numerically latest model when multiple models share a prefix", async () => {
    // ALL_MODELS has both claude-opus-4.6 and claude-opus-4.7 under anthropic/claude-opus
    // localeCompare with { numeric: true } should rank 4.7 > 4.6
    const result = await fetchLatestModelIds(["anthropic/claude-opus-4."]);
    // Should be 4.7 (numerically greater than 4.6)
    expect(result["anthropic/claude-opus-4."]).toBe("anthropic/claude-opus-4.7");
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelsMod = require("@/app/api/openrouter/models");
  });

  it("returns a model ID for a prefix that matches", async () => {
    const id = await modelsMod.fetchLatestModelId("anthropic/");
    expect(id).not.toBeNull();
    expect(id!.startsWith("anthropic/")).toBe(true);
  });

  it("returns null when no model matches the prefix", async () => {
    const id = await modelsMod.fetchLatestModelId("nonexistent/");
    expect(id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchAllModels (thin wrapper in fetchAllModels.ts)
// ---------------------------------------------------------------------------
describe("fetchAllModels", () => {
  it("returns the local model list without any network calls", async () => {
    const { fetchAllModels } = await import("@/app/api/openrouter/fetchAllModels");
    const models = await fetchAllModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models).toEqual(ALL_MODELS);
  });

  it("contains free-tier models for free users", async () => {
    const { fetchAllModels } = await import("@/app/api/openrouter/fetchAllModels");
    const models = await fetchAllModels();
    const ids = models.map((m) => m.id);
    expect(ids.some((id) => id.endsWith(":free"))).toBe(true);
  });

  it("contains premium models for paid users", async () => {
    const { fetchAllModels } = await import("@/app/api/openrouter/fetchAllModels");
    const models = await fetchAllModels();
    const ids = models.map((m) => m.id);
    expect(ids.some((id) => id.includes("claude-opus") || id.includes("gpt-5."))).toBe(true);
  });
});
