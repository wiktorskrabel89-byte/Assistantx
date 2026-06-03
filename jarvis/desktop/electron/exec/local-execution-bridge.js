'use strict';

/* ARCHITECT'S NOTE: INNOVATION
 * V2.0 Local Execution Bridge — lets Jarvis securely interact with the host
 * system per Section 4 of the V2.0 spec. Design constraints:
 *   1. OFF by default. Requires the user to flip `dev_mode_exec` in settings
 *      AND pass an explicit `allow` flag per call. Two locks beat one.
 *   2. Allowlist-first. Commands must match a category (`git`, `npm`, `node`,
 *      `python`, `ls`, `cat`, `pwd`, `echo`). Anything else is rejected.
 *   3. Working-directory pin. Defaults to the app's userData directory;
 *      callers can pin to a project root but cannot traverse to /etc, /sys,
 *      or anywhere with a path containing "..".
 *   4. Per-call timeout (default 30s, max 5min).
 *   5. Output is captured and streamed back via the optional `onChunk` callback
 *      so the renderer can populate the Devin task list in real time.
 *   6. No shell. Each command runs via `child_process.spawn` with arg arrays,
 *      preventing shell-metacharacter injection.
 *
 * Pattern: Factory + Strategy. createLocalExecutionBridge() returns a bridge
 * instance bound to a config provider; each ALLOWLIST entry is a Strategy
 * that decides whether to accept the args.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 5 * 60 * 1000;

// Allowlist — each entry is { command, validate(args) -> ok | { ok:false, reason } }.
// Validators reject dangerous flags even within allowed commands.
const ALLOWLIST = {
  git: {
    command: 'git',
    validate(args) {
      const subcommand = String(args[0] || '').toLowerCase();
      const safe = new Set(['status', 'log', 'diff', 'show', 'branch', 'fetch', 'pull', 'add', 'commit', 'push', 'rev-parse', 'config', 'remote']);
      if (!safe.has(subcommand)) return { ok: false, reason: `git subcommand "${subcommand}" not allowed` };
      // Block destructive flags.
      if (args.some((a) => /^--force-with-lease|--no-verify|reset|clean/i.test(String(a)))) {
        return { ok: false, reason: 'destructive git flags blocked' };
      }
      return { ok: true };
    },
  },
  npm: {
    command: 'npm',
    validate(args) {
      const subcommand = String(args[0] || '').toLowerCase();
      const safe = new Set(['install', 'ci', 'run', 'test', 'build', 'list', 'outdated', '--version']);
      if (!safe.has(subcommand)) return { ok: false, reason: `npm subcommand "${subcommand}" not allowed` };
      return { ok: true };
    },
  },
  node: {
    command: 'node',
    validate(args) {
      // Only allow file execution + --version + --check (syntax check).
      if (args.length === 0) return { ok: false, reason: 'node requires args' };
      const first = String(args[0] || '');
      if (first === '--version' || first === '--check') return { ok: true };
      if (first.startsWith('-')) return { ok: false, reason: `node flag "${first}" not allowed` };
      return { ok: true };
    },
  },
  python: {
    command: process.platform === 'win32' ? 'python' : 'python3',
    validate(args) {
      if (args.length === 0) return { ok: false, reason: 'python requires args' };
      const first = String(args[0] || '');
      // Block -c (inline code) and -e (eval) which can run arbitrary code from the prompt.
      if (first === '-c' || first === '-e') return { ok: false, reason: 'python inline exec blocked' };
      return { ok: true };
    },
  },
  ls: { command: process.platform === 'win32' ? 'dir' : 'ls', validate: () => ({ ok: true }) },
  cat: { command: process.platform === 'win32' ? 'type' : 'cat', validate: () => ({ ok: true }) },
  pwd: { command: process.platform === 'win32' ? 'cd' : 'pwd', validate: () => ({ ok: true }) },
  echo: { command: 'echo', validate: () => ({ ok: true }) },
};

function isPathSafe(targetCwd, defaultCwd) {
  if (!targetCwd) return defaultCwd;
  const normalized = path.normalize(String(targetCwd));
  if (normalized.includes('..')) return null;
  // Resolve to absolute; refuse system roots.
  const abs = path.resolve(defaultCwd, normalized);
  const denied = ['/etc', '/sys', '/proc', '/boot', '/root', 'C:\\Windows', 'C:\\Program Files'];
  for (const root of denied) {
    if (abs.toLowerCase().startsWith(root.toLowerCase())) return null;
  }
  try {
    if (!fs.existsSync(abs)) return null;
    if (!fs.statSync(abs).isDirectory()) return null;
  } catch { return null; }
  return abs;
}

function createLocalExecutionBridge({ getConfig, log = () => {}, defaultCwd } = {}) {
  const baseCwd = defaultCwd || process.cwd();

  function isEnabled() {
    try {
      const cfg = typeof getConfig === 'function' ? getConfig() : {};
      return Boolean(cfg && cfg.dev_mode_exec === true);
    } catch { return false; }
  }

  /**
   * Run a whitelisted command.
   * @param {object} request
   * @param {string} request.category   ALLOWLIST key
   * @param {string[]} request.args     Argument array (NOT a shell string)
   * @param {string} [request.cwd]      Override working directory
   * @param {number} [request.timeoutMs]
   * @param {boolean} [request.allow]   Must be true; second-lock approval
   * @param {(chunk:{stream:'stdout'|'stderr',data:string})=>void} [onChunk]
   */
  async function exec(request = {}, onChunk = () => {}) {
    if (!isEnabled()) {
      return { ok: false, error: 'dev_mode_exec_disabled', detail: 'Enable Developer mode in Settings to use the execution bridge.' };
    }
    if (request.allow !== true) {
      return { ok: false, error: 'explicit_allow_required', detail: 'Every exec call must pass { allow: true }.' };
    }
    const entry = ALLOWLIST[request.category];
    if (!entry) {
      return { ok: false, error: 'category_not_allowlisted', detail: `Category "${request.category}" is not in the allowlist.` };
    }
    const args = Array.isArray(request.args) ? request.args.map((a) => String(a)) : [];
    const validation = entry.validate(args);
    if (!validation.ok) {
      return { ok: false, error: 'validation_failed', detail: validation.reason };
    }
    const cwd = isPathSafe(request.cwd, baseCwd);
    if (!cwd) {
      return { ok: false, error: 'cwd_unsafe', detail: 'cwd is missing, contains "..", or points to a system root.' };
    }
    // Robust timeout parsing — NaN, negative, or missing all snap to the
    // sane default. Caller-supplied values are clamped to [1s, 5min].
    const rawTimeout = Number(request.timeoutMs);
    const safeTimeout = Number.isFinite(rawTimeout) && rawTimeout > 0
      ? rawTimeout
      : DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.max(1_000, Math.min(safeTimeout, MAX_TIMEOUT_MS));

    log(`[exec] running ${entry.command} ${args.join(' ')} in ${cwd}`);

    return new Promise((resolve) => {
      let settled = false;
      let stdoutBuf = '';
      let stderrBuf = '';
      let child;
      try {
        child = spawn(entry.command, args, {
          cwd,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
          windowsHide: true,
          shell: false, // CRITICAL: never invoke a shell — preserves arg array as exec argv.
        });
      } catch (err) {
        return resolve({ ok: false, error: 'spawn_failed', detail: String(err?.message || err) });
      }

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill('SIGTERM'); } catch { /* already dead */ }
        resolve({
          ok: false,
          error: 'timeout',
          detail: `Command exceeded ${timeoutMs}ms timeout.`,
          stdout: stdoutBuf,
          stderr: stderrBuf,
        });
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdoutBuf += text;
        try { onChunk({ stream: 'stdout', data: text }); } catch { /* listener threw */ }
      });
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderrBuf += text;
        try { onChunk({ stream: 'stderr', data: text }); } catch { /* listener threw */ }
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: 'child_error', detail: String(err?.message || err), stdout: stdoutBuf, stderr: stderrBuf });
      });
      child.on('exit', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          exitCode: code,
          signal,
          stdout: stdoutBuf,
          stderr: stderrBuf,
        });
      });
    });
  }

  function listAllowedCategories() {
    return Object.keys(ALLOWLIST);
  }

  return { exec, isEnabled, listAllowedCategories };
}

module.exports = { createLocalExecutionBridge, ALLOWLIST };
