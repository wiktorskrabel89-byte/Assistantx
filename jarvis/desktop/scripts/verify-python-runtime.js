#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const desktopRoot = path.resolve(__dirname, '..');
if (process.platform !== 'win32') {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    console.log('[dist] Non-Windows platform detected. Using system python3 runtime.');
    process.exit(0);
  } catch {
    console.warn('[dist] Non-Windows platform detected and python3 is not available in PATH. Skipping embedded runtime preflight.');
    process.exit(0);
  }
}

const runtimeRoot = path.join(desktopRoot, 'python');
const requiredFiles = [path.join(runtimeRoot, 'python.exe')];

const optionalRecommended = [
  path.join(runtimeRoot, 'python311.dll'),
];

const missingRequired = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
if (missingRequired.length > 0) {
  console.error('[dist] Embedded Python runtime is incomplete.');
  console.error('[dist] Missing required files:');
  for (const filePath of missingRequired) {
    console.error(`  - ${path.relative(desktopRoot, filePath)}`);
  }
  console.error('[dist] Put a real Windows embeddable runtime under jarvis/desktop/python/, e.g.:');
  console.error('  jarvis/desktop/python/python.exe');
  console.error('  jarvis/desktop/python/python311.dll');
  console.error('  jarvis/desktop/python/Lib/... (if used by your runtime bundle)');
  process.exit(1);
}

const missingRecommended = optionalRecommended.filter((filePath) => !fs.existsSync(filePath));
if (missingRecommended.length > 0) {
  console.warn('[dist] Warning: recommended embedded Python files are missing:');
  for (const filePath of missingRecommended) {
    console.warn(`  - ${path.relative(desktopRoot, filePath)}`);
  }
}

console.log('[dist] Embedded Python runtime preflight passed:', path.relative(desktopRoot, requiredFiles[0]));
