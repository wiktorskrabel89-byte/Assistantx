'use strict';

// M-Test — round-trip tests for the M7 memory store.
// Uses a temp directory so the user's real userData JSON is never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryStore } = require('../electron/memory/store/memory-store');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('memory-store: preferences round-trip', () => {
  const dir = mkTempDir('jarvis-mem');
  const store = createMemoryStore({ baseDir: dir });
  store.setPreference('theme', 'dark-obsidian');
  store.setPreference('lang', 'pl-PL');
  const reopened = createMemoryStore({ baseDir: dir });
  assert.equal(reopened.getPreference('theme'), 'dark-obsidian');
  assert.equal(reopened.getPreference('lang'), 'pl-PL');
  assert.equal(reopened.getPreference('missing', 'fallback'), 'fallback');
});

test('memory-store: longTermMemory append + recall + forget', () => {
  const dir = mkTempDir('jarvis-mem');
  const store = createMemoryStore({ baseDir: dir });
  const a = store.rememberLongTerm({ kind: 'fact', text: 'user prefers concise replies', tags: ['style'] });
  const b = store.rememberLongTerm({ kind: 'fact', text: 'user lives in Warsaw', tags: ['profile'] });
  const all = store.listLongTerm();
  assert.equal(all.length, 2);
  assert.equal(all[0].text, 'user prefers concise replies');
  assert.equal(store.forgetLongTerm(a.id), true);
  const after = store.listLongTerm();
  assert.equal(after.length, 1);
  assert.equal(after[0].id, b.id);
});

test('memory-store: conversationMemory respects the cap', () => {
  const dir = mkTempDir('jarvis-mem');
  const store = createMemoryStore({ baseDir: dir });
  const cap = require('../electron/memory/store/memory-store').MAX_CONVERSATION_MEMORY;
  for (let i = 0; i < cap + 50; i += 1) {
    store.appendConversation({ role: 'user', text: `message ${i}` });
  }
  const recent = store.recentConversation(cap + 100);
  assert.equal(recent.length, cap);
  // Oldest 50 should have been trimmed.
  assert.equal(recent[0].text, 'message 50');
  assert.equal(recent[recent.length - 1].text, `message ${cap + 49}`);
});
