'use strict';

/* ARCHITECT'S NOTE: INNOVATION
 * V2.0 semantic intent classifier — replaces the 4-field heuristic analyzer
 * with a multi-signal intent classifier that produces:
 *   { intent, intentConfidence, complexity, codingDepth, contextSize,
 *     retryCount, signals[], priority }
 *
 * Intents: 'code' | 'chat' | 'vision' | 'tool' | 'memory' | 'reasoning'
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
    /\b(make|create|build|write|generate)\s+(?:a\s+|the\s+|this\s+)?(component|function|script|page|app|website|class|module|endpoint|api)\b/i,
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
  reasoning: [
    /\b(deep[- ]?research|research (this|the|into)|investigate|deep dive|in[- ]depth|thorough(ly)? analy[sz]e|comprehensive (analysis|report|review)|literature review)\b/i,
    /\b(think (it |this )?(through|step by step)|step[- ]by[- ]step|chain of thought|reason (about|through)|multi[- ]step|work through)\b/i,
    /\b(compare .*(options|approaches|alternatives|trade[- ]?offs)|pros and cons|evaluate .*(strategy|strategies|options)|long[- ]term plan|roadmap)\b/i,
  ],
  chat: [
    // Catch-all — chat is the default if nothing else matches strongly.
  ],
};

// Heavy-coding markers: complex multi-file/architecture work that should go
// to the extended coding tier instead of the standard coder model.
const HEAVY_CODE_HINTS = [
  /\b(architecture|architect|redesign|re-?architect|system design)\b/i,
  /\b(entire|whole|across the) (repo|repository|codebase|project)\b/i,
  /\b(multi[- ]file|large[- ]scale refactor|migration|rewrite)\b/i,
  /\b(race condition|deadlock|memory leak|performance profil|optimi[sz]e .*(hot path|throughput|latency))\b/i,
];

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

function classifyIntent(text, { hasImage = false, exclude = [] } = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    // An attached image with no prompt is still a vision request.
    return hasImage
      ? { intent: 'vision', intentConfidence: 0.9, signals: ['vision:image-attached'] }
      : { intent: 'chat', intentConfidence: 0.4, signals: [] };
  }
  const excluded = new Set(exclude);
  const scores = {};
  const signals = [];
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'chat') continue; // chat is the fallback
    if (excluded.has(intent)) continue;
    const hits = scoreIntent(trimmed, patterns);
    if (hits > 0) {
      scores[intent] = hits;
      signals.push(`${intent}:${hits}`);
    }
  }
  if (hasImage) {
    // Image attachments are a strong vision signal regardless of phrasing —
    // keyword matching alone misses prompts like "what's wrong here?".
    scores.vision = (scores.vision || 0) + 2;
    signals.push('vision:image-attached');
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
  const hasImage = Boolean(request.hasImage)
    || (Array.isArray(request.images) && request.images.length > 0);
  const complexity = length > 800 ? 'hard' : length > 200 ? 'medium' : 'simple';
  const { intent, intentConfidence, signals } = classifyIntent(text, { hasImage });
  const urgent = URGENCY_HINTS.test(text);
  const polite = POLITENESS_HINTS.test(text);
  // Heavy-coding detection routes complex code work to the extended tier.
  const codingHeavy = intent === 'code' && (
    complexity === 'hard'
    || HEAVY_CODE_HINTS.some((pattern) => pattern.test(text))
  );
  // A vision request that ALSO carries code/chat/reasoning signals needs the
  // vision→LLM relay: the vision model describes, a text model answers.
  // Vision patterns are excluded so words like "screenshot" don't mask the
  // residual intent ("write the component shown in this screenshot" → code).
  const secondaryIntent = hasImage
    ? classifyIntent(text, { hasImage: false, exclude: ['vision'] }).intent
    : null;
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
    codingHeavy,
    hasImage,
    secondaryIntent,
    contextSize: request.contextSize || (length > 1200 ? 'huge' : length > 400 ? 'medium' : 'small'),
    retryCount: Number(request.retryCount || 0),
    signals,
    urgent,
    polite,
    priority,
  };
}

module.exports = { analyzeRequest, classifyIntent };
