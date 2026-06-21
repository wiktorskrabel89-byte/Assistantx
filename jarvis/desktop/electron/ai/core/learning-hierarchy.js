'use strict';

/**
 * Learning Hierarchy spine + Skill Evolution System + Failure Analysis &
 * Learning Validation Engine + Success Analysis Engine — Jarvis Core
 * system #11. Sits on top of the existing skill-confidence-store +
 * knowledge-store: every tracked failure becomes a `lesson` knowledge
 * entity (Failure Analysis), every success streak becomes a symmetrical
 * "what worked" lesson (Success Analysis Engine), and both link back to a
 * `skill` entity so the lineage (lesson -> skill -> project) is queryable
 * (the Learning Hierarchy spine, via knowledgeStore relations).
 */

const SUCCESS_STREAK_INTERVAL = 5;

function ensureSkillEntity(skillId, knowledgeStore) {
  const id = `skill-${skillId}`;
  const existing = knowledgeStore.getEntity(id);
  if (existing) return existing;
  return knowledgeStore.upsertEntity({ id, type: 'skill', label: skillId, payload: {} });
}

function recordFailureLesson({ skillId, cause = 'unspecified', knowledgeStore } = {}) {
  if (!skillId || !knowledgeStore) return null;
  const skillEntity = ensureSkillEntity(skillId, knowledgeStore);
  const lesson = knowledgeStore.upsertEntity({
    type: 'lesson',
    label: `Porażka: ${skillId}`,
    payload: { failure: true, cause, fix: null, skillId },
  });
  knowledgeStore.link(lesson.id, skillEntity.id, 'learned_from');
  return lesson;
}

function recordSuccessAnalysis({ skillId, stats = {}, knowledgeStore } = {}) {
  if (!skillId || !knowledgeStore) return null;
  const successCount = Number(stats.successCount) || 0;
  if (successCount === 0 || successCount % SUCCESS_STREAK_INTERVAL !== 0) return null;
  const skillEntity = ensureSkillEntity(skillId, knowledgeStore);
  const lesson = knowledgeStore.upsertEntity({
    type: 'lesson',
    label: `Co działa: ${skillId}`,
    payload: { failure: false, cause: null, fix: null, skillId, successStreak: successCount },
  });
  knowledgeStore.link(lesson.id, skillEntity.id, 'learned_from');
  return lesson;
}

function lineage(skillId, knowledgeStore) {
  if (!skillId || !knowledgeStore) return [];
  const skillEntity = knowledgeStore.getEntity(`skill-${skillId}`);
  if (!skillEntity) return [];
  const relations = knowledgeStore.neighbors(skillEntity.id, { direction: 'in', type: 'learned_from' });
  return relations
    .map((rel) => knowledgeStore.getEntity(rel.from))
    .filter(Boolean);
}

module.exports = { recordFailureLesson, recordSuccessAnalysis, lineage, SUCCESS_STREAK_INTERVAL };
