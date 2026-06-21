'use strict';

/**
 * Intelligent Requirements System — given a goal, asks the chat model to
 * draft a structured Blueprint (requirements / features / tech stack /
 * risks / timeline / cost estimate) as strict JSON, then normalizes the
 * result so a malformed or partial model reply still yields a usable
 * blueprint shape instead of throwing.
 *
 * `dispatch` is injected as an async fn(prompt) => replyText so tests can
 * mock it — this module never makes a real LLM call itself.
 */

function buildRequirementsPrompt(goal) {
  return [
    'Draft a project blueprint for the following goal.',
    `Goal: ${goal}`,
    'Respond with ONLY a JSON object, no prose, no markdown fences, matching exactly this shape:',
    '{"requirements":string[],"features":string[],"techStack":string[],"risks":string[],"timeline":string,"costEstimate":string}',
  ].join('\n');
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function normalizeBlueprintFields(raw) {
  return {
    requirements: toStringArray(raw?.requirements),
    features: toStringArray(raw?.features),
    techStack: toStringArray(raw?.techStack),
    risks: toStringArray(raw?.risks),
    timeline: typeof raw?.timeline === 'string' ? raw.timeline : '',
    costEstimate: typeof raw?.costEstimate === 'string' ? raw.costEstimate : '',
  };
}

function extractJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function generateBlueprint({ goal, dispatch }) {
  const trimmedGoal = String(goal || '').trim();
  if (!trimmedGoal) throw new Error('requirements-engine: goal is required');
  if (typeof dispatch !== 'function') throw new Error('requirements-engine: dispatch is required');

  const reply = await dispatch(buildRequirementsPrompt(trimmedGoal));
  const parsed = extractJson(reply) || {};
  return {
    goal: trimmedGoal,
    ...normalizeBlueprintFields(parsed),
  };
}

module.exports = {
  generateBlueprint,
  buildRequirementsPrompt,
  normalizeBlueprintFields,
  extractJson,
};
