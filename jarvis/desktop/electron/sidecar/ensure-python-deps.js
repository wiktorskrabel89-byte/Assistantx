'use strict';

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

// Cheap presence probe — a handful of representative top-level imports
// rather than every requirements.txt entry (most of which differ in PyPI
// name vs import name and would need a hand-maintained map). If these
// import cleanly, the sidecar's actual `import` statements at the top of
// main.py will too; if pip partially fails on an optional/lazy-imported
// package (e.g. a native build with no wheel for this Python), the probe
// still passes and the sidecar starts in its existing degraded mode.
const PROBE_MODULES = ['websockets', 'numpy', 'sounddevice', 'onnxruntime', 'openai'];

function probeImports(pythonPath, extraPythonPath, modules = PROBE_MODULES) {
  const code = [
    'import sys',
    `mods = ${JSON.stringify(modules)}`,
    'missing = []',
    'for m in mods:',
    '    try:',
    '        __import__(m)',
    '    except Exception:',
    '        missing.append(m)',
    "print(','.join(missing))",
    'sys.exit(1 if missing else 0)',
  ].join('\n');
  const env = { ...process.env };
  if (extraPythonPath) {
    env.PYTHONPATH = env.PYTHONPATH ? `${extraPythonPath}${require('path').delimiter}${env.PYTHONPATH}` : extraPythonPath;
  }
  try {
    const result = spawnSync(pythonPath, ['-c', code], { env, timeout: 10_000 });
    return {
      ok: result.status === 0,
      missing: (result.stdout || '').toString('utf8').trim(),
    };
  } catch (error) {
    return { ok: false, missing: '', error: error?.message || String(error) };
  }
}

/**
 * Ensures the sidecar's Python dependencies are importable before it's
 * spawned. Installs into `targetDir` (expected to be a user-writable path,
 * e.g. under Electron's userData) via `pip install --target` so this never
 * needs Administrator elevation, even for a packaged build's embeddable
 * Python under Program Files. Returns { ok, skipped, pythonPath: targetDir
 * for PYTHONPATH }.
 */
// Guards against concurrent installs into the same targetDir. Without
// this, every sidecar auto-restart attempt during a still-running
// first-time install (which can take several minutes for ~100 packages
// like torch/spacy/sentence-transformers) spawned ANOTHER `pip install`
// into the same directory, racing on the same files on disk.
const inFlightByTarget = new Map();

function ensurePythonDependencies({ pythonPath, requirementsPath, targetDir, onProgress }) {
  const existing = inFlightByTarget.get(targetDir);
  if (existing) return existing;
  const promise = ensurePythonDependenciesUncached({ pythonPath, requirementsPath, targetDir, onProgress })
    .finally(() => {
      if (inFlightByTarget.get(targetDir) === promise) inFlightByTarget.delete(targetDir);
    });
  inFlightByTarget.set(targetDir, promise);
  return promise;
}

function ensurePythonDependenciesUncached({ pythonPath, requirementsPath, targetDir, onProgress }) {
  return new Promise((resolve) => {
    if (!fs.existsSync(requirementsPath)) {
      resolve({ ok: true, skipped: true, reason: 'no-requirements-file' });
      return;
    }
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }

    const initialProbe = probeImports(pythonPath, targetDir);
    if (initialProbe.ok) {
      resolve({ ok: true, skipped: true, reason: 'already-satisfied' });
      return;
    }

    onProgress?.({
      phase: 'installing_deps',
      status: `Installing missing Python packages (${initialProbe.missing || 'unknown'})…`,
    });

    const args = [
      '-m', 'pip', 'install',
      '--target', targetDir,
      '-r', requirementsPath,
      '--disable-pip-version-check',
      '--no-warn-script-location',
    ];
    let child;
    try {
      child = spawn(pythonPath, args, { env: process.env, windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }

    let lastLine = '';
    const onChunk = (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      lastLine = text.split(/\r?\n/).pop() || lastLine;
      onProgress?.({ phase: 'installing_deps', status: lastLine });
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);

    child.on('error', (error) => {
      resolve({ ok: false, error: error?.message || String(error) });
    });
    child.on('close', (pipExitCode) => {
      // Re-probe the CORE modules only — an individual optional package
      // (e.g. a native build with no prebuilt wheel) can make pip's
      // overall exit code non-zero without the sidecar actually needing
      // it (most such packages are lazy-imported fallbacks). Trust the
      // probe over the raw pip exit code.
      const recheck = probeImports(pythonPath, targetDir);
      resolve({ ok: recheck.ok, pipExitCode, missing: recheck.missing });
    });
  });
}

module.exports = { ensurePythonDependencies, probeImports, PROBE_MODULES };
