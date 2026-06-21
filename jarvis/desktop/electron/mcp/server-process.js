'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const RESTART_DELAYS_MS = [1000, 2000, 5000, 15000, 30000];

/**
 * Manages a single MCP server process communicating via stdio JSON-RPC 2.0.
 *
 * @param {object} opts
 * @param {string} opts.serverId
 * @param {string} opts.command   - Executable path
 * @param {string[]} opts.args    - CLI arguments
 * @param {object} opts.env       - Additional environment variables
 */
function createMCPServerProcess({ serverId, command, args = [], env = {} }) {
  const emitter = new EventEmitter();
  let proc = null;
  let running = false;
  let startedAt = null;
  let restartCount = 0;
  let restartTimer = null;
  let stopping = false;
  let nextRequestId = 1;
  /** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
  const pending = new Map();
  let stdoutBuffer = '';

  function log(level, msg, extra = {}) {
    emitter.emit('log', { serverId, level, msg, ...extra });
  }

  function clearPending(reason) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      pending.delete(id);
    }
  }

  function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      log('debug', `[mcp:${serverId}] non-json stdout: ${trimmed}`);
      return;
    }

    // JSON-RPC response
    if (msg.id !== undefined) {
      const entry = pending.get(Number(msg.id));
      if (!entry) return;
      pending.delete(Number(msg.id));
      clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(Object.assign(new Error(msg.error.message || 'mcp-rpc-error'), { code: msg.error.code }));
      } else {
        entry.resolve(msg.result ?? null);
      }
      return;
    }

    // JSON-RPC notification (no id)
    emitter.emit('notification', msg);
  }

  function handleData(chunk) {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  }

  function scheduleRestart() {
    if (stopping) return;
    const delay = RESTART_DELAYS_MS[Math.min(restartCount, RESTART_DELAYS_MS.length - 1)];
    restartCount += 1;
    log('warn', `[mcp:${serverId}] restarting in ${delay}ms (attempt ${restartCount})`);
    restartTimer = setTimeout(() => {
      if (!stopping) start();
    }, delay);
  }

  function start() {
    if (running) return;
    stopping = false;
    log('info', `[mcp:${serverId}] starting`);

    proc = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    running = true;
    startedAt = Date.now();
    emitter.emit('status', { serverId, running: true, pid: proc.pid });

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', handleData);

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (data) => {
      log('debug', `[mcp:${serverId}] stderr: ${String(data).trim()}`);
    });

    proc.on('error', (err) => {
      log('error', `[mcp:${serverId}] process error: ${err.message}`);
    });

    proc.on('close', (code) => {
      running = false;
      startedAt = null;
      clearPending(`mcp-server-${serverId}-closed`);
      emitter.emit('status', { serverId, running: false, pid: null, exitCode: code });
      log('warn', `[mcp:${serverId}] exited with code ${code}`);
      scheduleRestart();
    });
  }

  function stop() {
    stopping = true;
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    clearPending(`mcp-server-${serverId}-stopped`);
    if (proc && running) {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      proc = null;
    }
    running = false;
    startedAt = null;
    emitter.emit('status', { serverId, running: false, pid: null });
    log('info', `[mcp:${serverId}] stopped`);
  }

  /**
   * Send a JSON-RPC 2.0 request and return a promise for the result.
   * @param {string} method
   * @param {object} params
   * @param {number} [timeoutMs=30000]
   */
  function call(method, params = {}, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      if (!running || !proc) {
        reject(new Error(`mcp-server-${serverId}-not-running`));
        return;
      }
      const id = nextRequestId++;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`mcp-rpc-timeout:${serverId}:${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        proc.stdin.write(message);
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      }
    });
  }

  function getStatus() {
    return {
      serverId,
      running,
      pid: proc?.pid ?? null,
      uptime: startedAt ? Date.now() - startedAt : 0,
      restartCount,
    };
  }

  return {
    start,
    stop,
    call,
    getStatus,
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
  };
}

module.exports = { createMCPServerProcess };
