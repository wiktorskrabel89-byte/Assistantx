'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

// Cheap presence probe — a handful of representative top-level imports
// rather than every requirements.txt entry (most of which differ in PyPI
// name vs import name and would need a hand-maintained map). If these
// import cleanly, the sidecar's actual `import` statements at the top of
// main.py will too; if pip partially fails on an optional/lazy-imported
// package (e.g. a native build with no wheel for this Python), the probe
// still passes and the sidecar starts in its existing degraded mode.
const PROBE_MODULES = ['websockets', 'numpy', 'sounddevice', 'onnxruntime', 'openai'];

function probeImports(pythonPath, modules = PROBE_MODULES) {
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
  try {
    const result = spawnSync(pythonPath, ['-c', code], { timeout: 10_000 });
    return {
      ok: result.status === 0,
      missing: (result.stdout || '').toString('utf8').trim(),
    };
  } catch (error) {
    return { ok: false, missing: '', error: error?.message || String(error) };
  }
}

function runPipInstall(pythonPath, requirementsPath, onProgress) {
  return new Promise((resolve) => {
    const args = [
      '-m', 'pip', 'install',
      '-r', requirementsPath,
      '--disable-pip-version-check',
      '--no-warn-script-location',
    ];
    let child;
    try {
      child = spawn(pythonPath, args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }
    const onChunk = (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      const lastLine = text.split(/\r?\n/).pop();
      if (lastLine) onProgress?.({ phase: 'installing_deps', status: lastLine });
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.on('error', (error) => resolve({ ok: false, error: error?.message || String(error) }));
    child.on('close', (pipExitCode) => resolve({ ok: pipExitCode === 0, pipExitCode }));
  });
}

// Windows-only: the embeddable Python distribution this app ships under
// Program Files needs Administrator rights to write its own site-packages.
// Self-elevates via a UAC prompt to run the SAME pip install one time —
// after that, the packages are on disk permanently and every future
// launch's initial probe succeeds without ever elevating again.
function runPipInstallElevated(pythonPath, requirementsPath, onProgress) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, error: 'elevation-only-supported-on-windows' });
      return;
    }
    const scriptPath = path.join(os.tmpdir(), `jarvis-pip-elevated-${crypto.randomUUID()}.ps1`);
    const logPath = path.join(os.tmpdir(), `jarvis-pip-elevated-${crypto.randomUUID()}.log`);
    const script = [
      `& ${JSON.stringify(pythonPath)} -m pip install -r ${JSON.stringify(requirementsPath)} --disable-pip-version-check --no-warn-script-location *> ${JSON.stringify(logPath)}`,
      'exit $LASTEXITCODE',
    ].join('\n');
    try {
      fs.writeFileSync(scriptPath, script, 'utf8');
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }

    onProgress?.({ phase: 'installing_deps', status: 'Requesting administrator permission to install AI runtime dependencies…' });

    const psArgs = [
      '-NoProfile', '-Command',
      `Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"' -Verb RunAs -Wait`,
    ];
    let child;
    try {
      child = spawn('powershell.exe', psArgs, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }
    child.on('error', (error) => resolve({ ok: false, error: error?.message || String(error) }));
    child.on('close', (exitCode) => {
      let tail = '';
      try { tail = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-1)[0] || ''; } catch { /* log may not exist if UAC was declined */ }
      try { fs.unlinkSync(scriptPath); } catch { /* best effort */ }
      try { fs.unlinkSync(logPath); } catch { /* best effort */ }
      resolve({ ok: exitCode === 0, exitCode, lastLine: tail });
    });
  });
}

// Guards against concurrent installs for the same interpreter. Without
// this, every sidecar auto-restart attempt during a still-running
// first-time install (which can take several minutes for ~100 packages
// like torch/spacy/sentence-transformers) spawned ANOTHER `pip install`,
// racing on the same site-packages files on disk.
const inFlightByPython = new Map();

/**
 * Ensures the sidecar's Python dependencies are importable before it's
 * spawned. Installs directly into the interpreter's own site-packages
 * (the only location an embeddable Python distribution with a `._pth`
 * file will actually search — `PYTHONPATH` and `--target` are both
 * silently ignored in that mode, regardless of what they point at). Tries
 * a normal install first; if that fails (e.g. no write access under
 * Program Files), retries once via a UAC-elevated child process.
 */
function ensurePythonDependencies({ pythonPath, requirementsPath, onProgress }) {
  const existing = inFlightByPython.get(pythonPath);
  if (existing) return existing;
  const promise = ensurePythonDependenciesUncached({ pythonPath, requirementsPath, onProgress })
    .finally(() => {
      if (inFlightByPython.get(pythonPath) === promise) inFlightByPython.delete(pythonPath);
    });
  inFlightByPython.set(pythonPath, promise);
  return promise;
}

async function ensurePythonDependenciesUncached({ pythonPath, requirementsPath, onProgress }) {
  if (!fs.existsSync(requirementsPath)) {
    return { ok: true, skipped: true, reason: 'no-requirements-file' };
  }

  const initialProbe = probeImports(pythonPath);
  if (initialProbe.ok) {
    return { ok: true, skipped: true, reason: 'already-satisfied' };
  }

  onProgress?.({
    phase: 'installing_deps',
    status: `Installing missing Python packages (${initialProbe.missing || 'unknown'})…`,
  });

  const firstAttempt = await runPipInstall(pythonPath, requirementsPath, onProgress);
  let recheck = probeImports(pythonPath);
  if (recheck.ok) {
    return { ok: true, pipExitCode: firstAttempt.pipExitCode, attempt: 'direct' };
  }

  // Direct install didn't satisfy the probe — most likely a permissions
  // failure writing into Program Files. Retry once, elevated.
  const elevatedAttempt = await runPipInstallElevated(pythonPath, requirementsPath, onProgress);
  recheck = probeImports(pythonPath);
  return {
    ok: recheck.ok,
    missing: recheck.missing,
    pipExitCode: firstAttempt.pipExitCode,
    elevated: elevatedAttempt,
    attempt: 'elevated',
  };
}

module.exports = { ensurePythonDependencies, probeImports, PROBE_MODULES };
