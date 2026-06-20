'use strict';

// M-Test — hybrid search ranks memory + knowledge sources together (M7 wiring).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryStore } = require('../electron/memory/store/memory-store');
const { createKnowledgeStore } = require('../electron/memory/store/knowledge-store');
const { hybridSearch } = require('../electron/memory/retrieval/hybrid-search');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('hybridSearch: pulls long-term memory items into results', () => {
  const dir = mkTempDir('jarvis-search');
  const memoryStore = createMemoryStore({ baseDir: dir });
  memoryStore.rememberLongTerm({ kind: 'fact', text: 'user uses Mapbox accent color cyan' });
  memoryStore.rememberLongTerm({ kind: 'fact', text: 'project Aurora ships in Q3' });

  const results = hybridSearch({ query: 'mapbox cyan', memoryStore });
  assert.ok(results.length >= 1);
  const first = results[0];
  assert.equal(first.source, 'memory:longTerm');
  assert.ok(first.retrievalScore > 0);
});

test('hybridSearch: blends knowledge entities with explicit sources', () => {
  const dir = mkTempDir('jarvis-search');
  const knowledgeStore = createKnowledgeStore({ baseDir: dir });
  knowledgeStore.upsertEntity({
    id: 'proj-aurora', type: 'project', label: 'Aurora',
    payload: { description: 'streaming dashboard for launch night' },
  });
  const seed = [{ id: 'doc-1', text: 'aurora launch checklist', embeddingScore: 0.3 }];
  const results = hybridSearch({ query: 'aurora launch', sources: seed, knowledgeStore });
  // Both the seed and the knowledge entity should match.
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes('doc-1'));
  assert.ok(ids.includes('proj-aurora'));
});

test('hybridSearch: empty query / empty stores returns []', () => {
  const dir = mkTempDir('jarvis-search');
  const memoryStore = createMemoryStore({ baseDir: dir });
  const knowledgeStore = createKnowledgeStore({ baseDir: dir });
  const r = hybridSearch({ query: 'nothing-matches-this', memoryStore, knowledgeStore });
  assert.deepEqual(r, []);
});
