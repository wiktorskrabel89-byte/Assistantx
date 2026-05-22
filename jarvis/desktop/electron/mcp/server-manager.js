'use strict';

const path = require('path');
const fs = require('fs');
const { safeStorage } = require('electron');
const { createMCPServerProcess } = require('./server-process');

// Encrypted store file for per-server API keys / secrets
const STORE_FILE = 'mcp-server-store.bin';

// Official MCP server registry
const MCP_SERVERS = [
  {
    id: 'github',
    package: '@modelcontextprotocol/server-github',
    bin: 'mcp-server-github',
    authMethod: 'pat',
    category: 'developer',
  },
  {
    id: 'google-suite',
    package: 'internal-google-suite',
    bin: '',
    authMethod: 'google_oauth2',
    category: 'productivity',
  },
  {
    id: 'postgres',
    package: '@modelcontextprotocol/server-postgres',
    bin: 'mcp-server-postgres',
    authMethod: 'uri',
    category: 'database',
  },
  {
    id: 'brave-search',
    package: '@modelcontextprotocol/server-brave-search',
    bin: 'mcp-server-brave-search',
    authMethod: 'api_key',
    category: 'web',
  },
  {
    id: 'slack',
    package: '@modelcontextprotocol/server-slack',
    bin: 'mcp-server-slack',
    authMethod: 'slack_oauth',
    category: 'communication',
  },
  {
    id: 'operating-system',
    package: 'internal-operating-system',
    bin: '',
    authMethod: 'none',
    category: 'system',
  },
];

const GOOGLE_SERVER_IDS = new Set(['google-suite', 'google-calendar', 'gmail', 'google-drive']);
const VIRTUAL_SERVER_IDS = new Set(['google-suite', 'operating-system']);
const GOOGLE_SUITE_COMPONENTS = [
  {
    id: 'google-calendar',
    package: '@modelcontextprotocol/server-google-calendar',
    bin: 'mcp-server-google-calendar',
  },
  {
    id: 'gmail',
    package: '@modelcontextprotocol/server-gmail',
    bin: 'mcp-server-gmail',
  },
  {
    id: 'google-drive',
    package: '@modelcontextprotocol/server-google-drive',
    bin: 'mcp-server-google-drive',
  },
];

/**
 * Resolves the binary path for an MCP server npm package.
 * Looks in the desktop package's node_modules/.bin first, then falls back to
 * the global npx resolution (spawns via npx <package>).
 */
function resolveBinPath(bin) {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'node_modules', '.bin', bin),
    path.join(__dirname, '..', '..', '..', 'node_modules', '.bin', `${bin}.cmd`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null; // will fall back to npx
}

/**
 * @param {object} opts
 * @param {object} opts.googleClient  - createGoogleClient() instance
 * @param {object} opts.githubClient  - createGitHubClient() instance
 * @param {object} opts.app           - Electron app
 */
function createMCPServerManager({ googleClient, githubClient, app }) {
  const storePath = path.join(app.getPath('userData'), STORE_FILE);
  /** @type {Map<string, import('./server-process').MCPServerProcess>} */
  const processes = new Map();
  /** @type {Set<string>} enabled server IDs */
  const enabledServers = new Set();

  // ── Encrypted key store ──────────────────────────────────────────────────────

  function readStore() {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return {};
    if (!fs.existsSync(storePath)) return {};
    try {
      const encoded = fs.readFileSync(storePath, 'utf8').trim();
      if (!encoded) return {};
      return JSON.parse(safeStorage.decryptString(Buffer.from(encoded, 'base64')));
    } catch {
      return {};
    }
  }

  function writeStore(data) {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(data));
    fs.writeFileSync(storePath, encrypted.toString('base64'), 'utf8');
  }

  function setApiKey(serverId, value) {
    const store = readStore();
    store[serverId] = String(value || '').trim();
    writeStore(store);
    return { ok: true };
  }

  function getApiKey(serverId) {
    return readStore()[serverId] || null;
  }

  function removeApiKey(serverId) {
    const store = readStore();
    delete store[serverId];
    writeStore(store);
  }

  // ── Process env builder ──────────────────────────────────────────────────────

  async function buildEnv(serverId) {
    const extra = {};

    if (GOOGLE_SERVER_IDS.has(serverId)) {
      try {
        const token = await googleClient.auth.getAccessToken();
        extra.GOOGLE_ACCESS_TOKEN = token;
      } catch {
        // auth not configured yet — server will start but API calls will fail
      }
    }

    if (serverId === 'github') {
      const token = githubClient.getToken?.() || '';
      if (token) extra.GITHUB_TOKEN = token;
    }

    if (serverId === 'brave-search') {
      const key = getApiKey('brave-search');
      if (key) extra.BRAVE_API_KEY = key;
    }

    if (serverId === 'slack') {
      const key = getApiKey('slack');
      if (key) extra.SLACK_BOT_TOKEN = key;
    }

    if (serverId === 'postgres') {
      const key = getApiKey('postgres');
      if (key) extra.DATABASE_URL = key;
    }

    return extra;
  }

  function buildArgs() {
    return [];
  }

  function getGoogleSuiteComponentByMethod(toolName) {
    const method = String(toolName || '').trim();
    if (!method) return null;
    if (method.startsWith('list_events') || method.startsWith('create_event') || method.startsWith('update_event')
      || method.startsWith('delete_event') || method.startsWith('get_calendar') || method.startsWith('list_calendars')) {
      return 'google-calendar';
    }
    if (method.startsWith('list_messages') || method.startsWith('get_message') || method.startsWith('search_messages')
      || method.startsWith('send_message') || method.startsWith('draft_message') || method.startsWith('list_labels')) {
      return 'gmail';
    }
    if (method.startsWith('search_files') || method.startsWith('read_file') || method.startsWith('list_files')
      || method.startsWith('export_file') || method.startsWith('get_file_metadata')) {
      return 'google-drive';
    }
    return null;
  }

  async function startGoogleSuite() {
    for (const component of GOOGLE_SUITE_COMPONENTS) {
      if (processes.has(component.id)) continue;
      const binPath = resolveBinPath(component.bin);
      let command;
      let args;
      if (binPath) {
        command = binPath;
        args = [];
      } else {
        command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        args = ['--yes', component.package];
      }
      // eslint-disable-next-line no-await-in-loop
      const env = await buildEnv('google-suite');
      const proc = createMCPServerProcess({ serverId: component.id, command, args, env });
      proc.on('log', (entry) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[MCP] [${entry.level}] ${entry.msg}`);
        }
      });
      processes.set(component.id, proc);
      proc.start();
    }
  }

  function stopGoogleSuite() {
    for (const component of GOOGLE_SUITE_COMPONENTS) {
      const proc = processes.get(component.id);
      if (!proc) continue;
      proc.stop();
      processes.delete(component.id);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async function startServer(serverId) {
    if (serverId === 'google-suite') {
      await startGoogleSuite();
      return;
    }
    if (VIRTUAL_SERVER_IDS.has(serverId)) return;
    if (processes.has(serverId)) return; // already running

    const meta = MCP_SERVERS.find((s) => s.id === serverId);
    if (!meta) throw new Error(`mcp-unknown-server:${serverId}`);

    const binPath = resolveBinPath(meta.bin);
    let command, args;
    if (binPath) {
      command = binPath;
      args = buildArgs(serverId);
    } else {
      command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      args = ['--yes', meta.package, ...buildArgs(serverId)];
    }

    const env = await buildEnv(serverId);
    const proc = createMCPServerProcess({ serverId, command, args, env });
    proc.on('log', (entry) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MCP] [${entry.level}] ${entry.msg}`);
      }
    });
    processes.set(serverId, proc);
    proc.start();
  }

  function stopServer(serverId) {
    if (serverId === 'google-suite') {
      stopGoogleSuite();
      return;
    }
    if (VIRTUAL_SERVER_IDS.has(serverId)) return;
    const proc = processes.get(serverId);
    if (proc) {
      proc.stop();
      processes.delete(serverId);
    }
  }

  async function startAll() {
    for (const serverId of enabledServers) {
      await startServer(serverId).catch((err) => {
        console.error(`[MCP] Failed to start ${serverId}:`, err.message);
      });
    }
  }

  function stopAll() {
    for (const serverId of [...processes.keys()]) {
      stopServer(serverId);
    }
    enabledServers.clear();
  }

  async function restartServer(serverId) {
    stopServer(serverId);
    if (enabledServers.has(serverId)) {
      await startServer(serverId);
    }
  }

  // ── Installation API ─────────────────────────────────────────────────────────

  async function installServer(serverId) {
    if (!MCP_SERVERS.find((s) => s.id === serverId)) {
      return { ok: false, error: `unknown-server:${serverId}` };
    }
    enabledServers.add(serverId);
    await startServer(serverId).catch((err) => ({ ok: false, error: err.message }));
    return { ok: true, serverId };
  }

  function uninstallServer(serverId) {
    stopServer(serverId);
    enabledServers.delete(serverId);
    return { ok: true, serverId };
  }

  // ── Tool call API ────────────────────────────────────────────────────────────

  /**
   * Call a tool on a specific MCP server.
   * @param {string} serverId
   * @param {string} toolName
   * @param {object} params
   */
  async function callTool(serverId, toolName, params = {}) {
    if (serverId === 'google-suite') {
      const componentId = getGoogleSuiteComponentByMethod(toolName);
      if (!componentId) throw new Error(`mcp-google-suite-unsupported-tool:${toolName}`);
      const proc = processes.get(componentId);
      if (!proc) throw new Error(`mcp-server-not-running:${componentId}`);
      return proc.call('tools/call', { name: toolName, arguments: params });
    }
    const proc = processes.get(serverId);
    if (!proc) throw new Error(`mcp-server-not-running:${serverId}`);
    return proc.call('tools/call', { name: toolName, arguments: params });
  }

  // ── Status API ───────────────────────────────────────────────────────────────

  function listServers() {
    return MCP_SERVERS.map((meta) => {
      if (meta.id === 'google-suite') {
        const componentStatuses = GOOGLE_SUITE_COMPONENTS.map((component) => processes.get(component.id)?.getStatus() || null);
        const runningCount = componentStatuses.filter((status) => status?.running).length;
        const pid = componentStatuses.find((status) => status?.pid)?.pid || null;
        const restartCount = componentStatuses.reduce((sum, status) => sum + Number(status?.restartCount || 0), 0);
        const uptime = Math.max(0, ...componentStatuses.map((status) => Number(status?.uptime || 0)));
        return {
          ...meta,
          installed: enabledServers.has(meta.id),
          running: enabledServers.has(meta.id) && runningCount > 0,
          pid,
          uptime,
          restartCount,
        };
      }
      if (VIRTUAL_SERVER_IDS.has(meta.id)) {
        return {
          ...meta,
          installed: enabledServers.has(meta.id),
          running: enabledServers.has(meta.id),
          pid: null,
          uptime: 0,
          restartCount: 0,
        };
      }
      const proc = processes.get(meta.id);
      return {
        ...meta,
        installed: enabledServers.has(meta.id),
        ...( proc ? proc.getStatus() : { running: false, pid: null, uptime: 0, restartCount: 0 }),
      };
    });
  }

  function getServerStatus(serverId) {
    if (serverId === 'google-suite') {
      const componentStatuses = GOOGLE_SUITE_COMPONENTS.map((component) => processes.get(component.id)?.getStatus() || null);
      return {
        serverId,
        running: enabledServers.has(serverId) && componentStatuses.some((status) => status?.running),
        pid: componentStatuses.find((status) => status?.pid)?.pid || null,
        uptime: Math.max(0, ...componentStatuses.map((status) => Number(status?.uptime || 0))),
        restartCount: componentStatuses.reduce((sum, status) => sum + Number(status?.restartCount || 0), 0),
      };
    }
    if (VIRTUAL_SERVER_IDS.has(serverId)) {
      return {
        serverId,
        running: enabledServers.has(serverId),
        pid: null,
        uptime: 0,
        restartCount: 0,
      };
    }
    const proc = processes.get(serverId);
    if (!proc) return { serverId, running: false, pid: null, uptime: 0, restartCount: 0 };
    return proc.getStatus();
  }

  return {
    MCP_SERVERS,
    startAll,
    stopAll,
    startServer,
    stopServer,
    restartServer,
    installServer,
    uninstallServer,
    callTool,
    listServers,
    getServerStatus,
    setApiKey,
    getApiKey,
    removeApiKey,
  };
}

module.exports = { createMCPServerManager, MCP_SERVERS };
