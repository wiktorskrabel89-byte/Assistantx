'use strict';

/**
 * Adaptive Thinking Engine — Jarvis Core system #8 umbrella. Combines
 * Execution Modes (ceiling/floor) with the Confidence Engine score to decide
 * whether downstream gates (Reality Check, Basic Review, Devil's Advocate)
 * should escalate beyond their mode's minimum checks. Pure/stateless — every
 * call takes its dependencies as plain functions so it composes without an
 * orchestrator class.
 */

const { decideExecutionMode } = require('./execution-modes');
const { computeResponseConfidence } = require('./confidence-engine');

const LOW_CONFIDENCE_THRESHOLD = 0.45;

function preflight({ message, contextType, retryCount } = {}) {
  return decideExecutionMode({ message, contextType, retryCount });
}

function postflight({ response, route, mode } = {}) {
  const confidence = computeResponseConfidence({ response, route, mode });
  const escalate = confidence < LOW_CONFIDENCE_THRESHOLD;
  return { confidence, escalate };
}

module.exports = { preflight, postflight, LOW_CONFIDENCE_THRESHOLD };
