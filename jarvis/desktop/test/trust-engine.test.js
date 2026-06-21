'use strict';

// Jarvis Core #12 — Trust Engine contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTrustEngine } = require('../electron/ai/core/trust-engine');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('trust-engine: unknown model has no trust score yet', () => {
  const trust = createTrustEngine({ baseDir: mkTempDir('jarvis-trust') });
  assert.equal(trust.trustScore('unknown-model'), null);
});

test('trust-engine: recordOutcome accumulates success/failure counts', () => {
  const trust = createTrustEngine({ baseDir: mkTempDir('jarvis-trust') });
  trust.recordOutcome('model-a', { ok: true, confidence: 0.9 });
  trust.recordOutcome('model-a', { ok: true, confidence: 0.8 });
  trust.recordOutcome('model-a', { ok: false, confidence: 0.3 });
  const score = trust.trustScore('model-a');
  assert.ok(score > 0 && score < 1, `expected mid-range score, got ${score}`);
});

test('trust-engine: a model with only successes scores near 1', () => {
  const trust = createTrustEngine({ baseDir: mkTempDir('jarvis-trust') });
  trust.recordOutcome('reliable', { ok: true, confidence: 1 });
  trust.recordOutcome('reliable', { ok: true, confidence: 1 });
  assert.equal(trust.trustScore('reliable'), 1);
});

test('trust-engine: a model with only failures scores 0', () => {
  const trust = createTrustEngine({ baseDir: mkTempDir('jarvis-trust') });
  trust.recordOutcome('unreliable', { ok: false, confidence: 0 });
  trust.recordOutcome('unreliable', { ok: false, confidence: 0 });
  assert.equal(trust.trustScore('unreliable'), 0);
});

test('trust-engine: rankModels sorts descending by trust score', () => {
  const trust = createTrustEngine({ baseDir: mkTempDir('jarvis-trust') });
  trust.recordOutcome('good', { ok: true, confidence: 1 });
  trust.recordOutcome('bad', { ok: false, confidence: 0 });
  const ranked = trust.rankModels();
  assert.deepEqual(ranked.map((r) => r.modelId), ['good', 'bad']);
});

test('trust-engine: persists across reopen', () => {
  const dir = mkTempDir('jarvis-trust');
  const a = createTrustEngine({ baseDir: dir });
  a.recordOutcome('persisted', { ok: true, confidence: 0.7 });
  const b = createTrustEngine({ baseDir: dir });
  assert.ok(b.trustScore('persisted') !== null);
});

test('trust-engine: wipe clears all model stats', () => {
  const trust = createTrustEngine({ baseDir: mkTempDir('jarvis-trust') });
  trust.recordOutcome('any', { ok: true });
  trust.wipe();
  assert.equal(trust.rankModels().length, 0);
});
