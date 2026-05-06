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
    expect(isModelDown("test/model-a:free")).toBe(false);
  });

  it("isModelDown returns true immediately after markModelDown", () => {
    markModelDown("test/model-a:free");
    expect(isModelDown("test/model-a:free")).toBe(true);
  });

  it("isModelDown returns false after 2-hour window elapses", () => {
    markModelDown("test/model-a:free");
    jest.advanceTimersByTime(RECHECK_MS);
    expect(isModelDown("test/model-a:free")).toBe(false);
  });

  it("isModelDown returns true just before the 2-hour window elapses", () => {
    markModelDown("test/model-a:free");
    jest.advanceTimersByTime(RECHECK_MS - 1);
    expect(isModelDown("test/model-a:free")).toBe(true);
  });

  it("markModelDown ignores non-free models", () => {
    markModelDown("openai/gpt-5.1");
    expect(isModelDown("openai/gpt-5.1")).toBe(false);
    expect(getDownModels()).not.toContain("openai/gpt-5.1");
  });

  // ---------------------------------------------------------------------------
  // recordModelSuccess
  // ---------------------------------------------------------------------------

  it("recordModelSuccess clears the down status immediately", () => {
    markModelDown("test/model-a:free");
    expect(isModelDown("test/model-a:free")).toBe(true);
    recordModelSuccess("test/model-a:free");
    expect(isModelDown("test/model-a:free")).toBe(false);
  });

  it("recordModelSuccess on an unknown model has no effect", () => {
    expect(() => recordModelSuccess("some/unknown-model")).not.toThrow();
    expect(isModelDown("some/unknown-model")).toBe(false);
  });

  it("marking a model down again after recordModelSuccess re-starts the window", () => {
    markModelDown("test/model-a:free");
    recordModelSuccess("test/model-a:free");
    markModelDown("test/model-a:free");
    expect(isModelDown("test/model-a:free")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // filterHealthyModels
  // ---------------------------------------------------------------------------

  it("filterHealthyModels removes down models from the list", () => {
    markModelDown("test/model-a:free");
    const result = filterHealthyModels(["test/model-b:free", "test/model-a:free"]);
    expect(result).toEqual(["test/model-b:free"]);
  });

  it("filterHealthyModels falls back to the full list if all models are down", () => {
    markModelDown("test/model-a:free");
    markModelDown("test/model-b:free");
    const result = filterHealthyModels(["test/model-a:free", "test/model-b:free"]);
    expect(result).toEqual(["test/model-a:free", "test/model-b:free"]);
  });

  it("filterHealthyModels returns the full list when no models are down", () => {
    const ids = ["test/model-a:free", "test/model-b:free"];
    expect(filterHealthyModels(ids)).toEqual(ids);
  });

  it("filterHealthyModels includes models whose window has elapsed", () => {
    markModelDown("test/model-a:free");
    jest.advanceTimersByTime(RECHECK_MS);
    const result = filterHealthyModels(["test/model-a:free", "test/model-b:free"]);
    expect(result).toContain("test/model-a:free");
  });

  // ---------------------------------------------------------------------------
  // getDownModels
  // ---------------------------------------------------------------------------

  it("getDownModels returns empty array when no models are down", () => {
    expect(getDownModels()).toEqual([]);
  });

  it("getDownModels returns ids of all currently-down models", () => {
    markModelDown("test/model-a:free");
    markModelDown("test/model-b:free");
    const downs = getDownModels();
    expect(downs).toContain("test/model-a:free");
    expect(downs).toContain("test/model-b:free");
  });

  it("getDownModels excludes models whose window has elapsed", () => {
    markModelDown("test/model-a:free");
    jest.advanceTimersByTime(RECHECK_MS);
    expect(getDownModels()).not.toContain("test/model-a:free");
  });

  it("getDownModels excludes models cleared by recordModelSuccess", () => {
    markModelDown("test/model-a:free");
    recordModelSuccess("test/model-a:free");
    expect(getDownModels()).not.toContain("test/model-a:free");
  });

  // ---------------------------------------------------------------------------
  // _resetForTests
  // ---------------------------------------------------------------------------

  it("_resetForTests clears all health state", () => {
    markModelDown("test/model-a:free");
    markModelDown("test/model-b:free");
    _resetForTests();
    expect(getDownModels()).toEqual([]);
    expect(isModelDown("test/model-a:free")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // re-probe window behaviour
  // ---------------------------------------------------------------------------

  it("re-marks a model down after the window expires if it fails again", () => {
    markModelDown("test/model-a:free");
    jest.advanceTimersByTime(RECHECK_MS);
    // At this point isModelDown returns false — live request is allowed through.
    expect(isModelDown("test/model-a:free")).toBe(false);
    // The live request fails again → re-mark
    markModelDown("test/model-a:free");
    expect(isModelDown("test/model-a:free")).toBe(true);
  });

  it("tracks multiple models independently", () => {
    markModelDown("test/model-a:free");
    // Advance halfway
    jest.advanceTimersByTime(RECHECK_MS / 2);
    markModelDown("test/model-b:free");
    // After the full window from the start, model-a's window has elapsed
    jest.advanceTimersByTime(RECHECK_MS / 2);
    expect(isModelDown("test/model-a:free")).toBe(false);
    // model-b was marked halfway in, so still down
    expect(isModelDown("test/model-b:free")).toBe(true);
  });
});
