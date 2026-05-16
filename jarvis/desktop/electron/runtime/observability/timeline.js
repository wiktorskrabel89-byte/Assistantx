'use strict';

function createExecutionTimeline({ maxEntries = 2000, bus } = {}) {
  const entries = [];

  function add(entry = {}) {
    const next = {
      id: entry.id || `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: entry.at || new Date().toISOString(),
      ...entry,
    };
    entries.push(next);
    while (entries.length > maxEntries) entries.shift();
    bus?.publish('runtime.timeline', next);
    return next;
  }

  function list(filters = {}) {
    return entries.filter((entry) => {
      if (filters.sessionId && entry.sessionId !== filters.sessionId) return false;
      if (filters.taskId && entry.taskId !== filters.taskId) return false;
      if (filters.correlationId && entry.correlationId !== filters.correlationId) return false;
      return true;
    });
  }

  return {
    add,
    list,
  };
}

module.exports = { createExecutionTimeline };
