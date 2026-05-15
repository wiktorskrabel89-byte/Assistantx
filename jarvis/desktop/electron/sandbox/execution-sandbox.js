'use strict';

const path = require('path');
const os = require('os');

function createExecutionSandbox({ rootDir } = {}) {
  const base = rootDir || path.join(os.tmpdir(), 'assistantx-sandbox');
  return {
    getRoot() {
      return base;
    },
    ensurePathWithinSandbox(targetPath) {
      const resolved = path.resolve(base, targetPath || '.');
      if (!resolved.startsWith(path.resolve(base))) {
        throw new Error('sandbox-violation');
      }
      return resolved;
    },
  };
}

module.exports = { createExecutionSandbox };
