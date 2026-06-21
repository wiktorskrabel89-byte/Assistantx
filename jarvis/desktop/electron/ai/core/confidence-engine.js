'use strict';

/**
 * Confidence Engine — Jarvis Core system #8 (companion to Execution Modes).
 * Produces a 0-1 confidence score for a model response, combining the
 * router's own route confidence (if any) with response-shape heuristics.
 * Feeds Adaptive Thinking, Devil's Advocate, Trust Engine and Decision
 * Context Layer.
 */

const HEDGE_PATTERNS = [
  /\bi'?m not sure\b/i,
  /\bi am not sure\b/i,
  /\bmight be wrong\b/i,
  /\bcannot verify\b/i,
  /\bcan'?t verify\b/i,
  /\bnot certain\b/i,
  /\bi don'?t know\b/i,
  /\bunclear\b/i,
];

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function computeResponseConfidence({ response = {}, route = null, mode = 'quick' } = {}) {
  let score = 0.7;

  if (response?.ok === false) score -= 0.4;

  const text = String(response?.text || '');
  const hedgeHits = HEDGE_PATTERNS.reduce((count, re) => count + (re.test(text) ? 1 : 0), 0);
  score -= hedgeHits * 0.1;

  if (Number.isFinite(route?.confidence)) {
    score = (score + clamp01(Number(route.confidence))) / 2;
  }

  if (mode === 'deep') score -= 0.05;
  if (text.trim().length === 0) score = 0;

  return clamp01(Number(score.toFixed(3)));
}

module.exports = { computeResponseConfidence, HEDGE_PATTERNS };
