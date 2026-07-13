'use strict';

// Jarvis Core #8 — Adaptive Thinking Engine orchestration contract tests
// (the umbrella that gates Execution Modes + Confidence Engine output for
// downstream systems).

const test = require('node:test');
const assert = require('node:assert/strict');

const { preflight, postflight, LOW_CONFIDENCE_THRESHOLD } = require('../electron/ai/core/adaptive-thinking');

test('preflight: delegates to execution-modes classification', () => {
  const result = preflight({ message: 'rm -rf the project', contextType: null, retryCount: 0 });
  assert.equal(result.mode, 'deep');
});

test('postflight: confident ok response does not escalate', () => {
  const { confidence, escalate } = postflight({ response: { ok: true, text: 'This is correct.' }, route: { confidence: 0.95 }, mode: 'quick' });
  assert.ok(confidence >= LOW_CONFIDENCE_THRESHOLD);
  assert.equal(escalate, false);
});

test('postflight: failed response escalates', () => {
  const { confidence, escalate } = postflight({ response: { ok: false, text: '' }, route: null, mode: 'quick' });
  assert.equal(confidence, 0);
  assert.equal(escalate, true);
});
