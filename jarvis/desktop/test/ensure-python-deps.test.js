'use strict';

// Auto-install-on-start dependency check. Validates probeImports() against
// the real system Python (always present in this dev environment) using
// stdlib modules, so the test is deterministic regardless of what's
// pip-installed on the host — no network access needed.
//
// NOTE: the full ensurePythonDependencies() install path is NOT exercised
// here — it spawns real pip processes (and, on a permission failure, a
// UAC-elevated retry), which is unsuitable for an automated test run. The
// no-requirements-file short-circuit is the one branch that's safe to
// exercise without touching pip at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const { probeImports, ensurePythonDependencies } = require('../electron/sidecar/ensure-python-deps');

function resolveSystemPython() {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  for (const candidate of ['python', 'python3']) {
    try {
      const out = execFileSync(whichCmd, [candidate], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
      if (out) return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const systemPython = resolveSystemPython();

test('probeImports: stdlib modules report present, fake module reports missing', { skip: !systemPython }, () => {
  const ok = probeImports(systemPython, ['os', 'sys', 'json']);
  assert.equal(ok.ok, true);
  assert.equal(ok.missing, '');

  const missing = probeImports(systemPython, ['definitely_not_a_real_module_xyz']);
  assert.equal(missing.ok, false);
  assert.equal(missing.missing, 'definitely_not_a_real_module_xyz');
});

test('ensurePythonDependencies: skips install when no requirements.txt exists', async (t) => {
  if (!systemPython) { t.skip('no system python on PATH'); return; }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-pydeps-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const result = await ensurePythonDependencies({
    pythonPath: systemPython,
    requirementsPath: path.join(tmpDir, 'requirements.txt'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no-requirements-file');
});
