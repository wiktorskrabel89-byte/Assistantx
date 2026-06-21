'use strict';

// Jarvis Core #15 — Decision Context Layer + Executive Decision Engine
// contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDecisionContext, executiveDecide } = require('../electron/ai/core/decision-context');

test('buildDecisionContext: aggregates all inputs with sane defaults', () => {
  const ctx = buildDecisionContext({});
  assert.equal(ctx.mode, 'quick');
  assert.equal(ctx.confidence, null);
  assert.equal(ctx.realityCheckOk, null);
  assert.equal(ctx.reviewOk, null);
  assert.equal(ctx.advocateRisky, false);
});

test('buildDecisionContext: carries through real values', () => {
  const ctx = buildDecisionContext({
    mode: 'deep',
    confidence: 0.9,
    realityCheck: { ok: false, warnings: [{ type: 'known-failure' }] },
    review: { ok: true },
    trustScore: 0.8,
    advocate: { risky: true, flags: [{ id: 'rm-rf' }] },
  });
  assert.equal(ctx.mode, 'deep');
  assert.equal(ctx.confidence, 0.9);
  assert.equal(ctx.realityCheckOk, false);
  assert.equal(ctx.realityWarnings.length, 1);
  assert.equal(ctx.advocateRisky, true);
  assert.equal(ctx.advocateFlags.length, 1);
});

test('executiveDecide: risky advocate flags always win → flag-for-review', () => {
  const action = executiveDecide({ advocateRisky: true, reviewOk: true, confidence: 0.9 });
  assert.equal(action, 'flag-for-review');
});

test('executiveDecide: failed review → flag-for-review', () => {
  const action = executiveDecide({ advocateRisky: false, reviewOk: false });
  assert.equal(action, 'flag-for-review');
});

test('executiveDecide: failed reality check → proceed-with-warning', () => {
  const action = executiveDecide({ advocateRisky: false, reviewOk: true, realityCheckOk: false });
  assert.equal(action, 'proceed-with-warning');
});

test('executiveDecide: low confidence → proceed-with-warning', () => {
  const action = executiveDecide({ advocateRisky: false, reviewOk: true, realityCheckOk: true, confidence: 0.1 });
  assert.equal(action, 'proceed-with-warning');
});

test('executiveDecide: low trust score → proceed-with-warning', () => {
  const action = executiveDecide({ advocateRisky: false, reviewOk: true, realityCheckOk: true, confidence: 0.9, trustScore: 0.1 });
  assert.equal(action, 'proceed-with-warning');
});

test('executiveDecide: clean context → proceed', () => {
  const action = executiveDecide({ advocateRisky: false, reviewOk: true, realityCheckOk: true, confidence: 0.9, trustScore: 0.9 });
  assert.equal(action, 'proceed');
});
