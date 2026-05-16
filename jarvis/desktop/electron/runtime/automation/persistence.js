'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function createAutomationPersistence({ baseDir } = {}) {
  const dir = baseDir || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
  const runtimePath = path.join(dir, 'runtime-automation-state.json');

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true });
  }

  function readState() {
    ensureDir();
    if (!fs.existsSync(runtimePath)) {
      return {
        workflows: [],
        retries: [],
        notifications: [],
        updatedAt: null,
      };
    }
    try {
      return JSON.parse(fs.readFileSync(runtimePath, 'utf-8'));
    } catch {
      return {
        workflows: [],
        retries: [],
        notifications: [],
        updatedAt: null,
      };
    }
  }

  function writeState(next) {
    ensureDir();
    fs.writeFileSync(runtimePath, JSON.stringify({
      workflows: Array.isArray(next.workflows) ? next.workflows : [],
      retries: Array.isArray(next.retries) ? next.retries : [],
      notifications: Array.isArray(next.notifications) ? next.notifications : [],
      updatedAt: new Date().toISOString(),
    }, null, 2));
  }

  function update(updater) {
    const current = readState();
    const next = typeof updater === 'function' ? updater(current) : current;
    writeState(next || current);
    return readState();
  }

  return {
    path: runtimePath,
    readState,
    writeState,
    update,
  };
}

module.exports = { createAutomationPersistence };
