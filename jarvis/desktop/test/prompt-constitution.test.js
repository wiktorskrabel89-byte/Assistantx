'use strict';

// v0.1 — AI Constitution must be the first segment of every composed
// prompt and must not be excludable via the `include` option.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPromptRegistry } = require('../prompts/registry');
const { constitutionPrompt } = require('../prompts/system/constitution');

test('constitution is the first segment by default', () => {
  const { composer } = createPromptRegistry();
  const composed = composer.compose({ taskPrompt: 'hello' });
  assert.ok(composed.startsWith('[CONSTITUTION'));
  assert.ok(composed.includes(constitutionPrompt));
});

test('constitution survives a caller-supplied include list that omits it', () => {
  const { composer } = createPromptRegistry();
  const composed = composer.compose({ include: ['persona'], taskPrompt: 'hi' });
  assert.ok(composed.startsWith('[CONSTITUTION'));
});

test('constitution is not duplicated if a caller explicitly includes it', () => {
  const { composer } = createPromptRegistry();
  const composed = composer.compose({ include: ['constitution', 'system'], taskPrompt: 'hi' });
  const occurrences = composed.split('[CONSTITUTION').length - 1;
  assert.equal(occurrences, 1);
});
