'use strict';

function decideRoute(analysis, options = {}) {
  const availability = options.availability || {};
  const profile = normalizeProfile(options.profile);
  const ollamaAvailable = Boolean(availability.ollama_available && availability.required_models_present !== false);
  const cloudOrder = normalizeCloudOrder(options.cloudProviderOrder);
  const escalate = analysis.confidence < 0.55
    || analysis.retryCount > 0
    || analysis.contextSize === 'huge'
    || analysis.codingDepth === 'architecture'
    || analysis.complexity === 'hard';

  if (ollamaAvailable) {
    return {
      provider: 'ollama',
      model: resolveLocalModel(profile, escalate),
      keepAlive: escalate ? '5m' : -1,
      reason: escalate ? 'escalation' : 'fast-lane',
      profile,
    };
  }

  const fallbackProvider = chooseCloudProvider(cloudOrder, availability.cloud?.providers || {});
  const target = {
    provider: fallbackProvider,
    model: resolveCloudModel(
      fallbackProvider,
      escalate ? 'coding' : profile,
    ),
  };

  return {
    provider: target.provider,
    model: target.model || resolveCloudModel(target.provider, profile),
    keepAlive: null,
    reason: escalate ? 'escalation' : 'fast-lane',
    profile,
  };
}

function normalizeProfile(profile) {
  const normalized = String(profile || '').toLowerCase().trim();
  if (normalized === 'coding' || normalized === 'tool') return normalized;
  return 'chat';
}

function resolveLocalModel(profile, escalate) {
  if (profile === 'coding') return 'qwen2.5-coder:14b';
  if (profile === 'tool') return escalate ? 'qwen2.5-coder:14b' : 'gemma4:e4b';
  return escalate ? 'qwen2.5-coder:14b' : 'gemma4:e4b';
}

function resolveCloudModel(provider, profile) {
  const providerName = String(provider || '').toLowerCase();
  const profileName = normalizeProfile(profile);
  const matrix = {
    openrouter: {
      chat: 'google/gemma-2-9b-it',
      coding: 'qwen/qwen-2.5-coder-14b-instruct',
      tool: 'qwen/qwen-2.5-coder-14b-instruct',
    },
    groq: {
      chat: 'qwen/qwen3-32b',
      coding: 'llama-3.3-70b-versatile',
      tool: 'llama-3.3-70b-versatile',
    },
    anthropic: {
      chat: 'claude-3-5-sonnet-20241022',
      coding: 'claude-3-5-sonnet-20241022',
      tool: 'claude-3-5-sonnet-20241022',
    },
  };
  const providerMatrix = matrix[providerName] || matrix.openrouter;
  return providerMatrix[profileName] || providerMatrix.chat;
}

function normalizeCloudOrder(order) {
  const fromInput = Array.isArray(order) ? order : String(order || '').split(',');
  const normalized = fromInput
    .map((item) => String(item || '').toLowerCase().trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
  return normalized.length > 0 ? normalized : ['groq', 'openrouter', 'anthropic'];
}

function chooseCloudProvider(order, providers = {}) {
  for (const candidate of normalizeCloudOrder(order)) {
    if (providers?.[candidate]?.ready) return candidate;
  }
  return normalizeCloudOrder(order)[0];
}

module.exports = { decideRoute };
