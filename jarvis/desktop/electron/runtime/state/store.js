'use strict';

function createRuntimeStateStore() {
  const state = {
    activeTasks: new Map(),
    activeProviders: new Map(),
    streaming: new Map(),
    voice: { listening: false, interrupted: false },
    permissions: new Map(),
    agents: new Map(),
  };

  return {
    getSnapshot() {
      return {
        activeTasks: state.activeTasks.size,
        activeProviders: state.activeProviders.size,
        streaming: state.streaming.size,
        voice: { ...state.voice },
        permissions: state.permissions.size,
        agents: state.agents.size,
      };
    },
    state,
  };
}

module.exports = {
  createRuntimeStateStore,
};
