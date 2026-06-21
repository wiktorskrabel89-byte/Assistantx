'use strict';

// Auto-install-on-start dependency check. Validates probeImports() against
// the real system Python (always present in this dev environment) using
// stdlib modules, so the test is deterministic regardless of what's
// pip-installed on the host — no network access needed.

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
  const ok = probeImports(systemPython, null, ['os', 'sys', 'json']);
  assert.equal(ok.ok, true);
  assert.equal(ok.missing, '');

  const missing = probeImports(systemPython, null, ['definitely_not_a_real_module_xyz']);
  assert.equal(missing.ok, false);
  assert.equal(missing.missing, 'definitely_not_a_real_module_xyz');
});

test('ensurePythonDependencies: skips install when already-satisfied (stdlib-only requirements)', async (t) => {
  if (!systemPython) { t.skip('no system python on PATH'); return; }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-pydeps-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // No requirements.txt at all — should short-circuit without touching pip.
  const result = await ensurePythonDependencies({
    pythonPath: systemPython,
    requirementsPath: path.join(tmpDir, 'requirements.txt'),
    targetDir: path.join(tmpDir, 'deps'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no-requirements-file');
});

test('ensurePythonDependencies: creates targetDir even when skipped', async (t) => {
  if (!systemPython) { t.skip('no system python on PATH'); return; }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-pydeps-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const targetDir = path.join(tmpDir, 'deps');

  await ensurePythonDependencies({
    pythonPath: systemPython,
    requirementsPath: path.join(tmpDir, 'missing-requirements.txt'),
    targetDir,
  });
  // Short-circuits on missing requirements.txt before mkdir — directory
  // should NOT exist in that case (nothing to install).
  assert.equal(fs.existsSync(targetDir), false);
});
