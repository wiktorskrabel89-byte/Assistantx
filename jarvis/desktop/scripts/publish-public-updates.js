#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const desktopDistDir = path.join(repoRoot, 'jarvis', 'desktop', 'dist');
const androidDistDir = path.join(repoRoot, 'jarvis', 'android', 'dist');
const publicRoot = path.join(repoRoot, 'public');

const platformPatterns = {
  windows: [
    /^latest\.yml$/i,
    /^latest\.yml\.sig$/i,
    /^release-notes\.json$/i,
    /^JarvisSetup-.*\.exe$/i,
    /^JarvisSetup-.*\.exe\.blockmap$/i,
  ],
  mac: [
    /^JarvisSetup-.*\.dmg$/i,
  ],
  linux: [
    /^Jarvis-.*\.AppImage$/i,
  ],
  android: [
    /^Jarvis-android-.*\.apk$/i,
    /^Jarvis-android\.apk$/i,
    /^JarvisAndroid\.apk$/i,
  ],
};

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFiles(sourceDir, destDir, patterns) {
  if (!fs.existsSync(sourceDir)) return [];
  ensureDir(destDir);
  const files = fs.readdirSync(sourceDir);
  const copied = [];
  for (const file of files) {
    if (!patterns.some((pattern) => pattern.test(file))) continue;
    fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
    copied.push(file);
  }
  return copied;
}

function readLatestArtifacts(latestYmlPath) {
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error(`Missing required file: ${latestYmlPath}`);
  }
  const raw = fs.readFileSync(latestYmlPath, 'utf8');
  const matches = [
    ...raw.matchAll(/^\s*path\s*:\s*["']?([^"'\r\n#]+)["']?\s*$/gm),
    ...raw.matchAll(/^\s*url\s*:\s*["']?([^"'\r\n#]+)["']?\s*$/gm),
  ];
  return Array.from(new Set(matches.map((match) => String(match[1] || '').trim()).filter(Boolean)));
}

function main() {
  const windowsDir = path.join(publicRoot, 'windows');
  const macDir = path.join(publicRoot, 'mac');
  const linuxDir = path.join(publicRoot, 'linux');
  const androidDir = path.join(publicRoot, 'android');

  const copiedWindows = copyFiles(desktopDistDir, windowsDir, platformPatterns.windows);
  const copiedMac = copyFiles(desktopDistDir, macDir, platformPatterns.mac);
  const copiedLinux = copyFiles(desktopDistDir, linuxDir, platformPatterns.linux);
  const copiedAndroidFromDesktop = copyFiles(desktopDistDir, androidDir, platformPatterns.android);
  const copiedAndroidFromAndroidDist = copyFiles(androidDistDir, androidDir, platformPatterns.android);

  if (!copiedWindows.includes('latest.yml')) {
    throw new Error('Missing latest.yml in public/windows after publish.');
  }

  const latestRefs = readLatestArtifacts(path.join(windowsDir, 'latest.yml'));
  if (latestRefs.length === 0) {
    throw new Error('public/windows/latest.yml does not reference any artifacts.');
  }
  for (const artifact of latestRefs) {
    const artifactPath = path.join(windowsDir, artifact);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`public/windows/latest.yml references missing artifact: ${artifact}`);
    }
  }

  const rootVersionsPath = path.join(repoRoot, 'versions.json');
  if (fs.existsSync(rootVersionsPath)) {
    fs.copyFileSync(rootVersionsPath, path.join(publicRoot, 'versions.json'));
  }

  console.log(JSON.stringify({
    windows: copiedWindows,
    mac: copiedMac,
    linux: copiedLinux,
    android: [...copiedAndroidFromDesktop, ...copiedAndroidFromAndroidDist],
    versionsJsonCopied: fs.existsSync(rootVersionsPath),
  }, null, 2));
}

main();
