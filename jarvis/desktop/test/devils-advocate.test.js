'use strict';

// Jarvis Core #14 — Devil's Advocate System contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');

const { scanForRisk, annotateResponse } = require('../electron/ai/core/devils-advocate');

test('scanForRisk: ordinary text is not risky', () => {
  const result = scanForRisk('Here is a function that adds two numbers.');
  assert.equal(result.risky, false);
  assert.deepEqual(result.flags, []);
});

test('scanForRisk: flags rm -rf', () => {
  const result = scanForRisk('Run `rm -rf node_modules` to clean up.');
  assert.equal(result.risky, true);
  assert.ok(result.flags.some((f) => f.id === 'rm-rf'));
});

test('scanForRisk: flags force push', () => {
  const result = scanForRisk('You should git push origin main --force to fix this.');
  assert.equal(result.risky, true);
  assert.ok(result.flags.some((f) => f.id === 'force-push'));
});

test('scanForRisk: flags DROP TABLE', () => {
  const result = scanForRisk('Run DROP TABLE users; to reset.');
  assert.equal(result.risky, true);
  assert.ok(result.flags.some((f) => f.id === 'drop-table'));
});

test('scanForRisk: can flag multiple patterns at once', () => {
  const result = scanForRisk('First rm -rf the build dir, then git reset --hard.');
  assert.equal(result.flags.length, 2);
});

test('annotateResponse: prefixes a warning when flags are present', () => {
  const annotated = annotateResponse('do the thing', [{ id: 'rm-rf', label: 'usuwanie rekurencyjne (rm -rf)' }]);
  assert.ok(annotated.includes('Devil\'s Advocate'));
  assert.ok(annotated.endsWith('do the thing'));
});

test('annotateResponse: passes text through unchanged when no flags', () => {
  assert.equal(annotateResponse('do the thing', []), 'do the thing');
});
