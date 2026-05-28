'use strict';

const LOCAL_LANE_MODELS = {
  fast: { model: 'qwen2.5-coder:14b', gpuAffinity: 'gpu0' },
  coding: { model: 'qwen2.5-coder:14b', gpuAffinity: 'gpu0' },
  utility: { model: 'gemma3:4b', gpuAffinity: 'gpu1' },
};

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
    const lane = resolveLocalLane(profile, escalate);
    return {
      provider: 'ollama',
      model: lane.model,
      lane: lane.name,
      gpuAffinity: lane.gpuAffinity,
      keepAlive: lane.name === 'coding' ? '15m' : -1,
      reason: lane.reason,
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
    reason: 'local-unavailable-fallback',
    profile,
  };
}

function normalizeProfile(profile) {
  const normalized = String(profile || '').toLowerCase().trim();
  if (normalized === 'coding' || normalized === 'tool') return normalized;
  return 'chat';
}

function resolveLocalLane(profile, escalate) {
  if (profile === 'coding') {
    return { name: 'coding', reason: 'coding-lane', ...LOCAL_LANE_MODELS.coding };
  }
  if (profile === 'tool' && !escalate) {
    return { name: 'utility', reason: 'utility-lane', ...LOCAL_LANE_MODELS.utility };
  }
  return { name: 'fast', reason: escalate ? 'fast-lane-escalated' : 'fast-lane', ...LOCAL_LANE_MODELS.fast };
}

function resolveCloudModel(provider, profile) {
  const providerName = String(provider || '').toLowerCase();
  const profileName = normalizeProfile(profile);
  const matrix = {
    openrouter: {
      chat: 'qwen/qwen-2.5-32b-instruct',
      coding: 'openai/gpt-4o',
      tool: 'google/gemini-2.0-flash',
    },
    groq: {
      chat: 'qwen-2.5-32b-instruct',
      coding: 'openai/gpt-4o',
      tool: 'google/gemini-2.0-flash',
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
  return normalized.length > 0 ? normalized : ['groq', 'openrouter'];
}

function chooseCloudProvider(order, providers = {}) {
  for (const candidate of normalizeCloudOrder(order)) {
    if (providers?.[candidate]?.ready) return candidate;
  }
  return normalizeCloudOrder(order)[0];
}

module.exports = { decideRoute };
