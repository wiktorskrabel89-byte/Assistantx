'use strict';

function createToolAction(tool, params = {}) {
  return { tool, params };
}

module.exports = { createToolAction };
