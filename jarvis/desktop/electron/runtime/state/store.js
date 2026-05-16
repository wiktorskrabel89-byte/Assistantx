'use strict';

function createRuntimeStateStore() {
  const state = {
    activeTasks: new Map(),
    activeProviders: new Map(),
    streaming: new Map(),
    sessions: new Map(),
    workflows: new Map(),
    retries: new Map(),
    interruption: new Map(),
    voice: { listening: false, interrupted: false },
    permissions: new Map(),
    agents: new Map(),
    costs: {
      byProvider: new Map(),
      total: 0,
    },
  };

  return {
    getSnapshot() {
      return {
        activeTasks: state.activeTasks.size,
        activeProviders: state.activeProviders.size,
        streaming: state.streaming.size,
        sessions: state.sessions.size,
        workflows: state.workflows.size,
        retries: state.retries.size,
        interruption: state.interruption.size,
        voice: { ...state.voice },
        permissions: state.permissions.size,
        agents: state.agents.size,
        costs: {
          providerCount: state.costs.byProvider.size,
          total: state.costs.total,
        },
      };
    },
    state,
  };
}

module.exports = {
  createRuntimeStateStore,
};
