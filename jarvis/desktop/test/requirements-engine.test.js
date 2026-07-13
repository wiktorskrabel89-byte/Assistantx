'use strict';

// v0.5 — Intelligent Requirements System contract tests. No real LLM calls
// — `dispatch` is mocked, same pattern as router-routing.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateBlueprint,
  extractJson,
  normalizeBlueprintFields,
} = require('../electron/ai/requirements-engine');

test('generateBlueprint: parses a well-formed JSON reply', async () => {
  const reply = JSON.stringify({
    requirements: ['Auth', 'Billing'],
    features: ['Dashboard'],
    techStack: ['Next.js'],
    risks: ['Scope creep'],
    timeline: '6 weeks',
    costEstimate: '$5k',
  });
  const blueprint = await generateBlueprint({ goal: 'Build a SaaS', dispatch: async () => reply });
  assert.equal(blueprint.goal, 'Build a SaaS');
  assert.deepEqual(blueprint.requirements, ['Auth', 'Billing']);
  assert.equal(blueprint.timeline, '6 weeks');
});

test('generateBlueprint: malformed reply still yields a usable empty-field shape', async () => {
  const blueprint = await generateBlueprint({ goal: 'Build a bot', dispatch: async () => 'not json at all' });
  assert.equal(blueprint.goal, 'Build a bot');
  assert.deepEqual(blueprint.requirements, []);
  assert.equal(blueprint.timeline, '');
});

test('generateBlueprint: tolerates prose wrapped around the JSON block', async () => {
  const reply = 'Sure, here you go:\n{"requirements":["X"],"features":[],"techStack":[],"risks":[],"timeline":"2w","costEstimate":"$1k"}\nHope that helps!';
  const blueprint = await generateBlueprint({ goal: 'X', dispatch: async () => reply });
  assert.deepEqual(blueprint.requirements, ['X']);
  assert.equal(blueprint.timeline, '2w');
});

test('generateBlueprint: rejects an empty goal', async () => {
  await assert.rejects(() => generateBlueprint({ goal: '  ', dispatch: async () => '{}' }));
});

test('extractJson: returns null for non-JSON text', () => {
  assert.equal(extractJson('hello world'), null);
});

test('normalizeBlueprintFields: drops non-array/non-string garbage', () => {
  const fields = normalizeBlueprintFields({ requirements: 'not-an-array', timeline: 42 });
  assert.deepEqual(fields.requirements, []);
  assert.equal(fields.timeline, '');
});
