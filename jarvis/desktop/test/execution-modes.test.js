'use strict';

// Jarvis Core #8 — Execution Modes contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideExecutionMode } = require('../electron/ai/core/execution-modes');

test('execution-modes: plain short message is quick', () => {
  const result = decideExecutionMode({ message: 'hi there', contextType: null, retryCount: 0 });
  assert.equal(result.mode, 'quick');
  assert.equal(result.requireReview, false);
});

test('execution-modes: coding context is careful', () => {
  const result = decideExecutionMode({ message: 'write a function', contextType: 'code', retryCount: 0 });
  assert.equal(result.mode, 'careful');
  assert.equal(result.requireReview, true);
});

test('execution-modes: long plain message is careful', () => {
  const result = decideExecutionMode({ message: 'x'.repeat(500), contextType: null, retryCount: 0 });
  assert.equal(result.mode, 'careful');
});

test('execution-modes: destructive keywords escalate to deep', () => {
  const result = decideExecutionMode({ message: 'please run rm -rf on the build folder', contextType: null, retryCount: 0 });
  assert.equal(result.mode, 'deep');
  assert.equal(result.maxRetries, 3);
  assert.deepEqual(result.minChecks, ['output-sanity', 'syntax', 'patch-sanity', 'imports']);
});

test('execution-modes: coding retry escalates to deep', () => {
  const result = decideExecutionMode({ message: 'fix the bug', contextType: 'code', retryCount: 1 });
  assert.equal(result.mode, 'deep');
});

test('execution-modes: deep takes priority over careful', () => {
  const result = decideExecutionMode({ message: 'deploy to production now', contextType: 'code', retryCount: 0 });
  assert.equal(result.mode, 'deep');
});
