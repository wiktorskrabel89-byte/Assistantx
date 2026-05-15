'use strict';

function createAutomationRuntime() {
  const tasks = new Map();
  return {
    schedule(task) {
      tasks.set(task.id, { ...task, status: 'scheduled' });
      return { ok: true };
    },
    list() {
      return [...tasks.values()];
    },
  };
}

module.exports = { createAutomationRuntime };
