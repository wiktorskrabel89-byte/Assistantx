'use strict';

/**
 * Free model catalog — Groq, OpenRouter, and Google AI Studio.
 *
 * Models here are available at zero per-token cost on the respective
 * platform's free tier (as of May 2026) and are enabled for the
 * 'pro' and 'pro+' Jarvis subscription plans.
 *
 * Structure per entry:
 *   provider  — matches a key in PROVIDER_CONFIG inside cloud-api.js
 *   model     — the exact model ID passed to the API
 *   label     — human-readable name shown in the UI
 *   context   — max context window in tokens
 *   tags      — capability tags used by the router to rank candidates
 *   plans     — which Jarvis plans unlock this model
 */

// ── Groq — free rate-limited tier ────────────────────────────────────────────
// https://console.groq.com/docs/models
const GROQ_FREE_MODELS = [
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    context: 128_000,
    tags: ['chat', 'reasoning', 'fast'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    context: 128_000,
    tags: ['chat', 'fast', 'lightweight'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'gemma2-9b-it',
    label: 'Gemma 2 9B IT',
    context: 8_192,
    tags: ['chat', 'fast'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B',
    context: 32_768,
    tags: ['chat', 'reasoning'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'llama3-70b-8192',
    label: 'Llama 3 70B',
    context: 8_192,
    tags: ['chat', 'reasoning'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'llama3-8b-8192',
    label: 'Llama 3 8B',
    context: 8_192,
    tags: ['chat', 'fast'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'qwen-qwq-32b',
    label: 'Qwen QwQ 32B (Reasoning)',
    context: 131_072,
    tags: ['reasoning', 'coding', 'math'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'groq',
    model: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill Llama 70B',
    context: 128_000,
    tags: ['reasoning', 'coding', 'math'],
    plans: ['pro', 'pro+'],
  },
];

// ── OpenRouter — free tier (`:free` suffix) ───────────────────────────────────
// https://openrouter.ai/models?q=free
const OPENROUTER_FREE_MODELS = [
  {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B Instruct (free)',
    context: 128_000,
    tags: ['chat', 'reasoning'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    label: 'Llama 3.1 8B Instruct (free)',
    context: 128_000,
    tags: ['chat', 'fast', 'lightweight'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'openrouter',
    model: 'google/gemma-2-9b-it:free',
    label: 'Gemma 2 9B IT (free)',
    context: 8_192,
    tags: ['chat', 'fast'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'openrouter',
    model: 'mistralai/mistral-7b-instruct:free',
    label: 'Mistral 7B Instruct (free)',
    context: 32_768,
    tags: ['chat', 'fast'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'openrouter',
    model: 'deepseek/deepseek-r1:free',
    label: 'DeepSeek R1 (free)',
    context: 128_000,
    tags: ['reasoning', 'coding', 'math'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'openrouter',
    model: 'deepseek/deepseek-chat-v3-0324:free',
    label: 'DeepSeek Chat V3 (free)',
    context: 64_000,
    tags: ['chat', 'coding'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'openrouter',
    model: 'qwen/qwen3-235b-a22b:free',
    label: 'Qwen3 235B A22B (free)',
    context: 131_072,
    tags: ['reasoning', 'coding', 'chat'],
    plans: ['pro+'],
  },
  {
    provider: 'openrouter',
    model: 'microsoft/phi-4-reasoning-plus:free',
    label: 'Phi-4 Reasoning Plus (free)',
    context: 16_384,
    tags: ['reasoning', 'math', 'fast'],
    plans: ['pro', 'pro+'],
  },
];

// ── Google AI Studio — free tier ─────────────────────────────────────────────
// https://ai.google.dev/gemini-api/docs/models
// Uses the OpenAI-compatible endpoint: https://generativelanguage.googleapis.com/v1beta/openai
const GOOGLE_FREE_MODELS = [
  {
    provider: 'google',
    model: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    context: 1_048_576,
    tags: ['chat', 'fast', 'multimodal'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'google',
    model: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    context: 1_048_576,
    tags: ['chat', 'fast', 'lightweight'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'google',
    model: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    context: 1_048_576,
    tags: ['chat', 'fast', 'multimodal'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'google',
    model: 'gemini-1.5-flash-8b',
    label: 'Gemini 1.5 Flash 8B',
    context: 1_048_576,
    tags: ['chat', 'fast', 'lightweight'],
    plans: ['pro', 'pro+'],
  },
  {
    provider: 'google',
    model: 'gemma-3-27b-it',
    label: 'Gemma 3 27B IT',
    context: 131_072,
    tags: ['chat', 'reasoning'],
    plans: ['pro', 'pro+'],
  },
];

// ── Unified catalog ───────────────────────────────────────────────────────────

const FREE_MODEL_CATALOG = [
  ...GROQ_FREE_MODELS,
  ...OPENROUTER_FREE_MODELS,
  ...GOOGLE_FREE_MODELS,
];

/**
 * Return all free models available for a given subscription plan.
 * @param {'pro'|'pro+'} plan
 * @returns {Array}
 */
function getFreeModelsForPlan(plan) {
  const normalized = String(plan || '').toLowerCase().trim();
  return FREE_MODEL_CATALOG.filter((entry) => entry.plans.includes(normalized));
}

/**
 * Return the best single free model for a context profile and plan.
 *
 * Priority:
 *   1. Groq (lowest latency)
 *   2. Google AI Studio (largest context)
 *   3. OpenRouter (broadest selection)
 *
 * Within each provider the first entry whose tags include the profile wins.
 *
 * @param {'chat'|'coding'|'reasoning'} profile
 * @param {'pro'|'pro+'} plan
 * @returns {{ provider: string, model: string, label: string }|null}
 */
function pickBestFreeModel(profile, plan) {
  const models = getFreeModelsForPlan(plan);
  if (!models.length) return null;

  const tag = String(profile || 'chat').toLowerCase();
  const priorityOrder = ['groq', 'google', 'openrouter'];

  for (const provider of priorityOrder) {
    const candidate = models.find(
      (m) => m.provider === provider && m.tags.includes(tag),
    );
    if (candidate) return candidate;
  }

  // Fallback: first model that matches the profile tag, any provider
  return models.find((m) => m.tags.includes(tag)) || models[0] || null;
}

/**
 * Return the default free model for the cloud engine mode (used by the router
 * when no explicit model config is provided).
 *
 * For 'pro'  → Groq Llama 3.3 70B Versatile
 * For 'pro+' → Groq Llama 3.3 70B Versatile (same, largest free model)
 */
const DEFAULT_FREE_CHAT_MODEL = GROQ_FREE_MODELS[0]; // llama-3.3-70b-versatile
const DEFAULT_FREE_CODING_MODEL = GROQ_FREE_MODELS.find((m) => m.tags.includes('coding'))
  || GROQ_FREE_MODELS[0];

module.exports = {
  FREE_MODEL_CATALOG,
  GROQ_FREE_MODELS,
  OPENROUTER_FREE_MODELS,
  GOOGLE_FREE_MODELS,
  getFreeModelsForPlan,
  pickBestFreeModel,
  DEFAULT_FREE_CHAT_MODEL,
  DEFAULT_FREE_CODING_MODEL,
};
