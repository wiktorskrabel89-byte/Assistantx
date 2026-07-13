'use strict';

/**
 * Reality Check Engine + Contradiction Detector + Simulation Engine —
 * Jarvis Core system #9. Pre-execution pipeline run BEFORE a request is
 * dispatched to a model: surfaces known-failure lessons (Reality Check),
 * direct contradictions of stored user preferences (Contradiction
 * Detector), and a syntax dry-run of any code fence already in the message
 * (Simulation Engine). All warnings — never blocks; Basic scope per the
 * Phase 1 LOCK LIST (full Universal Approval gating is later-phase work).
 */

function significantWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function checkKnownFailures(message, knowledgeStore) {
  if (!knowledgeStore || typeof knowledgeStore.listEntities !== 'function') return [];
  const requestWords = new Set(significantWords(message));
  if (requestWords.size === 0) return [];
  const lessons = knowledgeStore.listEntities({ type: 'lesson' });
  const warnings = [];
  for (const lesson of lessons) {
    const lessonWords = new Set(significantWords(`${lesson.label} ${lesson.payload?.cause || ''}`));
    let overlap = 0;
    for (const w of lessonWords) if (requestWords.has(w)) overlap += 1;
    if (overlap >= 2) {
      warnings.push({
        type: 'known-failure',
        lessonId: lesson.id,
        message: `Podobne do wcześniejszej porażki: ${lesson.label}`,
      });
    }
  }
  return warnings;
}

function splitPreferenceKey(key) {
  return String(key || '')
    .replace(/^(never|always)/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

function checkPreferenceContradictions(message, memoryStore) {
  if (!memoryStore || typeof memoryStore.snapshot !== 'function') return [];
  const text = String(message || '').toLowerCase();
  const preferences = memoryStore.snapshot()?.preferences || {};
  const warnings = [];
  for (const [key, value] of Object.entries(preferences)) {
    if (value !== true) continue;
    const phrase = splitPreferenceKey(key);
    if (!phrase) continue;
    if (/^never/i.test(key) && text.includes(phrase)) {
      warnings.push({
        type: 'preference-contradiction',
        preference: key,
        message: `Żądanie wspomina "${phrase}", ale preferencja "${key}" mówi: nigdy.`,
      });
    }
    if (/^always/i.test(key) && (text.includes(`don't ${phrase}`) || text.includes(`nie ${phrase}`) || text.includes(`skip ${phrase}`))) {
      warnings.push({
        type: 'preference-contradiction',
        preference: key,
        message: `Żądanie sugeruje pominięcie "${phrase}", ale preferencja "${key}" mówi: zawsze.`,
      });
    }
  }
  return warnings;
}

const BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}' };

function simulateSyntax(message) {
  const fenceMatch = String(message || '').match(/```[a-z]*\n([\s\S]*?)```/i);
  if (!fenceMatch) return { ok: true };
  const code = fenceMatch[1];
  const stack = [];
  for (const ch of code) {
    if (BRACKET_PAIRS[ch]) stack.push(BRACKET_PAIRS[ch]);
    else if ([')', ']', '}'].includes(ch)) {
      if (stack.pop() !== ch) return { ok: false, reason: 'unbalanced-brackets' };
    }
  }
  if (stack.length > 0) return { ok: false, reason: 'unbalanced-brackets' };
  return { ok: true };
}

function runRealityCheck({ message = '', knowledgeStore = null, memoryStore = null } = {}) {
  const warnings = [
    ...checkKnownFailures(message, knowledgeStore),
    ...checkPreferenceContradictions(message, memoryStore),
  ];
  const simulation = simulateSyntax(message);
  if (!simulation.ok) {
    warnings.push({ type: 'simulation-failed', message: `Symulacja składni nie powiodła się: ${simulation.reason}` });
  }
  return { ok: warnings.length === 0, warnings };
}

module.exports = {
  runRealityCheck,
  checkKnownFailures,
  checkPreferenceContradictions,
  simulateSyntax,
  significantWords,
};
