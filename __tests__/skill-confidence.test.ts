/**
 * Skill Confidence — tracking + scoring + ranking. Pure-function tests
 * (computeConfidence is exported standalone so the recency curve can be
 * verified without storage I/O).
 */

import {
  computeConfidence,
  createInMemorySkillStorage,
  getSkillStats,
  preferHigherConfidence,
  rankSkills,
  trackSkillFailure,
  trackSkillSuccess,
  wipeSkills,
} from "../app/lib/skill-confidence";

describe("skill-confidence", () => {
  test("default stats — zero values", () => {
    const storage = createInMemorySkillStorage();
    const stats = getSkillStats("unknown", storage);
    expect(stats.successCount).toBe(0);
    expect(stats.failureCount).toBe(0);
    expect(stats.usageCount).toBe(0);
    expect(stats.lastUsedAt).toBeNull();
    expect(stats.lastOutcome).toBeNull();
  });

  test("trackSkillSuccess increments + sets lastOutcome", () => {
    const storage = createInMemorySkillStorage();
    trackSkillSuccess("alpha", 5_000, storage);
    trackSkillSuccess("alpha", 3_000, storage);
    const stats = getSkillStats("alpha", storage);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(0);
    expect(stats.usageCount).toBe(2);
    expect(stats.totalRuntimeMs).toBe(8_000);
    expect(stats.lastOutcome).toBe("success");
    expect(stats.lastUsedAt).toBeGreaterThan(0);
  });

  test("trackSkillFailure tracks separately", () => {
    const storage = createInMemorySkillStorage();
    trackSkillSuccess("beta", 1_000, storage);
    trackSkillFailure("beta", 2_000, storage);
    trackSkillFailure("beta", 500, storage);
    const stats = getSkillStats("beta", storage);
    expect(stats.successCount).toBe(1);
    expect(stats.failureCount).toBe(2);
    expect(stats.usageCount).toBe(3);
    expect(stats.totalRuntimeMs).toBe(3_500);
    expect(stats.lastOutcome).toBe("failure");
  });

  test("computeConfidence — fresh use approaches raw success rate", () => {
    const now = 1_700_000_000_000;
    const stats = {
      successCount: 9,
      failureCount: 1,
      totalRuntimeMs: 0,
      usageCount: 10,
      lastUsedAt: now,
      lastOutcome: "success" as const,
    };
    // Just used (ageDays ≈ 0) → recency = 1, confidence = 0.9 * 1 = 0.9
    const conf = computeConfidence(stats, { now });
    expect(conf).toBeCloseTo(0.9, 2);
  });

  test("computeConfidence — decays with age via half-life curve", () => {
    const now = 1_700_000_000_000;
    const halfLifeDays = 14;
    const oneHalfLifeAgo = now - halfLifeDays * 86_400_000;
    const stats = {
      successCount: 9,
      failureCount: 1,
      totalRuntimeMs: 0,
      usageCount: 10,
      lastUsedAt: oneHalfLifeAgo,
      lastOutcome: "success" as const,
    };
    // recency at 1×halfLife: 0.5 + 0.5*exp(-1) ≈ 0.6839 → conf ≈ 0.9 * 0.6839
    const conf = computeConfidence(stats, { now, halfLifeDays });
    expect(conf).toBeGreaterThan(0.55);
    expect(conf).toBeLessThan(0.7);
  });

  test("computeConfidence — never-run skill returns 0", () => {
    const stats = {
      successCount: 0,
      failureCount: 0,
      totalRuntimeMs: 0,
      usageCount: 0,
      lastUsedAt: null,
      lastOutcome: null,
    };
    expect(computeConfidence(stats)).toBe(0);
  });

  test("rankSkills sorts by confidence descending", () => {
    const storage = createInMemorySkillStorage();
    trackSkillSuccess("low", 0, storage);
    trackSkillFailure("low", 0, storage);
    trackSkillFailure("low", 0, storage); // 33% raw success

    trackSkillSuccess("mid", 0, storage);
    trackSkillSuccess("mid", 0, storage);
    trackSkillFailure("mid", 0, storage); // 67% raw success

    trackSkillSuccess("high", 0, storage);
    trackSkillSuccess("high", 0, storage);
    trackSkillSuccess("high", 0, storage); // 100% raw success

    const ranked = rankSkills(storage).map((r) => r.id);
    expect(ranked[0]).toBe("high");
    expect(ranked[1]).toBe("mid");
    expect(ranked[2]).toBe("low");
  });

  test("preferHigherConfidence picks the winner among candidates", () => {
    const storage = createInMemorySkillStorage();
    trackSkillSuccess("a", 0, storage);
    trackSkillSuccess("a", 0, storage);
    trackSkillFailure("b", 0, storage);
    trackSkillFailure("b", 0, storage);
    expect(preferHigherConfidence(["a", "b", "c"], storage)).toBe("a");
    expect(preferHigherConfidence([], storage)).toBeNull();
  });

  test("wipeSkills clears all entries", () => {
    const storage = createInMemorySkillStorage();
    trackSkillSuccess("any", 0, storage);
    expect(rankSkills(storage).length).toBe(1);
    wipeSkills(storage);
    expect(rankSkills(storage).length).toBe(0);
  });
});
