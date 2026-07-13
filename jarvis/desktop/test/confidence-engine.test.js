'use strict';

// Jarvis Core #8 — Confidence Engine contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeResponseConfidence } = require('../electron/ai/core/confidence-engine');

test('confidence-engine: baseline confidence for an ordinary ok response', () => {
  const score = computeResponseConfidence({ response: { ok: true, text: 'Here is the answer.' }, route: null, mode: 'quick' });
  assert.ok(score > 0.5 && score <= 1, `expected mid-high confidence, got ${score}`);
});

test('confidence-engine: failed response drops confidence sharply', () => {
  const score = computeResponseConfidence({ response: { ok: false, text: '' }, route: null, mode: 'quick' });
  assert.equal(score, 0);
});

test('confidence-engine: hedging language reduces confidence', () => {
  const hedged = computeResponseConfidence({ response: { ok: true, text: "I'm not sure, this might be wrong." }, route: null, mode: 'quick' });
  const plain = computeResponseConfidence({ response: { ok: true, text: 'This is correct.' }, route: null, mode: 'quick' });
  assert.ok(hedged < plain, `expected hedged (${hedged}) < plain (${plain})`);
});

test('confidence-engine: route confidence blends in', () => {
  const high = computeResponseConfidence({ response: { ok: true, text: 'ok' }, route: { confidence: 0.95 }, mode: 'quick' });
  const low = computeResponseConfidence({ response: { ok: true, text: 'ok' }, route: { confidence: 0.1 }, mode: 'quick' });
  assert.ok(high > low, `expected high route confidence (${high}) > low (${low})`);
});

test('confidence-engine: deep mode applies a small penalty', () => {
  const quick = computeResponseConfidence({ response: { ok: true, text: 'ok' }, route: null, mode: 'quick' });
  const deep = computeResponseConfidence({ response: { ok: true, text: 'ok' }, route: null, mode: 'deep' });
  assert.ok(deep < quick);
});

test('confidence-engine: score is always clamped to [0,1]', () => {
  const score = computeResponseConfidence({ response: { ok: true, text: "i'm not sure not certain unclear i don't know" }, route: { confidence: -5 }, mode: 'deep' });
  assert.ok(score >= 0 && score <= 1);
});
