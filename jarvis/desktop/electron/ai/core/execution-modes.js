'use strict';

/**
 * Execution Modes — sets the ceiling/floor that Adaptive Thinking operates
 * within (Jarvis Core system #8, per the original goal text). Classifies
 * every request into quick | careful | deep before dispatch, so downstream
 * systems (Confidence Engine, Reality Check, Devil's Advocate) know how much
 * scrutiny to apply.
 */

const DEEP_PATTERNS = [
  /\bproduction\b/i,
  /\bdeploy(ment)?\b/i,
  /\bmigrat(e|ion)\b/i,
  /\bdrop\s+table\b/i,
  /\bdelete\s+(all|everything)\b/i,
  /\bforce[\s-]?push\b/i,
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
];

const MODE_CONFIG = {
  quick: { maxRetries: 1, requireReview: false, minChecks: ['output-sanity'] },
  careful: { maxRetries: 2, requireReview: true, minChecks: ['output-sanity', 'syntax'] },
  deep: { maxRetries: 3, requireReview: true, minChecks: ['output-sanity', 'syntax', 'patch-sanity', 'imports'] },
};

function decideExecutionMode({ message = '', contextType = null, retryCount = 0 } = {}) {
  const text = String(message || '');
  const isDeep = DEEP_PATTERNS.some((re) => re.test(text)) || (contextType === 'code' && Number(retryCount) > 0);
  const isCareful = !isDeep && (contextType === 'code' || text.length > 400);
  const mode = isDeep ? 'deep' : isCareful ? 'careful' : 'quick';
  return { mode, ...MODE_CONFIG[mode] };
}

module.exports = { decideExecutionMode, MODE_CONFIG, DEEP_PATTERNS };
