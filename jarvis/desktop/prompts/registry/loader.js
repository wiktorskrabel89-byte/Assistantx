'use strict';

const constitution = require('../system/constitution');
const system = require('../system/base');
const routing = require('../routing/default');
const persona = require('../personas/default');
const coding = require('../coding/default');
const tools = require('../tools/default');
const { PROMPT_VERSIONS } = require('./versions');

function createPromptLoader() {
  const store = {
    constitution: { version: PROMPT_VERSIONS.constitution, text: constitution.constitutionPrompt },
    system: { version: PROMPT_VERSIONS.system, text: system.systemPrompt },
    routing: { version: PROMPT_VERSIONS.routing, text: routing.routingPrompt },
    persona: { version: PROMPT_VERSIONS.persona, text: persona.personaPrompt },
    coding: { version: PROMPT_VERSIONS.coding, text: coding.codingPrompt },
    tools: { version: PROMPT_VERSIONS.tools, text: tools.toolsPrompt },
  };

  return {
    load(name) {
      return store[name] || null;
    },
    list() {
      return Object.entries(store).map(([name, value]) => ({ name, ...value }));
    },
  };
}

module.exports = { createPromptLoader };
