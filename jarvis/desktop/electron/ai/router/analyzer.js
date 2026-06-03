'use strict';

/* ARCHITECT'S NOTE: INNOVATION
 * V2.0 semantic intent classifier — replaces the 4-field heuristic analyzer
 * with a multi-signal intent classifier that produces:
 *   { intent, intentConfidence, complexity, codingDepth, contextSize,
 *     retryCount, signals[], priority }
 *
 * Intents: 'code' | 'chat' | 'vision' | 'tool' | 'memory'
 * Signals are tagged keywords/patterns that contributed to the decision; the
 * policy layer uses them to pick the right dispatch model and lane.
 *
 * Why not embeddings yet? Tier 1 (eco) machines may not have a routing model
 * available. The keyword-based classifier ships universally; a follow-up will
 * call out to the local Qwen-1.5B router model on Tier 2+ via the `router`
 * dispatch slot (runtime-config.js HARDWARE_PROFILE_MODELS).
 */

const INTENT_PATTERNS = {
  code: [
    /\b(refactor|debug|fix|implement|write code|class|function|method|module|import|export|async|await|try\s*\{|except|interface|typescript|python|javascript|rust|golang)\b/i,
    /\b(github|repo|repository|commit|pull request|pr\b|merge|rebase|branch)\b/i,
    /```|\bcode\b/i,
  ],
  vision: [
    /\b(image|picture|photo|screenshot|describe.*image|what.*see|look at|recognize)\b/i,
    /\b(ocr|extract.*text.*from)\b/i,
  ],
  tool: [
    /\b(search|google|browse|open|navigate to|click|fill in|launch|run\b|execute|terminal|cli|shell)\b/i,
    /\b(file|folder|directory|read|write|save|delete|copy|move)\b/i,
  ],
  memory: [
    /\b(remember|recall|note|save this|jot down|earlier you said|previously|last time|history)\b/i,
  ],
  chat: [
    // Catch-all — chat is the default if nothing else matches strongly.
  ],
};

const URGENCY_HINTS = /\b(urgent|asap|now|immediately|quick|fast|right away)\b/i;
const POLITENESS_HINTS = /\b(please|could you|would you mind|thanks|thank you)\b/i;

function scoreIntent(text, patterns) {
  if (!patterns || patterns.length === 0) return 0;
  let hits = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) hits += 1;
  }
  return hits;
}

function classifyIntent(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { intent: 'chat', intentConfidence: 0.4, signals: [] };
  }
  const scores = {};
  const signals = [];
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'chat') continue; // chat is the fallback
    const hits = scoreIntent(trimmed, patterns);
    if (hits > 0) {
      scores[intent] = hits;
      signals.push(`${intent}:${hits}`);
    }
  }
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return { intent: 'chat', intentConfidence: 0.6, signals: [] };
  }
  entries.sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = entries[0];
  const totalHits = entries.reduce((sum, [, count]) => sum + count, 0);
  // Confidence rises with hit count and how dominant the top intent is.
  const dominance = totalHits > 0 ? topScore / totalHits : 0;
  const confidence = Math.min(0.95, 0.45 + (topScore * 0.12) + (dominance * 0.25));
  return { intent: topIntent, intentConfidence: +confidence.toFixed(2), signals };
}

function analyzeRequest(request = {}) {
  const text = String(request.message || '').trim();
  const length = text.length;
  const complexity = length > 800 ? 'hard' : length > 200 ? 'medium' : 'simple';
  const { intent, intentConfidence, signals } = classifyIntent(text);
  const urgent = URGENCY_HINTS.test(text);
  const polite = POLITENESS_HINTS.test(text);
  // Priority queue scoring — higher = preempts lower-priority requests.
  // Voice + urgent prompts get top priority; long-form code reviews are lower.
  let priority = 50;
  if (request.source === 'voice') priority += 30;
  if (urgent) priority += 20;
  if (intent === 'tool') priority += 10; // tool calls usually need fast turnaround
  if (intent === 'code' && complexity === 'hard') priority -= 10;

  return {
    intent,
    intentConfidence,
    complexity,
    confidence: request.confidence ?? intentConfidence,
    codingDepth: request.codingDepth || (/(refactor|architecture|debug)/i.test(text) ? 'architecture' : 'basic'),
    contextSize: request.contextSize || (length > 1200 ? 'huge' : length > 400 ? 'medium' : 'small'),
    retryCount: Number(request.retryCount || 0),
    signals,
    urgent,
    polite,
    priority,
  };
}

module.exports = { analyzeRequest, classifyIntent };
