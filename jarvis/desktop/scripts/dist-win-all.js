#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const desktopDir = path.join(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const isLinux = process.platform === 'linux';

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: desktopDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (!isLinux) {
  run('npm', ['run', '_dist:win:all:native']);
} else {
  const dockerOk = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
  if (!dockerOk) {
    console.error('[dist:win:all] Docker is unavailable; cannot use wine-enabled builder image on Linux.');
    process.exit(1);
  }

  const cacheDir = process.env.HOME ? path.join(process.env.HOME, '.cache') : '/tmp';
  run('docker', [
    'run', '--rm',
    '-e', 'ELECTRON_CACHE=/root/.cache/electron',
    '-e', 'ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder',
    '-v', `${desktopDir}:/project`,
    '-v', `${repoRoot}/ai-agent:/ai-agent`,
    '-v', `${cacheDir}/electron:/root/.cache/electron`,
    '-v', `${cacheDir}/electron-builder:/root/.cache/electron-builder`,
    '-w', '/project',
    'electronuserland/builder:wine',
    '/bin/bash', '-lc', 'npm run dist:win && npm run dist:win:arm64',
  ]);
}
