'use strict';

// M-Test — round-trip + graph integrity tests for the M7 knowledge store.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createKnowledgeStore } = require('../electron/memory/store/knowledge-store');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('knowledge-store: upsertEntity persists across reopens', () => {
  const dir = mkTempDir('jarvis-know');
  const store = createKnowledgeStore({ baseDir: dir });
  store.upsertEntity({ id: 'proj-aurora', type: 'project', label: 'Aurora', payload: { stage: 'design' } });
  store.upsertEntity({ id: 'skill-react', type: 'skill', label: 'React 18 hooks' });
  const reopened = createKnowledgeStore({ baseDir: dir });
  const projects = reopened.listEntities({ type: 'project' });
  assert.equal(projects.length, 1);
  assert.equal(projects[0].label, 'Aurora');
  assert.equal(projects[0].payload.stage, 'design');
  assert.equal(reopened.listEntities().length, 2);
});

test('knowledge-store: rejects unknown entity types', () => {
  const dir = mkTempDir('jarvis-know');
  const store = createKnowledgeStore({ baseDir: dir });
  assert.throws(() => store.upsertEntity({ type: 'galaxy', label: 'Andromeda' }));
});

test('knowledge-store: link + neighbors traversal', () => {
  const dir = mkTempDir('jarvis-know');
  const store = createKnowledgeStore({ baseDir: dir });
  store.upsertEntity({ id: 'proj-x', type: 'project', label: 'X' });
  store.upsertEntity({ id: 'skill-y', type: 'skill', label: 'Y' });
  store.upsertEntity({ id: 'lesson-z', type: 'lesson', label: 'Z' });
  store.link('proj-x', 'skill-y', 'uses');
  store.link('proj-x', 'lesson-z', 'learned_from');
  const out = store.neighbors('proj-x', { direction: 'out' });
  assert.equal(out.length, 2);
  const onlyUses = store.neighbors('proj-x', { type: 'uses' });
  assert.equal(onlyUses.length, 1);
  assert.equal(onlyUses[0].to, 'skill-y');
});

test('knowledge-store: removeEntity cascades to relations', () => {
  const dir = mkTempDir('jarvis-know');
  const store = createKnowledgeStore({ baseDir: dir });
  store.upsertEntity({ id: 'a', type: 'project', label: 'A' });
  store.upsertEntity({ id: 'b', type: 'skill', label: 'B' });
  store.link('a', 'b', 'uses');
  assert.equal(store.neighbors('a').length, 1);
  store.removeEntity('a');
  // Relations referencing the removed entity should be gone too.
  assert.equal(store.neighbors('b').length, 0);
  assert.equal(store.snapshot().relations.length, 0);
});
