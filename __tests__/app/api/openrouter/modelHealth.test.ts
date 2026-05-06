/**
 * @jest-environment node
 *
 * Unit tests for the in-memory model health tracker.
 * Each test isolates module state via jest.resetModules() so the singleton Map
 * starts fresh. All Date.now() calls are faked to allow time travel.
 */

const RECHECK_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

describe("modelHealth", () => {
  let markModelDown: (id: string) => void;
  let recordModelSuccess: (id: string) => void;
  let isModelDown: (id: string) => boolean;
  let filterHealthyModels: (ids: string[]) => string[];
  let getDownModels: () => string[];
  let _resetForTests: () => void;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/app/api/openrouter/modelHealth");
    markModelDown = mod.markModelDown;
    recordModelSuccess = mod.recordModelSuccess;
    isModelDown = mod.isModelDown;
    filterHealthyModels = mod.filterHealthyModels;
    getDownModels = mod.getDownModels;
    _resetForTests = mod._resetForTests;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // markModelDown / isModelDown
  // ---------------------------------------------------------------------------

  it("isModelDown returns false for an unknown model", () => {
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
  });

  it("isModelDown returns true immediately after markModelDown", () => {
    markModelDown("openai/gpt-5.1");
    expect(isModelDown("openai/gpt-5.1")).toBe(true);
  });

  it("isModelDown returns false after 2-hour window elapses", () => {
    markModelDown("openai/gpt-5.1");
    jest.advanceTimersByTime(RECHECK_MS);
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
  });

  it("isModelDown returns true just before the 2-hour window elapses", () => {
    markModelDown("openai/gpt-5.1");
    jest.advanceTimersByTime(RECHECK_MS - 1);
    expect(isModelDown("openai/gpt-5.1")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // recordModelSuccess
  // ---------------------------------------------------------------------------

  it("recordModelSuccess clears the down status immediately", () => {
    markModelDown("openai/gpt-5.1");
    expect(isModelDown("openai/gpt-5.1")).toBe(true);
    recordModelSuccess("openai/gpt-5.1");
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
  });

  it("recordModelSuccess on an unknown model has no effect", () => {
    expect(() => recordModelSuccess("some/unknown-model")).not.toThrow();
    expect(isModelDown("some/unknown-model")).toBe(false);
  });

  it("marking a model down again after recordModelSuccess re-starts the window", () => {
    markModelDown("openai/gpt-5.1");
    recordModelSuccess("openai/gpt-5.1");
    markModelDown("openai/gpt-5.1");
    expect(isModelDown("openai/gpt-5.1")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // filterHealthyModels
  // ---------------------------------------------------------------------------

  it("filterHealthyModels removes down models from the list", () => {
    markModelDown("openai/gpt-5.1");
    const result = filterHealthyModels(["openai/gpt-5.4", "openai/gpt-5.1"]);
    expect(result).toEqual(["openai/gpt-5.4"]);
  });

  it("filterHealthyModels falls back to the full list if all models are down", () => {
    markModelDown("openai/gpt-5.1");
    markModelDown("openai/gpt-5.4");
    const result = filterHealthyModels(["openai/gpt-5.1", "openai/gpt-5.4"]);
    expect(result).toEqual(["openai/gpt-5.1", "openai/gpt-5.4"]);
  });

  it("filterHealthyModels returns the full list when no models are down", () => {
    const ids = ["openai/gpt-5.1", "anthropic/claude-opus-4.6"];
    expect(filterHealthyModels(ids)).toEqual(ids);
  });

  it("filterHealthyModels includes models whose window has elapsed", () => {
    markModelDown("openai/gpt-5.1");
    jest.advanceTimersByTime(RECHECK_MS);
    const result = filterHealthyModels(["openai/gpt-5.1", "openai/gpt-5.4"]);
    expect(result).toContain("openai/gpt-5.1");
  });

  // ---------------------------------------------------------------------------
  // getDownModels
  // ---------------------------------------------------------------------------

  it("getDownModels returns empty array when no models are down", () => {
    expect(getDownModels()).toEqual([]);
  });

  it("getDownModels returns ids of all currently-down models", () => {
    markModelDown("openai/gpt-5.1");
    markModelDown("anthropic/claude-opus-4.6");
    const downs = getDownModels();
    expect(downs).toContain("openai/gpt-5.1");
    expect(downs).toContain("anthropic/claude-opus-4.6");
  });

  it("getDownModels excludes models whose window has elapsed", () => {
    markModelDown("openai/gpt-5.1");
    jest.advanceTimersByTime(RECHECK_MS);
    expect(getDownModels()).not.toContain("openai/gpt-5.1");
  });

  it("getDownModels excludes models cleared by recordModelSuccess", () => {
    markModelDown("openai/gpt-5.1");
    recordModelSuccess("openai/gpt-5.1");
    expect(getDownModels()).not.toContain("openai/gpt-5.1");
  });

  // ---------------------------------------------------------------------------
  // _resetForTests
  // ---------------------------------------------------------------------------

  it("_resetForTests clears all health state", () => {
    markModelDown("openai/gpt-5.1");
    markModelDown("anthropic/claude-opus-4.6");
    _resetForTests();
    expect(getDownModels()).toEqual([]);
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // re-probe window behaviour
  // ---------------------------------------------------------------------------

  it("re-marks a model down after the window expires if it fails again", () => {
    markModelDown("openai/gpt-5.1");
    jest.advanceTimersByTime(RECHECK_MS);
    // At this point isModelDown returns false — live request is allowed through.
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
    // The live request fails again → re-mark
    markModelDown("openai/gpt-5.1");
    expect(isModelDown("openai/gpt-5.1")).toBe(true);
  });

  it("tracks multiple models independently", () => {
    markModelDown("openai/gpt-5.1");
    // Advance halfway
    jest.advanceTimersByTime(RECHECK_MS / 2);
    markModelDown("anthropic/claude-opus-4.6");
    // After the full window from the start, gpt-5.1's window has elapsed
    jest.advanceTimersByTime(RECHECK_MS / 2);
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
    // claude-opus-4.6 was marked halfway in, so still down
    expect(isModelDown("anthropic/claude-opus-4.6")).toBe(true);
  });
});
