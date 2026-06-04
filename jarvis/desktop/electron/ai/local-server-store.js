'use strict';

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { OllamaProvider } = require('./providers/ollama');
const { OpenAICompatProvider } = require('./providers/openai-compat');

const STORE_FILE_NAME = 'local-servers.dat';

function createLocalServerStore() {
  const storeFilePath = path.join(app.getPath('userData'), STORE_FILE_NAME);
  let cache = null;

  function canEncrypt() {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  }

  function defaultState() {
    return {
      localServers: [],
      localModelAssignment: {
        chatModelId: null,
        codeModelId: null,
        externalApiModelId: null,
        visionModelId: null,
        serverId: null,
      },
      preferLocalWhenAvailable: true,
    };
  }

  function normalizeState(input) {
    const source = input && typeof input === 'object' ? input : {};
    const localServers = Array.isArray(source.localServers) ? source.localServers : [];
    const normalizedServers = localServers
      .map((server) => {
        if (!server || typeof server !== 'object') return null;
        const baseUrl = String(server.baseUrl || '').trim().replace(/\/$/, '');
        if (!baseUrl) return null;
        const apiType = ['ollama', 'lmstudio', 'openai-compat'].includes(server.apiType) ? server.apiType : 'ollama';
        return {
          id: String(server.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
          label: String(server.label || 'Local server'),
          baseUrl,
          apiType,
          enabled: Boolean(server.enabled),
          discoveredModels: Array.isArray(server.discoveredModels)
            ? server.discoveredModels.map((item) => String(item || '').trim()).filter(Boolean)
            : [],
          lastScannedAt: Number.isFinite(server.lastScannedAt) ? Number(server.lastScannedAt) : null,
        };
      })
      .filter(Boolean);
    const assignment = source.localModelAssignment && typeof source.localModelAssignment === 'object'
      ? source.localModelAssignment
      : {};
    return {
      localServers: normalizedServers,
      localModelAssignment: {
        chatModelId: assignment.chatModelId ? String(assignment.chatModelId) : null,
        codeModelId: assignment.codeModelId ? String(assignment.codeModelId) : null,
        externalApiModelId: assignment.externalApiModelId ? String(assignment.externalApiModelId) : null,
        visionModelId: assignment.visionModelId ? String(assignment.visionModelId) : null,
        serverId: assignment.serverId ? String(assignment.serverId) : null,
      },
      preferLocalWhenAvailable: Boolean(source.preferLocalWhenAvailable),
    };
  }

  function readState() {
    if (cache) return { ...cache };
    if (!canEncrypt()) {
      cache = defaultState();
      return { ...cache };
    }
    try {
      if (!fs.existsSync(storeFilePath)) {
        cache = defaultState();
        return { ...cache };
      }
      const payload = fs.readFileSync(storeFilePath, 'utf8').trim();
      if (!payload) {
        cache = defaultState();
        return { ...cache };
      }
      const decrypted = safeStorage.decryptString(Buffer.from(payload, 'base64'));
      cache = normalizeState(JSON.parse(String(decrypted || '{}')));
      return { ...cache };
    } catch {
      cache = defaultState();
      return { ...cache };
    }
  }

  function writeState(nextState) {
    cache = normalizeState(nextState);
    if (!canEncrypt()) return { ok: false, reason: 'safeStorage-encryption-unavailable', state: { ...cache } };
    try {
      const encrypted = safeStorage.encryptString(JSON.stringify(cache));
      fs.writeFileSync(storeFilePath, encrypted.toString('base64'), 'utf8');
      return { ok: true, state: { ...cache } };
    } catch (error) {
      return { ok: false, reason: String(error?.message || error), state: { ...cache } };
    }
  }

  function list() {
    return readState().localServers;
  }

  function getAssignment() {
    const state = readState();
    return {
      localModelAssignment: state.localModelAssignment,
      preferLocalWhenAvailable: state.preferLocalWhenAvailable,
    };
  }

  function add(server) {
    const state = readState();
    const next = {
      ...state,
      localServers: [...state.localServers, {
        id: String(server.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        label: String(server.label || 'Local server'),
        baseUrl: String(server.baseUrl || '').trim().replace(/\/$/, ''),
        apiType: ['ollama', 'lmstudio', 'openai-compat'].includes(server.apiType) ? server.apiType : 'ollama',
        enabled: server.enabled !== false,
        discoveredModels: [],
        lastScannedAt: null,
      }],
    };
    return writeState(next);
  }

  function update(serverId, patch = {}) {
    const state = readState();
    const next = {
      ...state,
      localServers: state.localServers.map((server) => {
        if (server.id !== serverId) return server;
        return normalizeState({
          localServers: [{ ...server, ...patch }],
          localModelAssignment: state.localModelAssignment,
          preferLocalWhenAvailable: state.preferLocalWhenAvailable,
        }).localServers[0];
      }),
    };
    return writeState(next);
  }

  function remove(serverId) {
    const state = readState();
    const next = {
      ...state,
      localServers: state.localServers.filter((server) => server.id !== serverId),
      localModelAssignment: state.localModelAssignment.serverId === serverId
        ? {
          chatModelId: null,
          codeModelId: null,
          externalApiModelId: null,
          visionModelId: null,
          serverId: null,
        }
        : state.localModelAssignment,
    };
    return writeState(next);
  }

  function setAssignment(patch = {}) {
    const state = readState();
    const next = {
      ...state,
      localModelAssignment: {
        ...state.localModelAssignment,
        ...(patch.localModelAssignment && typeof patch.localModelAssignment === 'object' ? patch.localModelAssignment : {}),
      },
      preferLocalWhenAvailable: patch.preferLocalWhenAvailable === undefined
        ? state.preferLocalWhenAvailable
        : Boolean(patch.preferLocalWhenAvailable),
    };
    return writeState(next);
  }

  async function scan(serverId) {
    const state = readState();
    const server = state.localServers.find((entry) => entry.id === serverId);
    if (!server) return { ok: false, error: 'server-not-found' };
    const provider = server.apiType === 'ollama'
      ? new OllamaProvider({ baseUrl: server.baseUrl })
      : new OpenAICompatProvider({ baseUrl: server.baseUrl });
    const startedAt = Date.now();
    try {
      const models = await provider.listModels();
      const updated = update(serverId, {
        discoveredModels: models,
        lastScannedAt: Date.now(),
      });
      return {
        ok: updated.ok,
        models,
        latencyMs: Date.now() - startedAt,
        reason: updated.reason || null,
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error || 'scan-failed'),
        models: [],
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  function getRouterConfig() {
    const state = readState();
    return {
      localServers: state.localServers,
      localModelAssignment: state.localModelAssignment,
      preferLocalWhenAvailable: state.preferLocalWhenAvailable,
    };
  }

  return {
    list,
    add,
    update,
    remove,
    scan,
    getAssignment,
    setAssignment,
    getRouterConfig,
  };
}

module.exports = {
  createLocalServerStore,
};
