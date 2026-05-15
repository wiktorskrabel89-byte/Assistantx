'use strict';

function createToolRegistry() {
  const tools = new Map();

  return {
    register(definition) {
      tools.set(definition.name, definition);
    },
    get(name) {
      return tools.get(name) || null;
    },
    list() {
      return [...tools.keys()];
    },
  };
}

module.exports = { createToolRegistry };
