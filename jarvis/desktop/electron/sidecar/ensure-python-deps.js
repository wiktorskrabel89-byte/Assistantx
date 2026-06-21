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
//
// `kokoro`, `silero_vad` and `faster_whisper` are included even though
// main.py only imports them lazily inside _get_tts_engine()/
// _get_vad_engine()/_get_stt_engine() — verified live that a lazily-
// imported package (and its heavy transitive deps, e.g. kokoro's `torch`)
// can be entirely missing from THIS interpreter's own site-packages while
// still importing successfully during the probe, because pip silently
// treats an unrelated system Python install's per-version user-site
// packages (`%APPDATA%\Python\PythonXY\site-packages`) as "already
// satisfied" and skips installing a real copy. Probing them here is what
// actually catches that gap. `faster_whisper` matters in particular: main.py's
// _get_stt_engine() already prefers it over the ONNX Parakeet fallback
// whenever it's importable — without it being probed/installed, STT
// silently runs on Parakeet instead of real Whisper, with no error anywhere.
const PROBE_MODULES = ['websockets', 'numpy', 'sounddevice', 'onnxruntime', 'openai', 'kokoro', 'silero_vad', 'faster_whisper'];

// `kokoro` pulls in `torch`, which alone takes ~45s to import cold on a
// CPU-only Windows box (verified live: 46.6s real time) — a 10s timeout
// tuned for the original lightweight-only probe set would kill the probe
// mid-import and misreport a successfully-importable-but-slow package as
// "missing", triggering a full reinstall of every requirement on every
// single launch. 90s gives torch's import room to finish even on a slow
// machine, while still being a one-time-per-launch cost paid only once
// before the sidecar's own (also multi-second) model loading begins.
const PROBE_TIMEOUT_MS = 90_000;

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
    const result = spawnSync(pythonPath, ['-c', code], { timeout: PROBE_TIMEOUT_MS });
    return {
      ok: result.status === 0,
      missing: (result.stdout || '').toString('utf8').trim(),
    };
  } catch (error) {
    return { ok: false, missing: '', error: error?.message || String(error) };
  }
}

function getSitePackagesDir(pythonPath) {
  return path.join(path.dirname(pythonPath), 'Lib', 'site-packages');
}

function canWriteDir(dir) {
  try {
    const probe = path.join(dir, `.jarvis-write-test-${crypto.randomUUID()}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// `pip install -r requirements.txt` resolves and builds ALL listed
// packages before installing ANY of them — verified live: one package
// with no prebuilt wheel for this Python (webrtcvad, which needs to
// compile from source and fails on this minimal embeddable distribution
// with no dev headers) made the whole batch install NOTHING, even though
// every other package would have built fine on its own. Installing one
// requirement per pip invocation means a single bad apple can't block
// the rest — each one either lands on disk or doesn't, independently.
function parseRequirements(requirementsPath) {
  return fs.readFileSync(requirementsPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

// --ignore-installed forces pip to install a real copy into THIS
// interpreter's own site-packages even when the package already appears
// "satisfied" via some other location on sys.path (most commonly an
// unrelated system Python install's version-matched per-user site-packages
// at `%APPDATA%\Python\PythonXY\site-packages` — Windows pip user-site
// resolution is keyed only by Python version, not by which interpreter is
// running). Without this flag, a transitive dependency like `torch` (pulled
// in by `kokoro`) can silently end up missing from the embeddable Python's
// own site-packages forever, working only by coincidence on whichever
// machine happens to have a matching-version Python with that package
// already pip-installed for the current user.
// kokoro pulls in `torch` transitively. Plain `pip install torch` from
// PyPI resolves the default CUDA-capable Windows wheel (1.5-2.5GB,
// bundles CUDA runtime DLLs) even though Kokoro only ever runs CPU
// inference here — there is no GPU acceleration path in this app at all.
// PyTorch publishes a CPU-only build (~150-250MB) under its own index
// with a `+cpu` local version suffix, which PEP 440 sorts as *higher*
// than the bare CUDA version string — so adding this as an extra index
// (not replacing the default one, which every other requirement still
// needs) is enough for pip's resolver to prefer it automatically,
// cutting the single biggest chunk of this one-time download dramatically.
const TORCH_CPU_INDEX_URL = 'https://download.pytorch.org/whl/cpu';
const PIP_INSTALL_FLAGS = [
  '--disable-pip-version-check',
  '--no-warn-script-location',
  '--ignore-installed',
  '--extra-index-url', TORCH_CPU_INDEX_URL,
];

function runPipInstallOne(pythonPath, requirement, onProgress, progressBase) {
  return new Promise((resolve) => {
    const args = ['-m', 'pip', 'install', requirement, ...PIP_INSTALL_FLAGS];
    let child;
    try {
      child = spawn(pythonPath, args, { windowsHide: true });
    } catch (error) {
      resolve({ requirement, ok: false, error: error?.message || String(error) });
      return;
    }
    const onChunk = (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      const lastLine = text.split(/\r?\n/).pop();
      if (lastLine) onProgress?.({ phase: 'installing_deps', status: `${requirement}: ${lastLine}`, ...progressBase });
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.on('error', (error) => resolve({ requirement, ok: false, error: error?.message || String(error) }));
    child.on('close', (pipExitCode) => resolve({ requirement, ok: pipExitCode === 0, pipExitCode }));
  });
}

async function runPipInstall(pythonPath, requirements, onProgress) {
  const results = [];
  for (let i = 0; i < requirements.length; i += 1) {
    const requirement = requirements[i];
    const progressBase = { index: i, total: requirements.length };
    onProgress?.({ phase: 'installing_deps', status: `Installing ${requirement}…`, ...progressBase });
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential, one bad package must not race/clobber the next
    results.push(await runPipInstallOne(pythonPath, requirement, onProgress, progressBase));
  }
  return results;
}

// Windows-only: the embeddable Python distribution this app ships under
// Program Files needs Administrator rights to write its own site-packages.
// Self-elevates via a UAC prompt to run the SAME per-requirement install
// loop one time — after that, the packages are on disk permanently and
// every future launch's initial probe succeeds without ever elevating
// again.
function runPipInstallElevated(pythonPath, requirements, onProgress) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, error: 'elevation-only-supported-on-windows' });
      return;
    }
    const scriptPath = path.join(os.tmpdir(), `jarvis-pip-elevated-${crypto.randomUUID()}.ps1`);
    const logPath = path.join(os.tmpdir(), `jarvis-pip-elevated-${crypto.randomUUID()}.log`);
    const lines = [
      `$log = ${JSON.stringify(logPath)}`,
      `$python = ${JSON.stringify(pythonPath)}`,
      `$reqs = @(${requirements.map((r) => JSON.stringify(r)).join(', ')})`,
      'foreach ($req in $reqs) {',
      '  "=== $req ===" | Out-File -FilePath $log -Append -Encoding utf8',
      `  & $python -m pip install $req ${PIP_INSTALL_FLAGS.join(' ')} *>> $log`,
      '}',
      'exit 0',
    ];
    try {
      fs.writeFileSync(scriptPath, lines.join('\n'), 'utf8');
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }

    onProgress?.({ phase: 'installing_deps', status: 'Requesting administrator permission to install AI runtime dependencies…', index: 0, total: requirements.length });

    // -WindowStyle Hidden: the elevated install itself runs invisibly —
    // the only thing the user sees is the one unavoidable UAC consent
    // dialog, not a raw scrolling PowerShell console. Progress still
    // reaches the splash screen below by tailing the same log file the
    // elevated script is writing to (it stamps a "=== package ===" marker
    // before each install, which doubles as a free progress counter).
    const psArgs = [
      '-NoProfile', '-Command',
      `Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"' -Verb RunAs -Wait`,
    ];
    let child;
    try {
      child = spawn('powershell.exe', psArgs, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }

    let lastReported = -1;
    const tailTimer = setInterval(() => {
      let text = '';
      try { text = fs.readFileSync(logPath, 'utf8'); } catch { return; }
      const markers = text.match(/^=== (.+) ===$/gm) || [];
      if (markers.length === lastReported) return;
      lastReported = markers.length;
      const current = markers[markers.length - 1]?.replace(/^=== | ===$/g, '') || '';
      onProgress?.({
        phase: 'installing_deps',
        status: current ? `Installing ${current}… (admin)` : 'Installing AI runtime dependencies… (admin)',
        index: Math.max(0, markers.length - 1),
        total: requirements.length,
      });
    }, 700);

    child.on('error', (error) => {
      clearInterval(tailTimer);
      resolve({ ok: false, error: error?.message || String(error) });
    });
    child.on('close', (exitCode) => {
      clearInterval(tailTimer);
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
 * silently ignored in that mode, regardless of what they point at), one
 * requirement at a time (see parseRequirements/runPipInstall comment).
 * Tries a normal install first; if that fails (e.g. no write access
 * under Program Files), retries once via a UAC-elevated child process.
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

  const requirements = parseRequirements(requirementsPath);
  onProgress?.({
    phase: 'installing_deps',
    status: `Installing missing Python packages (${initialProbe.missing || 'unknown'})…`,
  });

  // Skip the direct attempt entirely when site-packages clearly isn't
  // writable (e.g. the embeddable Python under Program Files) — verified
  // live that without this check, EVERY one of ~19 requirements would
  // fully download+build before failing at the final permission-denied
  // copy step, burning minutes on a doomed attempt before ever reaching
  // the elevated retry that actually works.
  const sitePackagesWritable = process.platform !== 'win32' || canWriteDir(getSitePackagesDir(pythonPath));

  let firstAttempt = null;
  if (sitePackagesWritable) {
    firstAttempt = await runPipInstall(pythonPath, requirements, onProgress);
    const recheckDirect = probeImports(pythonPath);
    if (recheckDirect.ok) {
      return { ok: true, results: firstAttempt, attempt: 'direct' };
    }
  }

  // Direct install was skipped or didn't satisfy the probe — most likely
  // a permissions failure writing into Program Files. Retry once, elevated.
  const elevatedAttempt = await runPipInstallElevated(pythonPath, requirements, onProgress);
  let recheck;
  recheck = probeImports(pythonPath);
  return {
    ok: recheck.ok,
    missing: recheck.missing,
    results: firstAttempt,
    elevated: elevatedAttempt,
    attempt: 'elevated',
  };
}

module.exports = { ensurePythonDependencies, probeImports, parseRequirements, PROBE_MODULES };
