'use strict';

/* ARCHITECT'S NOTE: INNOVATION
 * V2.0 tier-aware semantic policy. The legacy policy was a 3-lane switch
 * (fast / coding / utility) bound to hardcoded Ollama tags. The new policy:
 *   1. Reads the live HARDWARE_PROFILE_MODELS dispatch table so the user's
 *      benchmarked tier (eco / standard / pro) actually picks the right model.
 *   2. Maps semantic intent (chat / code / vision / tool / memory) to the
 *      matching dispatch slot.
 *   3. Honors priority from the analyzer — high-priority requests can
 *      preempt cloud fallback with a more expensive local model.
 *   4. Falls back through ordered cloud providers if Ollama is unavailable.
 */

// Default dispatch table used when the caller doesn't pass one (e.g. early
// startup before runtime-config has resolved). Mirrors the 'standard' tier.
const DEFAULT_DISPATCH = {
  chat: 'gemma3:4b',
  code: 'qwen2.5-coder:7b',
  code_heavy: 'qwen2.5-coder:14b',
  reasoning: 'deepseek-r1:8b',
  router: 'qwen2.5:1.5b',
  vision: 'moondream2:1.4b',
};

// Map of intent → preferred dispatch slot. Most intents map 1:1 but some
// (memory, tool) reuse the chat model because they're conversational.
const INTENT_TO_SLOT = {
  chat: 'chat',
  code: 'code',
  vision: 'vision',
  tool: 'chat',
  memory: 'chat',
  reasoning: 'reasoning',
};

// When the preferred slot's model isn't installed locally, walk down this
// chain instead of failing the request (or silently using a wrong model).
const SLOT_FALLBACK_CHAIN = {
  chat: ['chat'],
  code: ['code', 'chat'],
  code_heavy: ['code_heavy', 'code', 'chat'],
  reasoning: ['reasoning', 'code_heavy', 'code', 'chat'],
  vision: ['vision'],
  router: ['router', 'chat'],
};

// Heavy lanes get pinned to GPU 0 and stay warm longer.
const HEAVY_SLOTS = new Set(['code', 'code_heavy', 'reasoning', 'vision']);
const SLOT_KEEP_ALIVE = {
  code: '15m',
  code_heavy: '15m',
  reasoning: '10m',
};

function resolveLocalSlot(slot, dispatch, installedModels) {
  const chain = SLOT_FALLBACK_CHAIN[slot] || [slot, 'chat'];
  const installed = Array.isArray(installedModels) ? installedModels : [];
  for (const candidate of chain) {
    const model = dispatch[candidate];
    if (!model) continue;
    // Only enforce installed-model checks when we actually know the list —
    // an empty list usually means the probe hasn't run yet.
    if (installed.length > 0 && !installed.includes(model)) continue;
    return { slot: candidate, model };
  }
  // A text model cannot stand in for vision — let the caller fall through to
  // a cloud vision model instead of hallucinating about an unseen image.
  if (slot === 'vision') return null;
  const fallbackModel = dispatch.chat || DEFAULT_DISPATCH.chat;
  return fallbackModel ? { slot: 'chat', model: fallbackModel } : null;
}

function decideRoute(analysis, options = {}) {
  const availability = options.availability || {};
  const profile = normalizeProfile(options.profile);
  const dispatch = { ...DEFAULT_DISPATCH, ...(options.dispatch || {}) };
  const ollamaAvailable = Boolean(
    availability.ollama_available && availability.required_models_present !== false,
  );
  const cloudOrder = normalizeCloudOrder(options.cloudProviderOrder);
  const intent = analysis.intent || 'chat';
  let slot = INTENT_TO_SLOT[intent] || 'chat';

  // Escalation triggers — push to a heavier model even if intent suggests chat.
  const escalate = analysis.confidence < 0.55
    || analysis.retryCount > 0
    || analysis.contextSize === 'huge'
    || analysis.codingDepth === 'architecture'
    || analysis.complexity === 'hard'
    || (analysis.priority || 0) >= 85;

  // Escalation ladder:
  //   chat  → reasoning  (complex multi-step thinking)
  //   code  → code_heavy (deep/multi-file coding)
  if (slot === 'chat' && escalate) slot = 'reasoning';
  if (slot === 'code' && (escalate || analysis.codingHeavy)) slot = 'code_heavy';

  // Vision requests that also need conversational/code reasoning run as a
  // two-stage relay: vision model describes → text model answers. The router
  // (index.js) executes the relay; policy only flags it and picks stage one.
  const relayIntent = intent === 'vision'
    && analysis.secondaryIntent
    && analysis.secondaryIntent !== 'vision'
    && analysis.secondaryIntent !== 'chat'
    ? analysis.secondaryIntent
    : (intent === 'vision' && analysis.secondaryIntent === 'chat' && analysis.hasImage ? 'chat' : null);

  if (ollamaAvailable) {
    const resolved = resolveLocalSlot(slot, dispatch, availability.installed_models);
    if (resolved) {
      const relaySlot = relayIntent
        ? resolveLocalSlot(INTENT_TO_SLOT[relayIntent] || 'chat', dispatch, availability.installed_models)
        : null;
      return {
        provider: 'ollama',
        model: resolved.model,
        lane: resolved.slot,
        // Pin heavy models (code/vision/reasoning) to GPU 0, router to GPU 1.
        gpuAffinity: HEAVY_SLOTS.has(resolved.slot) ? 'gpu0' : 'gpu1',
        keepAlive: SLOT_KEEP_ALIVE[resolved.slot] || -1,
        reason: `intent-${intent}${escalate ? '-escalated' : ''}${analysis.codingHeavy ? '-heavy' : ''}-${profile}`,
        relay: relayIntent && relaySlot ? { intent: relayIntent, model: relaySlot.model, slot: relaySlot.slot } : null,
        intent,
        intentConfidence: analysis.intentConfidence,
        priority: analysis.priority,
        profile,
      };
    }
  }

  // Cloud fallback path. The semantic intent still informs the model pick.
  // If no cloud provider is actually ready, drop the escalation flag so we
  // pick the cheaper chat-tier model instead of paying for GPT-4o etc. on
  // a request that's about to fail anyway.
  const providers = availability.cloud?.providers || {};
  const fallbackProvider = chooseCloudProvider(cloudOrder, providers);
  const cloudReady = Boolean(providers?.[fallbackProvider]?.ready);
  const effectiveEscalate = escalate && cloudReady;
  const cloudModel = resolveCloudModel(fallbackProvider, intent, effectiveEscalate);
  return {
    provider: fallbackProvider,
    model: cloudModel,
    keepAlive: null,
    reason: `cloud-fallback-intent-${intent}${effectiveEscalate ? '-escalated' : ''}${cloudReady ? '' : '-no-ready-provider'}`,
    intent,
    intentConfidence: analysis.intentConfidence,
    priority: analysis.priority,
    profile,
  };
}

function normalizeProfile(profile) {
  const normalized = String(profile || '').toLowerCase().trim();
  if (['eco', 'standard', 'pro'].includes(normalized)) return normalized;
  // Legacy profile names from V1.0 — fold them onto the new tier system.
  if (normalized === 'coding') return 'pro';
  if (normalized === 'tool') return 'standard';
  return 'standard';
}

function resolveCloudModel(provider, intent, escalate) {
  const providerName = String(provider || '').toLowerCase();
  // Cloud matrix keyed by intent. Falls back to chat if intent unknown.
  const matrix = {
    openrouter: {
      chat: 'qwen/qwen-2.5-32b-instruct',
      code: escalate ? 'openai/gpt-4o' : 'qwen/qwen-2.5-coder-32b-instruct',
      vision: 'google/gemini-2.0-flash',
      tool: 'google/gemini-2.0-flash',
      memory: 'qwen/qwen-2.5-32b-instruct',
      reasoning: 'deepseek/deepseek-r1',
    },
    groq: {
      chat: 'llama-3.3-70b-versatile',
      code: 'qwen-2.5-coder-32b',
      vision: 'llama-3.2-90b-vision-preview',
      tool: 'llama-3.3-70b-versatile',
      memory: 'llama-3.3-70b-versatile',
      reasoning: 'deepseek-r1-distill-llama-70b',
    },
    google: {
      chat: 'gemini-2.0-flash',
      code: 'gemini-2.5-pro',
      vision: 'gemini-2.0-flash',
      tool: 'gemini-2.0-flash',
      memory: 'gemini-2.0-flash',
      reasoning: 'gemini-2.5-pro',
    },
  };
  const providerMatrix = matrix[providerName] || matrix.openrouter;
  return providerMatrix[intent] || providerMatrix.chat;
}

function normalizeCloudOrder(order) {
  const fromInput = Array.isArray(order) ? order : String(order || '').split(',');
  const normalized = fromInput
    .map((item) => String(item || '').toLowerCase().trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
  return normalized.length > 0 ? normalized : ['groq', 'openrouter', 'google'];
}

function chooseCloudProvider(order, providers = {}) {
  for (const candidate of normalizeCloudOrder(order)) {
    if (providers?.[candidate]?.ready) return candidate;
  }
  return normalizeCloudOrder(order)[0];
}

module.exports = { decideRoute, classifyIntent: undefined /* re-exported below for ergonomics */ };
// Convenience re-export so callers don't need two requires.
module.exports.classifyIntent = require('./analyzer').classifyIntent;
