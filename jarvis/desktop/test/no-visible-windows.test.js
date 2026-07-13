'use strict';

// Phase 1 hardening — Bug #1: startup was spawning visible console windows
// (one per child process: sidecar, ollama serve, app launches, OS tool
// calls). Root cause: several child_process.spawn/execFile call sites never
// set `windowsHide: true`, so Windows opens a console for any console-
// subsystem binary (cmd.exe, powershell.exe, taskkill.exe, ...) spawned from
// a GUI process with no console of its own.
//
// This test statically verifies every spawn()/execFile() call site in the
// runtime (non-script, non-test) source tree passes windowsHide: true,
// so a future edit can't silently reintroduce a visible window.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP_ROOT = path.join(__dirname, '..');

const RUNTIME_FILES = [
  'main.js',
  'backend.js',
  'launcher/launch-service.js',
  'electron/tools/os/index.js',
  'electron/tools/apps/index.js',
  'electron/mcp/server-process.js',
  'electron/exec/local-execution-bridge.js',
  'electron/sidecar/ensure-python-deps.js',
];

// Extracts the full argument list text of every top-level spawn(...)/
// execFile(...) call in `source`, by balancing parens from the call's `(`.
function extractCallSites(source) {
  const sites = [];
  const callRe = /\b(spawn|execFile)\(/g;
  let match;
  while ((match = callRe.exec(source))) {
    const openIdx = match.index + match[0].length - 1;
    let depth = 0;
    let i = openIdx;
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    sites.push({ fnName: match[1], text: source.slice(openIdx, i + 1), index: match.index });
  }
  return sites;
}

for (const relPath of RUNTIME_FILES) {
  test(`no-visible-windows: every spawn/execFile call in ${relPath} sets windowsHide: true`, () => {
    const source = fs.readFileSync(path.join(DESKTOP_ROOT, relPath), 'utf8');
    const sites = extractCallSites(source);
    assert.ok(sites.length > 0, `expected at least one spawn/execFile call in ${relPath}`);
    for (const site of sites) {
      assert.match(
        site.text,
        /windowsHide\s*:\s*true/,
        `${relPath}: ${site.fnName}(...) at offset ${site.index} is missing windowsHide: true`,
      );
    }
  });
}
