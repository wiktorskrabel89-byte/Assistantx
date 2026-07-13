'use strict';

// Round-2 — Skill Confidence store contract tests.
// Uses a temp directory so the user's real userData JSON is never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createSkillConfidenceStore,
  computeConfidence,
  DEFAULT_HALF_LIFE_DAYS,
} = require('../electron/memory/store/skill-confidence-store');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('skill-confidence: default snapshot has empty skills', () => {
  const dir = mkTempDir('jarvis-skill');
  const store = createSkillConfidenceStore({ baseDir: dir });
  const snap = store.snapshot();
  assert.equal(snap.schemaVersion, 1);
  assert.deepEqual(snap.skills, {});
});

test('skill-confidence: trackSuccess + trackFailure + getStats', () => {
  const dir = mkTempDir('jarvis-skill');
  const store = createSkillConfidenceStore({ baseDir: dir });
  store.trackSuccess('alpha', 4000);
  store.trackSuccess('alpha', 5000);
  store.trackFailure('alpha', 2000);
  const stats = store.getStats('alpha');
  assert.equal(stats.successCount, 2);
  assert.equal(stats.failureCount, 1);
  assert.equal(stats.usageCount, 3);
  assert.equal(stats.totalRuntimeMs, 11000);
  assert.equal(stats.lastOutcome, 'failure');
  assert.ok(stats.lastUsedAt > 0);
});

test('skill-confidence: rankSkills sorts by confidence descending', () => {
  const dir = mkTempDir('jarvis-skill');
  const store = createSkillConfidenceStore({ baseDir: dir });
  // low — 33% raw success
  store.trackSuccess('low', 0);
  store.trackFailure('low', 0);
  store.trackFailure('low', 0);
  // mid — 67%
  store.trackSuccess('mid', 0);
  store.trackSuccess('mid', 0);
  store.trackFailure('mid', 0);
  // high — 100%
  store.trackSuccess('high', 0);
  store.trackSuccess('high', 0);
  store.trackSuccess('high', 0);
  const ranked = store.rankSkills().map((r) => r.id);
  assert.deepEqual(ranked, ['high', 'mid', 'low']);
});

test('skill-confidence: preferHigherConfidence picks the winner', () => {
  const dir = mkTempDir('jarvis-skill');
  const store = createSkillConfidenceStore({ baseDir: dir });
  store.trackSuccess('a', 0);
  store.trackSuccess('a', 0);
  store.trackFailure('b', 0);
  store.trackFailure('b', 0);
  assert.equal(store.preferHigherConfidence(['a', 'b', 'c']), 'a');
  assert.equal(store.preferHigherConfidence([]), null);
});

test('computeConfidence: decay follows half-life curve', () => {
  const now = 1_700_000_000_000;
  const halfLife = DEFAULT_HALF_LIFE_DAYS;
  // Fresh: ageDays=0 → recency=1 → conf = 0.9 * 1 = 0.9
  assert.ok(
    Math.abs(
      computeConfidence(
        { successCount: 9, failureCount: 1, lastUsedAt: now },
        { now, halfLifeDays: halfLife },
      ) - 0.9,
    ) < 0.001,
  );
  // 1×halfLife old → recency ≈ 0.6839 → conf ≈ 0.6155
  const oneHalfLifeAgo = now - halfLife * 86_400_000;
  const conf = computeConfidence(
    { successCount: 9, failureCount: 1, lastUsedAt: oneHalfLifeAgo },
    { now, halfLifeDays: halfLife },
  );
  assert.ok(conf > 0.55 && conf < 0.7, `expected decay band, got ${conf}`);
});

test('skill-confidence: persistence across store reopen', () => {
  const dir = mkTempDir('jarvis-skill');
  const a = createSkillConfidenceStore({ baseDir: dir });
  a.trackSuccess('persisted', 1234);
  // reopen — fresh instance, same files
  const b = createSkillConfidenceStore({ baseDir: dir });
  const stats = b.getStats('persisted');
  assert.equal(stats.successCount, 1);
  assert.equal(stats.totalRuntimeMs, 1234);
});

test('skill-confidence: wipe clears all skills', () => {
  const dir = mkTempDir('jarvis-skill');
  const store = createSkillConfidenceStore({ baseDir: dir });
  store.trackSuccess('any', 0);
  store.wipe();
  assert.equal(store.rankSkills().length, 0);
});
