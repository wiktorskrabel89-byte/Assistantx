'use strict';

/**
 * Decision Context Layer + Executive Decision Engine — Jarvis Core
 * system #15. Aggregates every other Jarvis Core signal (Execution Mode,
 * Confidence Engine, Reality Check, Basic Review, Trust Engine, Devil's
 * Advocate) into one Decision Context struct, then the Executive Decision
 * Engine maps that struct onto a final action. Must exist before any future
 * Multi-Agent System work consumes it (per the original goal text — Multi-
 * Agent is explicitly deferred and out of scope here).
 */

function buildDecisionContext({ mode, confidence, realityCheck, review, trustScore, advocate } = {}) {
  return {
    mode: mode || 'quick',
    confidence: Number.isFinite(confidence) ? confidence : null,
    realityCheckOk: realityCheck ? Boolean(realityCheck.ok) : null,
    realityWarnings: realityCheck?.warnings || [],
    reviewOk: review ? Boolean(review.ok) : null,
    trustScore: Number.isFinite(trustScore) ? trustScore : null,
    advocateRisky: advocate ? Boolean(advocate.risky) : false,
    advocateFlags: advocate?.flags || [],
  };
}

function executiveDecide(context = {}) {
  if (context.advocateRisky) return 'flag-for-review';
  if (context.reviewOk === false) return 'flag-for-review';
  if (context.realityCheckOk === false) return 'proceed-with-warning';
  if (Number.isFinite(context.confidence) && context.confidence < 0.45) return 'proceed-with-warning';
  if (Number.isFinite(context.trustScore) && context.trustScore < 0.3) return 'proceed-with-warning';
  return 'proceed';
}

module.exports = { buildDecisionContext, executiveDecide };
