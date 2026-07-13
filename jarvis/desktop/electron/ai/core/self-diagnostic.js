'use strict';

/**
 * Self Diagnostic Engine — Jarvis Core system #13. Background health
 * monitor that aggregates several existing signals (sidecar/ollama/network
 * status from health-observer.js, Trust Engine model reliability, recent
 * Basic Review Pipeline outcomes) into one overall status, on the same
 * periodic-timer + EventEmitter pattern as health-observer.js.
 */

const EventEmitter = require('events');

const DEFAULT_INTERVAL_MS = 30_000;
const REVIEW_RING_SIZE = 50;

function computeSelfDiagnosticReport({ healthSnapshot = null, trustModels = [], recentReviewOutcomes = [] } = {}) {
  const subsystems = healthSnapshot?.subsystems || {};
  const subsystemStatuses = Object.values(subsystems).map((s) => s.status);
  const anyUnavailable = subsystemStatuses.includes('unavailable');
  const anyDegraded = subsystemStatuses.includes('degraded');

  const avgTrust = trustModels.length
    ? trustModels.reduce((sum, m) => sum + (Number(m.score) || 0), 0) / trustModels.length
    : null;

  const reviewFailRate = recentReviewOutcomes.length
    ? recentReviewOutcomes.filter((ok) => !ok).length / recentReviewOutcomes.length
    : 0;

  let status = 'healthy';
  if (anyUnavailable || reviewFailRate > 0.5 || (avgTrust !== null && avgTrust < 0.3)) {
    status = 'unhealthy';
  } else if (anyDegraded || reviewFailRate > 0.2 || (avgTrust !== null && avgTrust < 0.6)) {
    status = 'degraded';
  }

  const score = Number((1 - reviewFailRate) .toFixed(3));

  return {
    status,
    score,
    avgTrust,
    reviewFailRate: Number(reviewFailRate.toFixed(3)),
    subsystems: Object.fromEntries(Object.entries(subsystems).map(([k, v]) => [k, v.status])),
    timestamp: Date.now(),
  };
}

function createSelfDiagnosticEngine({ intervalMs = DEFAULT_INTERVAL_MS, getHealthSnapshot = () => null, getTrustModels = () => [] } = {}) {
  const emitter = new EventEmitter();
  const reviewOutcomes = [];
  let timer = null;

  function recordReviewOutcome(ok) {
    reviewOutcomes.push(Boolean(ok));
    if (reviewOutcomes.length > REVIEW_RING_SIZE) reviewOutcomes.shift();
  }

  function runOnce() {
    const report = computeSelfDiagnosticReport({
      healthSnapshot: getHealthSnapshot(),
      trustModels: getTrustModels(),
      recentReviewOutcomes: reviewOutcomes,
    });
    emitter.emit('report', report);
    return report;
  }

  function start() {
    if (timer) return;
    timer = setInterval(runOnce, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    recordReviewOutcome,
    runOnce,
    start,
    stop,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };
}

module.exports = { createSelfDiagnosticEngine, computeSelfDiagnosticReport, DEFAULT_INTERVAL_MS };
