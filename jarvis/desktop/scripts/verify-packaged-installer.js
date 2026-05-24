#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const distRoot = path.join(desktopRoot, 'dist');

const requiredFiles = [
  'latest.yml',
  'release-notes.json',
];

const requiredPatternGroups = [
  /^JarvisSetup-.*-x64\.exe$/i,
  /^JarvisSetup-.*-arm64\.exe$/i,
  /^JarvisSetup-.*-x64\.exe\.blockmap$/i,
  /^JarvisSetup-.*-arm64\.exe\.blockmap$/i,
];

function fail(message) {
  console.error(`[smoke:installer] ${message}`);
  process.exit(1);
}

function assertFileExists(fileName) {
  const absolutePath = path.join(distRoot, fileName);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required file: dist/${fileName}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.size <= 0) {
    fail(`File is empty: dist/${fileName}`);
  }

  return absolutePath;
}

function assertExeHasMZHeader(fileName) {
  const absolutePath = assertFileExists(fileName);
  const header = fs.readFileSync(absolutePath).subarray(0, 2);
  if (header.length < 2 || header[0] !== 0x4d || header[1] !== 0x5a) {
    fail(`Invalid executable header (expected MZ): dist/${fileName}`);
  }

  function assertPatternExists(pattern) {
    const files = fs.readdirSync(distRoot);
    const found = files.find((file) => pattern.test(file));
    if (!found) {
      fail(`Missing required file matching pattern: ${pattern}`);
    }
    return found;
  }
}

function readLatestEntries(latestRaw) {
  const entryRegex = /^\s*(?:path|url)\s*:\s*["']?([^"'\r\n#]+)["']?\s*$/gm;
  const entries = [];
  let match = entryRegex.exec(latestRaw);
  while (match) {
    const candidate = (match[1] || '').trim();
    if (candidate) entries.push(candidate);
    match = entryRegex.exec(latestRaw);
  }
  return Array.from(new Set(entries));
}

if (!fs.existsSync(distRoot)) {
  fail('Missing dist directory. Run a Windows build first.');
}

for (const fileName of requiredFiles) {
  assertFileExists(fileName);
}

for (const pattern of requiredPatternGroups) {
  assertPatternExists(pattern);
}

const winX64Exe = assertPatternExists(/^JarvisSetup-.*-x64\.exe$/i);
const winArm64Exe = assertPatternExists(/^JarvisSetup-.*-arm64\.exe$/i);
assertExeHasMZHeader(winX64Exe);
assertExeHasMZHeader(winArm64Exe);

const latestPath = path.join(distRoot, 'latest.yml');
const latestRaw = fs.readFileSync(latestPath, 'utf8');
if (!latestRaw.trim()) {
  fail('dist/latest.yml is empty.');
}

const referencedArtifacts = readLatestEntries(latestRaw);
if (referencedArtifacts.length === 0) {
  fail('dist/latest.yml does not contain path/url artifact entries.');
}

for (const artifact of referencedArtifacts) {
  const artifactPath = path.join(distRoot, artifact);
  if (!fs.existsSync(artifactPath)) {
    fail(`dist/latest.yml references missing artifact: ${artifact}`);
  }
}

const releaseNotesPath = path.join(distRoot, 'release-notes.json');
let releaseNotes;
try {
  releaseNotes = JSON.parse(fs.readFileSync(releaseNotesPath, 'utf8'));
} catch (error) {
  fail(`dist/release-notes.json is invalid JSON (${error.message}).`);
}

if (!releaseNotes || typeof releaseNotes !== 'object') {
  fail('dist/release-notes.json must be a JSON object.');
}

if (!releaseNotes.version || typeof releaseNotes.version !== 'string') {
  fail('dist/release-notes.json is missing string field: version');
}

if (!Array.isArray(releaseNotes.highlights) || releaseNotes.highlights.length === 0) {
  fail('dist/release-notes.json must include a non-empty highlights array.');
}

console.log('[smoke:installer] Packaged installer smoke checks passed.');
