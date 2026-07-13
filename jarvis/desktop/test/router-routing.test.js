'use strict';

// Round-2 — Router routing contract tests. Validates that `decideRoute` picks
// the right slot/model per intent, escalates correctly, and respects the
// dispatch table override (the 6-lane preferences flow through here).
//
// No real LLM calls — `availability` + `dispatch` are mocked.

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideRoute, DEFAULT_DISPATCH } = require('../electron/ai/router/policy');

const AVAILABILITY_LOCAL = {
  ollama_available: true,
  required_models_present: true,
  // Empty installed_models list disables the install-check so the test
  // dispatch table is honored as-is — see resolveLocalSlot's guard.
  installed_models: [],
};

const DISPATCH_OVERRIDE = {
  chat: 'jarvis-chat-7b',
  code: 'jarvis-code-7b',
  code_heavy: 'jarvis-code-30b',
  reasoning: 'jarvis-reason-14b',
  router: 'jarvis-router-1b',
  vision: 'jarvis-vision-2b',
};

test('router-chat: simple chat intent picks chat slot', () => {
  const route = decideRoute(
    { intent: 'chat', confidence: 0.9 },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  assert.equal(route.lane, 'chat');
  assert.equal(route.model, DISPATCH_OVERRIDE.chat);
});

test('router-code: code intent picks code slot', () => {
  const route = decideRoute(
    { intent: 'code', confidence: 0.9 },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  assert.equal(route.lane, 'code');
  assert.equal(route.model, DISPATCH_OVERRIDE.code);
});

test('router-code-heavy: code intent + codingHeavy escalates to code_heavy', () => {
  const route = decideRoute(
    { intent: 'code', confidence: 0.9, codingHeavy: true },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  assert.equal(route.lane, 'code_heavy');
  assert.equal(route.model, DISPATCH_OVERRIDE.code_heavy);
});

test('router-reasoning: low confidence on chat escalates to reasoning', () => {
  const route = decideRoute(
    { intent: 'chat', confidence: 0.3 },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  assert.equal(route.lane, 'reasoning');
  assert.equal(route.model, DISPATCH_OVERRIDE.reasoning);
});

test('router-vision: vision intent picks vision slot', () => {
  const route = decideRoute(
    { intent: 'vision', confidence: 0.9 },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  assert.equal(route.lane, 'vision');
  assert.equal(route.model, DISPATCH_OVERRIDE.vision);
});

test('router-dispatch-override: lane prefs flow through to chosen model', () => {
  // This is the core integration assertion — proves that when the user
  // changes "Coding Model" in Settings → Modele to "jarvis-code-7b", the
  // router actually returns that model for code intents.
  const route = decideRoute(
    { intent: 'code', confidence: 0.9 },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  assert.notEqual(route.model, DEFAULT_DISPATCH.code);
  assert.equal(route.model, DISPATCH_OVERRIDE.code);
});

test('router-no-hallucinate: never returns a model outside the dispatch table', () => {
  const route = decideRoute(
    { intent: 'chat', confidence: 0.9 },
    { availability: AVAILABILITY_LOCAL, dispatch: DISPATCH_OVERRIDE },
  );
  const allowed = new Set([
    ...Object.values(DISPATCH_OVERRIDE),
    ...Object.values(DEFAULT_DISPATCH),
  ]);
  // Local route — model MUST come from the dispatch table.
  if (route.provider === 'ollama') {
    assert.ok(allowed.has(route.model), `unexpected model ${route.model}`);
  }
});
