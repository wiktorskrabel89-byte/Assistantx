'use strict';

// Jarvis Core #13 — Self Diagnostic Engine contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeSelfDiagnosticReport, createSelfDiagnosticEngine } = require('../electron/ai/core/self-diagnostic');

test('computeSelfDiagnosticReport: all-healthy inputs produce healthy status', () => {
  const report = computeSelfDiagnosticReport({
    healthSnapshot: { subsystems: { sidecar: { status: 'healthy' }, ollama: { status: 'healthy' } } },
    trustModels: [{ modelId: 'a', score: 0.9 }],
    recentReviewOutcomes: [true, true, true],
  });
  assert.equal(report.status, 'healthy');
  assert.equal(report.score, 1);
});

test('computeSelfDiagnosticReport: an unavailable subsystem makes it unhealthy', () => {
  const report = computeSelfDiagnosticReport({
    healthSnapshot: { subsystems: { sidecar: { status: 'unavailable' } } },
    trustModels: [],
    recentReviewOutcomes: [],
  });
  assert.equal(report.status, 'unhealthy');
});

test('computeSelfDiagnosticReport: high review failure rate makes it unhealthy', () => {
  const report = computeSelfDiagnosticReport({
    healthSnapshot: { subsystems: {} },
    trustModels: [],
    recentReviewOutcomes: [false, false, true],
  });
  assert.equal(report.status, 'unhealthy');
  assert.ok(report.reviewFailRate > 0.5);
});

test('computeSelfDiagnosticReport: degraded subsystem without failures is degraded, not unhealthy', () => {
  const report = computeSelfDiagnosticReport({
    healthSnapshot: { subsystems: { ollama: { status: 'degraded' } } },
    trustModels: [],
    recentReviewOutcomes: [true, true],
  });
  assert.equal(report.status, 'degraded');
});

test('createSelfDiagnosticEngine: runOnce emits a report event and returns it', () => {
  const engine = createSelfDiagnosticEngine({
    getHealthSnapshot: () => ({ subsystems: { sidecar: { status: 'healthy' } } }),
    getTrustModels: () => [],
  });
  let emitted = null;
  engine.on('report', (r) => { emitted = r; });
  const result = engine.runOnce();
  assert.equal(result.status, 'healthy');
  assert.deepEqual(emitted, result);
});

test('createSelfDiagnosticEngine: recordReviewOutcome feeds into the next report', () => {
  const engine = createSelfDiagnosticEngine({
    getHealthSnapshot: () => ({ subsystems: {} }),
    getTrustModels: () => [],
  });
  engine.recordReviewOutcome(false);
  engine.recordReviewOutcome(false);
  const report = engine.runOnce();
  assert.equal(report.reviewFailRate, 1);
  assert.equal(report.status, 'unhealthy');
});

test('createSelfDiagnosticEngine: start/stop do not throw', () => {
  const engine = createSelfDiagnosticEngine({ intervalMs: 50_000 });
  engine.start();
  engine.start(); // idempotent
  engine.stop();
  engine.stop(); // idempotent
});
