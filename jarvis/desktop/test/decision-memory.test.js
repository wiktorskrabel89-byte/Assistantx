'use strict';

// Jarvis Core #10 — Decision Memory contract tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDecisionMemory } = require('../electron/ai/core/decision-memory');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('decision-memory: default snapshot is empty', () => {
  const dm = createDecisionMemory({ baseDir: mkTempDir('jarvis-dm') });
  assert.deepEqual(dm.snapshot().decisions, []);
});

test('decision-memory: recordDecision stores fields and assigns id/ts', () => {
  const dm = createDecisionMemory({ baseDir: mkTempDir('jarvis-dm') });
  const record = dm.recordDecision({ mode: 'deep', confidence: 0.8, action: 'proceed' });
  assert.ok(record.id);
  assert.ok(record.ts > 0);
  assert.equal(record.mode, 'deep');
  assert.equal(record.confidence, 0.8);
  assert.equal(record.action, 'proceed');
});

test('decision-memory: recentDecisions returns most recent N in order', () => {
  const dm = createDecisionMemory({ baseDir: mkTempDir('jarvis-dm') });
  dm.recordDecision({ mode: 'quick', action: 'proceed' });
  dm.recordDecision({ mode: 'careful', action: 'proceed' });
  dm.recordDecision({ mode: 'deep', action: 'flag-for-review' });
  const recent = dm.recentDecisions(2);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].mode, 'careful');
  assert.equal(recent[1].mode, 'deep');
});

test('decision-memory: persists across reopen', () => {
  const dir = mkTempDir('jarvis-dm');
  const a = createDecisionMemory({ baseDir: dir });
  a.recordDecision({ mode: 'quick', action: 'proceed' });
  const b = createDecisionMemory({ baseDir: dir });
  assert.equal(b.recentDecisions(10).length, 1);
});

test('decision-memory: wipe clears all decisions', () => {
  const dm = createDecisionMemory({ baseDir: mkTempDir('jarvis-dm') });
  dm.recordDecision({ mode: 'quick', action: 'proceed' });
  dm.wipe();
  assert.equal(dm.recentDecisions(10).length, 0);
});
