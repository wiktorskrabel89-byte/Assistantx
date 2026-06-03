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
};

function decideRoute(analysis, options = {}) {
  const availability = options.availability || {};
  const profile = normalizeProfile(options.profile);
  const dispatch = options.dispatch || DEFAULT_DISPATCH;
  const ollamaAvailable = Boolean(
    availability.ollama_available && availability.required_models_present !== false,
  );
  const cloudOrder = normalizeCloudOrder(options.cloudProviderOrder);
  const intent = analysis.intent || 'chat';
  const slot = INTENT_TO_SLOT[intent] || 'chat';

  // Escalation triggers — push to a heavier model even if intent suggests chat.
  const escalate = analysis.confidence < 0.55
    || analysis.retryCount > 0
    || analysis.contextSize === 'huge'
    || analysis.codingDepth === 'architecture'
    || analysis.complexity === 'hard'
    || (analysis.priority || 0) >= 85;

  if (ollamaAvailable) {
    // Pick the dispatch slot, but if escalating a chat request, jump to code.
    const targetSlot = escalate && slot === 'chat' ? 'code' : slot;
    const model = dispatch[targetSlot] || dispatch.chat || DEFAULT_DISPATCH.chat;
    return {
      provider: 'ollama',
      model,
      lane: targetSlot,
      // Pin code/vision models to GPU 0 (heavy lane) and router to GPU 1.
      gpuAffinity: targetSlot === 'code' || targetSlot === 'vision' ? 'gpu0' : 'gpu1',
      keepAlive: targetSlot === 'code' ? '15m' : -1,
      reason: `intent-${intent}${escalate ? '-escalated' : ''}-${profile}`,
      intent,
      intentConfidence: analysis.intentConfidence,
      priority: analysis.priority,
      profile,
    };
  }

  // Cloud fallback path. The semantic intent still informs the model pick.
  const fallbackProvider = chooseCloudProvider(cloudOrder, availability.cloud?.providers || {});
  const cloudModel = resolveCloudModel(fallbackProvider, intent, escalate);
  return {
    provider: fallbackProvider,
    model: cloudModel,
    keepAlive: null,
    reason: `cloud-fallback-intent-${intent}${escalate ? '-escalated' : ''}`,
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
    },
    groq: {
      chat: 'llama-3.3-70b-versatile',
      code: 'qwen-2.5-coder-32b',
      vision: 'llama-3.2-90b-vision-preview',
      tool: 'llama-3.3-70b-versatile',
      memory: 'llama-3.3-70b-versatile',
    },
    google: {
      chat: 'gemini-2.0-flash',
      code: 'gemini-2.5-pro',
      vision: 'gemini-2.0-flash',
      tool: 'gemini-2.0-flash',
      memory: 'gemini-2.0-flash',
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
