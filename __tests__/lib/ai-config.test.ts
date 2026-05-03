/**
 * @jest-environment node
 */
import {
  CHAT_MODELS,
  CODE_MODELS,
  SEARCH_MODELS,
  LANGUAGE_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CODE_MODEL,
  DEFAULT_SEARCH_MODEL,
  RECOMMENDED_CODING_MODELS,
  RECOMMENDED_CHAT_MODELS,
  getModelCostTier,
  isModelAllowedByCostMode,
  filterModelsByCostMode,
  getCheaperAlternative,
  MODEL_COST_TIERS,
  FREE_CODING_MODEL,
  FREE_CHAT_MODEL,
  filterModelsByPlan,
  STARTER_PLAN,
  PREMIUM_PLAN,
} from "@/lib/ai-config";

const MODEL_ID_PATTERN = /^[\w.-]+\/[\w.:+-]+$/;

describe("ai-config model arrays", () => {
  it("CHAT_MODELS is non-empty with well-formed entries", () => {
    expect(CHAT_MODELS.length).toBeGreaterThan(0);
    for (const m of CHAT_MODELS) {
      expect(m).toHaveProperty("id");
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("description");
      expect(m.id).toMatch(MODEL_ID_PATTERN);
    }
  });

  it("CODE_MODELS is non-empty with well-formed entries", () => {
    expect(CODE_MODELS.length).toBeGreaterThan(0);
    for (const m of CODE_MODELS) {
      expect(m.id).toMatch(MODEL_ID_PATTERN);
      expect(typeof m.label).toBe("string");
    }
  });

  it("SEARCH_MODELS is non-empty with well-formed entries", () => {
    expect(SEARCH_MODELS.length).toBeGreaterThan(0);
    for (const m of SEARCH_MODELS) {
      expect(m.id).toMatch(MODEL_ID_PATTERN);
    }
  });
});

describe("default models", () => {
  it("DEFAULT_CHAT_MODEL matches first CHAT_MODELS id", () => {
    expect(DEFAULT_CHAT_MODEL).toBe(CHAT_MODELS[0].id);
  });

  it("DEFAULT_CODE_MODEL is a valid CODE_MODELS id", () => {
    const ids = CODE_MODELS.map((m) => m.id);
    expect(ids).toContain(DEFAULT_CODE_MODEL);
  });

  it("DEFAULT_SEARCH_MODEL matches first SEARCH_MODELS id", () => {
    expect(DEFAULT_SEARCH_MODEL).toBe(SEARCH_MODELS[0].id);
  });
});

describe("LANGUAGE_OPTIONS", () => {
  it('has "auto" as first option', () => {
    expect(LANGUAGE_OPTIONS[0].code).toBe("auto");
  });

  it("every entry has code and label", () => {
    for (const opt of LANGUAGE_OPTIONS) {
      expect(typeof opt.code).toBe("string");
      expect(typeof opt.label).toBe("string");
    }
  });
});

describe("recommended model presets", () => {
  it("RECOMMENDED_CODING_MODELS are well-formed presets", () => {
    expect(RECOMMENDED_CODING_MODELS.length).toBeGreaterThan(0);
    for (const p of RECOMMENDED_CODING_MODELS) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("label");
      expect(p).toHaveProperty("modelId");
      expect(p).toHaveProperty("costTier");
      expect(p.modelId).toMatch(MODEL_ID_PATTERN);
    }
  });

  it("RECOMMENDED_CHAT_MODELS are well-formed presets", () => {
    expect(RECOMMENDED_CHAT_MODELS.length).toBeGreaterThan(0);
    for (const p of RECOMMENDED_CHAT_MODELS) {
      expect(p.modelId).toMatch(MODEL_ID_PATTERN);
      expect(p).toHaveProperty("costTier");
    }
  });

  it("all model IDs follow provider/model-name pattern", () => {
    const allIds = [
      ...CHAT_MODELS.map((m) => m.id),
      ...CODE_MODELS.map((m) => m.id),
      ...SEARCH_MODELS.map((m) => m.id),
    ];
    for (const id of allIds) {
      expect(id).toMatch(MODEL_ID_PATTERN);
    }
  });
});

describe("cost control system", () => {
  describe("getModelCostTier", () => {
    it("returns free for free models", () => {
      expect(getModelCostTier("nvidia/nemotron-3-super:free")).toBe("free");
      expect(getModelCostTier("meta-llama/llama-3.3-70b-instruct:free")).toBe("free");
    });

    it("returns cheap for budget models", () => {
      expect(getModelCostTier("google/gemini-2.5-flash-lite")).toBe("cheap");
      expect(getModelCostTier("openai/gpt-5-mini")).toBe("cheap");
    });

    it("returns standard for mid-tier models", () => {
      expect(getModelCostTier("deepseek/deepseek-r1")).toBe("standard");
      expect(getModelCostTier("anthropic/claude-sonnet-4.5")).toBe("standard");
    });

    it("returns premium for frontier models", () => {
      expect(getModelCostTier("anthropic/claude-opus-4.6")).toBe("premium");
      expect(getModelCostTier("openai/gpt-5.4")).toBe("premium");
    });

    it("defaults to standard for unknown models", () => {
      expect(getModelCostTier("unknown/model-x")).toBe("standard");
    });
  });

  describe("isModelAllowedByCostMode", () => {
    it("thrifty allows free and cheap only", () => {
      expect(isModelAllowedByCostMode("meta-llama/llama-3.3-70b-instruct:free", "thrifty")).toBe(true);
      expect(isModelAllowedByCostMode("openai/gpt-5-mini", "thrifty")).toBe(true);
      expect(isModelAllowedByCostMode("deepseek/deepseek-r1", "thrifty")).toBe(false);
      expect(isModelAllowedByCostMode("openai/gpt-5.4", "thrifty")).toBe(false);
    });

    it("balanced allows up to standard", () => {
      expect(isModelAllowedByCostMode("meta-llama/llama-3.3-70b-instruct:free", "balanced")).toBe(true);
      expect(isModelAllowedByCostMode("openai/gpt-5-mini", "balanced")).toBe(true);
      expect(isModelAllowedByCostMode("deepseek/deepseek-r1", "balanced")).toBe(true);
      expect(isModelAllowedByCostMode("openai/gpt-5.4", "balanced")).toBe(false);
    });

    it("performance allows everything", () => {
      expect(isModelAllowedByCostMode("deepseek/deepseek-r1:free", "performance")).toBe(true);
      expect(isModelAllowedByCostMode("openai/gpt-5.4", "performance")).toBe(true);
      expect(isModelAllowedByCostMode("anthropic/claude-opus-4.6", "performance")).toBe(true);
    });
  });

  describe("filterModelsByCostMode", () => {
    const models = [
      "meta-llama/llama-3.3-70b-instruct:free",
      "openai/gpt-5-mini",
      "deepseek/deepseek-r1",
      "openai/gpt-5.4",
    ];

    it("thrifty keeps only free and cheap models", () => {
      const filtered = filterModelsByCostMode(models, "thrifty");
      expect(filtered).toContain("meta-llama/llama-3.3-70b-instruct:free");
      expect(filtered).toContain("openai/gpt-5-mini");
      expect(filtered).not.toContain("deepseek/deepseek-r1");
      expect(filtered).not.toContain("openai/gpt-5.4");
    });

    it("balanced keeps free, cheap, and standard models", () => {
      const filtered = filterModelsByCostMode(models, "balanced");
      expect(filtered).toContain("meta-llama/llama-3.3-70b-instruct:free");
      expect(filtered).toContain("openai/gpt-5-mini");
      expect(filtered).toContain("deepseek/deepseek-r1");
      expect(filtered).not.toContain("openai/gpt-5.4");
    });

    it("performance keeps all models", () => {
      const filtered = filterModelsByCostMode(models, "performance");
      expect(filtered).toEqual(models);
    });

    it("returns original list when filtering would remove all models", () => {
      const premiumOnly = ["openai/gpt-5.4", "anthropic/claude-opus-4.6"];
      const filtered = filterModelsByCostMode(premiumOnly, "thrifty");
      expect(filtered).toEqual(premiumOnly);
    });
  });

  describe("getCheaperAlternative", () => {
    it("returns the same model if within budget", () => {
      const result = getCheaperAlternative("openai/gpt-5-mini", "thrifty", false);
      expect(result.modelId).toBe("openai/gpt-5-mini");
      expect(result.downgraded).toBe(false);
    });

    it("downgrades premium coding model in thrifty mode", () => {
      const result = getCheaperAlternative("openai/gpt-5.4", "thrifty", true);
      expect(result.downgraded).toBe(true);
      expect(getModelCostTier(result.modelId)).not.toBe("premium");
    });

    it("downgrades premium chat model in thrifty mode", () => {
      const result = getCheaperAlternative("anthropic/claude-opus-4.6", "thrifty", false);
      expect(result.downgraded).toBe(true);
    });

    it("performance mode never downgrades", () => {
      const result = getCheaperAlternative("openai/gpt-5.4", "performance", true);
      expect(result.modelId).toBe("openai/gpt-5.4");
      expect(result.downgraded).toBe(false);
    });
  });

  describe("MODEL_COST_TIERS consistency", () => {
    it("free models contain :free suffix", () => {
      for (const [id, tier] of Object.entries(MODEL_COST_TIERS)) {
        if (tier === "free") {
          expect(id).toMatch(/:free$/);
        }
      }
    });

    it("FREE_CODING_MODEL is mapped as free tier", () => {
      expect(getModelCostTier(FREE_CODING_MODEL)).toBe("free");
    });

    it("FREE_CHAT_MODEL is mapped as free tier", () => {
      expect(getModelCostTier(FREE_CHAT_MODEL)).toBe("free");
    });
  });
});

describe("plan configuration", () => {
  it("STARTER_PLAN has fewer requests than PREMIUM_PLAN", () => {
    expect(STARTER_PLAN.premiumRequestsPerMonth).toBeLessThan(PREMIUM_PLAN.premiumRequestsPerMonth);
  });

  it("STARTER_PLAN costs less than PREMIUM_PLAN", () => {
    expect(STARTER_PLAN.priceUsd).toBeLessThan(PREMIUM_PLAN.priceUsd);
  });

  it("STARTER_PLAN has positive values", () => {
    expect(STARTER_PLAN.priceUsd).toBeGreaterThan(0);
    expect(STARTER_PLAN.premiumRequestsPerMonth).toBeGreaterThan(0);
  });
});

describe("filterModelsByPlan", () => {
  const models = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "openai/gpt-5.4",
    "anthropic/claude-opus-4.5",
  ];

  it("free plan returns only :free models", () => {
    const result = filterModelsByPlan(models, "free");
    expect(result.every((id) => id.endsWith(":free"))).toBe(true);
  });

  it("starter plan returns all models", () => {
    const result = filterModelsByPlan(models, "starter");
    expect(result).toEqual(models);
  });

  it("premium plan returns all models", () => {
    const result = filterModelsByPlan(models, "premium");
    expect(result).toEqual(models);
  });

  it("free plan with no free models falls back to FREE_CHAT_MODEL", () => {
    const premiumOnly = ["openai/gpt-5.4", "anthropic/claude-opus-4.5"];
    const result = filterModelsByPlan(premiumOnly, "free");
    expect(result).toEqual([FREE_CHAT_MODEL]);
  });
});
