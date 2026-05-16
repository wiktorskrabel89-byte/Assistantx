'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function createExecutionSandbox({ rootDir } = {}) {
  const base = rootDir || path.join(os.tmpdir(), 'assistantx-sandbox');
  fs.mkdirSync(base, { recursive: true });
  const workspaces = new Map();

  function getRoot() {
    return base;
  }

  function ensurePathWithinSandbox(targetPath) {
    const resolved = path.resolve(base, targetPath || '.');
    const baseResolved = path.resolve(base);
    if (!resolved.startsWith(baseResolved)) {
      throw new Error('sandbox-violation');
    }
    return resolved;
  }

  function createWorkspace(taskId = `task-${Date.now()}`) {
    const safeTaskId = String(taskId || '').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || `task-${Date.now()}`;
    const workspacePath = ensurePathWithinSandbox(path.join('workspaces', safeTaskId));
    fs.mkdirSync(workspacePath, { recursive: true });
    const workspace = {
      taskId: safeTaskId,
      path: workspacePath,
      createdAt: new Date().toISOString(),
      profiles: {
        command: 'restricted',
        filesystem: 'sandbox-only',
      },
    };
    workspaces.set(safeTaskId, workspace);
    return workspace;
  }

  function cleanupWorkspace(taskId) {
    const workspace = workspaces.get(taskId);
    if (!workspace) return false;
    try {
      fs.rmSync(workspace.path, { recursive: true, force: true });
    } catch {
      return false;
    }
    workspaces.delete(taskId);
    return true;
  }

  function listWorkspaces() {
    return [...workspaces.values()];
  }

  return {
    getRoot,
    ensurePathWithinSandbox,
    createWorkspace,
    cleanupWorkspace,
    listWorkspaces,
  };
}

module.exports = { createExecutionSandbox };
