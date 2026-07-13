'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { desktopCapturer, screen } = require('electron');

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function pickShellArgs(commandLine) {
  const line = String(commandLine || '').trim();
  if (!line) throw new Error('os-command-required');
  if (process.platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', line] };
  return { command: '/bin/bash', args: ['-lc', line] };
}

function averageCpuTimes(sample) {
  return sample.reduce((acc, cpu) => ({
    idle: acc.idle + cpu.times.idle,
    total: acc.total + Object.values(cpu.times).reduce((sum, value) => sum + value, 0),
  }), { idle: 0, total: 0 });
}

async function measureCpuPercent(delayMs = 150) {
  const start = averageCpuTimes(os.cpus());
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const end = averageCpuTimes(os.cpus());
  const idle = end.idle - start.idle;
  const total = end.total - start.total;
  if (total <= 0) return 0;
  return Number(((1 - idle / total) * 100).toFixed(2));
}

function createOperatingSystemTools({ app, shell, appsTool, permissions, securityAudit } = {}) {
  if (!app || typeof app.getPath !== 'function') throw new Error('electron-app-required');
  if (!appsTool) throw new Error('apps-tool-required');

  async function authorize(action) {
    if (!permissions || typeof permissions.authorize !== 'function') return { allowed: true };
    return permissions.authorize(action);
  }

  async function launch_app(params = {}) {
    const auth = await authorize('tools:launch-app');
    if (!auth.allowed) throw new Error(`permission-denied:${auth.reason || 'forbidden'}`);
    const appName = String(params.name || params.appName || '').trim();
    if (!appName) throw new Error('os-app-name-required');
    if (typeof securityAudit === 'function') securityAudit({ action: 'os:launch-app', target: appName });
    return appsTool.launchAnyApp({ shell, appName });
  }

  async function get_system_stats() {
    const cpuPercent = await measureCpuPercent();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    let diskFreeBytes = null;
    let diskTotalBytes = null;
    try {
      const stat = fs.statfsSync(app.getPath('home'));
      diskFreeBytes = Number(stat.bavail || stat.bfree || 0) * Number(stat.bsize || 1);
      diskTotalBytes = Number(stat.blocks || 0) * Number(stat.bsize || 1);
    } catch {
      // best effort
    }
    return {
      platform: process.platform,
      uptimeSeconds: Math.round(os.uptime()),
      cpuPercent,
      memory: {
        totalBytes: totalMemBytes,
        freeBytes: freeMemBytes,
        usedBytes: totalMemBytes - freeMemBytes,
      },
      disk: {
        freeBytes: diskFreeBytes,
        totalBytes: diskTotalBytes,
      },
      loadAverage: os.loadavg(),
    };
  }

  async function take_screenshot() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const size = primaryDisplay?.size || { width: 1920, height: 1080 };
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, Math.floor(size.width)),
        height: Math.max(1, Math.floor(size.height)),
      },
    });
    const source = sources[0];
    if (!source?.thumbnail || source.thumbnail.isEmpty()) {
      throw new Error('os-screenshot-unavailable');
    }
    const fileName = `jarvis-screenshot-${Date.now()}.png`;
    const outputPath = path.join(app.getPath('temp'), fileName);
    await fs.promises.writeFile(outputPath, source.thumbnail.toPNG());
    return {
      ok: true,
      path: outputPath,
      width: source.thumbnail.getSize().width,
      height: source.thumbnail.getSize().height,
    };
  }

  async function execute_command(params = {}) {
    const auth = await authorize('tools:os-execute-command');
    if (!auth.allowed) throw new Error(`permission-denied:${auth.reason || 'forbidden'}`);
    const commandLine = String(params.command || params.cmd || '').trim();
    const { command, args } = pickShellArgs(commandLine);
    if (typeof securityAudit === 'function') securityAudit({ action: 'os:execute-command', target: commandLine.slice(0, 300) });
    const result = await execFilePromise(command, args, {
      timeout: Math.max(1000, Math.min(120000, Number(params.timeoutMs) || 15000)),
      maxBuffer: 1024 * 1024 * 2,
      windowsHide: true,
    });
    return {
      ok: true,
      command: commandLine,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
    };
  }

  return {
    launch_app,
    get_system_stats,
    take_screenshot,
    execute_command,
  };
}

module.exports = {
  createOperatingSystemTools,
};
