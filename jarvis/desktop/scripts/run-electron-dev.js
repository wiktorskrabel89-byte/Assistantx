#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');

const electronBinary = require('electron');
const isLinux = process.platform === 'linux';
const hasDisplay = Boolean(process.env.DISPLAY);
const electronArgs = ['--no-sandbox', '.'];

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
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
  run(electronBinary, ['.']);
} else if (hasDisplay) {
  run(electronBinary, electronArgs);
} else {
  const hasXvfb = spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).status === 0;
  if (!hasXvfb) {
    console.error('[jarvis-dev] No DISPLAY detected and xvfb-run is unavailable.');
    console.error('[jarvis-dev] Install xvfb (or run from a desktop session) to start Electron in Linux headless environments.');
    process.exit(1);
  }

  run('xvfb-run', ['-a', electronBinary, ...electronArgs]);
}
