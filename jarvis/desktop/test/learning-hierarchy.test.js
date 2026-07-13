'use strict';

// Jarvis Core #11 — Learning Hierarchy + Skill Evolution + Failure Analysis
// & Learning Validation + Success Analysis Engine contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createKnowledgeStore } = require('../electron/memory/store/knowledge-store');
const { recordFailureLesson, recordSuccessAnalysis, lineage } = require('../electron/ai/core/learning-hierarchy');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('recordFailureLesson: creates a lesson entity and links it to a skill entity', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-lh') });
  const lesson = recordFailureLesson({ skillId: 'build-landing-page', cause: 'timeout', knowledgeStore });
  assert.equal(lesson.type, 'lesson');
  assert.equal(lesson.payload.failure, true);
  assert.equal(lesson.payload.cause, 'timeout');
  const skillEntity = knowledgeStore.getEntity('skill-build-landing-page');
  assert.ok(skillEntity, 'expected an auto-created skill entity');
  assert.equal(skillEntity.type, 'skill');
});

test('recordSuccessAnalysis: only fires on success-streak intervals', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-lh') });
  assert.equal(recordSuccessAnalysis({ skillId: 'x', stats: { successCount: 1 }, knowledgeStore }), null);
  assert.equal(recordSuccessAnalysis({ skillId: 'x', stats: { successCount: 4 }, knowledgeStore }), null);
  const lesson = recordSuccessAnalysis({ skillId: 'x', stats: { successCount: 5 }, knowledgeStore });
  assert.ok(lesson);
  assert.equal(lesson.payload.failure, false);
  assert.equal(lesson.payload.successStreak, 5);
});

test('lineage: returns lessons linked to a skill via learned_from relations', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-lh') });
  recordFailureLesson({ skillId: 'deploy', cause: 'oops', knowledgeStore });
  recordSuccessAnalysis({ skillId: 'deploy', stats: { successCount: 5 }, knowledgeStore });
  const lessons = lineage('deploy', knowledgeStore);
  assert.equal(lessons.length, 2);
  assert.ok(lessons.every((l) => l.type === 'lesson'));
});

test('lineage: empty array when the skill has never been tracked', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-lh') });
  assert.deepEqual(lineage('never-seen', knowledgeStore), []);
});

test('recordFailureLesson: returns null without a skillId or store', () => {
  assert.equal(recordFailureLesson({}), null);
});
