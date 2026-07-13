'use strict';

// Jarvis Core #9 — Reality Check Engine + Contradiction Detector +
// Simulation Engine contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createKnowledgeStore } = require('../electron/memory/store/knowledge-store');
const { createMemoryStore } = require('../electron/memory/store/memory-store');
const {
  runRealityCheck,
  checkKnownFailures,
  checkPreferenceContradictions,
  simulateSyntax,
} = require('../electron/ai/core/reality-check');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('reality-check: no warnings for a clean request with empty stores', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-rc-k') });
  const memoryStore = createMemoryStore({ baseDir: mkTempDir('jarvis-rc-m') });
  const result = runRealityCheck({ message: 'Write a hello world script', knowledgeStore, memoryStore });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

test('checkKnownFailures: flags requests overlapping a known-failure lesson', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-rc-k') });
  knowledgeStore.upsertEntity({
    type: 'lesson',
    label: 'Porażka: deploy-staging',
    payload: { failure: true, cause: 'database migration timeout during deploy staging' },
  });
  const warnings = checkKnownFailures('please run the database migration during deploy', knowledgeStore);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, 'known-failure');
});

test('checkKnownFailures: no flag when overlap is below threshold', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-rc-k') });
  knowledgeStore.upsertEntity({
    type: 'lesson',
    label: 'Porażka: deploy-staging',
    payload: { failure: true, cause: 'database migration timeout' },
  });
  const warnings = checkKnownFailures('say hello', knowledgeStore);
  assert.equal(warnings.length, 0);
});

test('checkPreferenceContradictions: flags a "never" preference violation', () => {
  const memoryStore = createMemoryStore({ baseDir: mkTempDir('jarvis-rc-m') });
  memoryStore.setPreference('neverForcePush', true);
  const warnings = checkPreferenceContradictions('please force push this branch', memoryStore);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].preference, 'neverForcePush');
});

test('checkPreferenceContradictions: flags an "always" preference being skipped', () => {
  const memoryStore = createMemoryStore({ baseDir: mkTempDir('jarvis-rc-m') });
  memoryStore.setPreference('alwaysBackup', true);
  const warnings = checkPreferenceContradictions("don't backup this time", memoryStore);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].preference, 'alwaysBackup');
});

test('checkPreferenceContradictions: no flag when preference is false', () => {
  const memoryStore = createMemoryStore({ baseDir: mkTempDir('jarvis-rc-m') });
  memoryStore.setPreference('neverForcePush', false);
  const warnings = checkPreferenceContradictions('please force push this branch', memoryStore);
  assert.equal(warnings.length, 0);
});

test('simulateSyntax: balanced code fence passes', () => {
  const result = simulateSyntax('```js\nfunction f(a) { return [a, (a)]; }\n```');
  assert.equal(result.ok, true);
});

test('simulateSyntax: unbalanced code fence fails', () => {
  const result = simulateSyntax('```js\nfunction f(a) { return [a, (a]; }\n```');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unbalanced-brackets');
});

test('simulateSyntax: no code fence is a pass-through', () => {
  const result = simulateSyntax('just plain text with (unbalanced parens');
  assert.equal(result.ok, true);
});

test('runRealityCheck: aggregates known-failure + contradiction + simulation warnings', () => {
  const knowledgeStore = createKnowledgeStore({ baseDir: mkTempDir('jarvis-rc-k') });
  const memoryStore = createMemoryStore({ baseDir: mkTempDir('jarvis-rc-m') });
  memoryStore.setPreference('neverForcePush', true);
  const result = runRealityCheck({
    message: 'force push the broken ```js\nfunction f() { return (; }\n``` code',
    knowledgeStore,
    memoryStore,
  });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((w) => w.type === 'preference-contradiction'));
  assert.ok(result.warnings.some((w) => w.type === 'simulation-failed'));
});
