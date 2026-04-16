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
} from "@/lib/ai-config";

const MODEL_ID_PATTERN = /^[\w.-]+\/[\w.+-]+$/;

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
      expect(p.modelId).toMatch(MODEL_ID_PATTERN);
    }
  });

  it("RECOMMENDED_CHAT_MODELS are well-formed presets", () => {
    expect(RECOMMENDED_CHAT_MODELS.length).toBeGreaterThan(0);
    for (const p of RECOMMENDED_CHAT_MODELS) {
      expect(p.modelId).toMatch(MODEL_ID_PATTERN);
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
