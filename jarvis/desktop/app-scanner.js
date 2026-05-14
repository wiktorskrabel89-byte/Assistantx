function normalizeName(value) {
  return String(value || '')
    .replace(/\.(lnk|exe)$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dedupeApps(apps = []) {
  const map = new Map();
  for (const app of apps) {
    const key = normalizeKey(app.key || app.name);
    const launchTarget = String(app.launchTarget || '').trim();
    if (!key || !launchTarget) continue;

    const aliases = new Set([...(Array.isArray(app.aliases) ? app.aliases : []), normalizeName(app.name), key]);
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        key,
        name: normalizeName(app.name) || key,
        launchTarget,
        launchMode: app.launchMode === 'filePath' ? 'filePath' : 'start',
        source: app.source || 'scan',
        aliases: Array.from(aliases).filter(Boolean),
      });
      continue;
    }

    if (!current.launchTarget && launchTarget) current.launchTarget = launchTarget;
    if (current.launchMode !== 'filePath' && app.launchMode === 'filePath') current.launchMode = 'filePath';
    current.aliases = Array.from(new Set([...(current.aliases || []), ...aliases])).filter(Boolean);
  }

  return Array.from(map.values());
}

async function scanWindowsApps(execFilePromise) {
  const psScript = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$paths = @(',
    '  (Join-Path $env:ProgramData "Microsoft\\Windows\\Start Menu\\Programs"),',
    '  (Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"),',
    '  (Join-Path $env:LOCALAPPDATA "Programs"),',
    '  (Join-Path $env:LOCALAPPDATA "Microsoft\\WindowsApps")',
    ') | Where-Object { $_ -and (Test-Path $_) }',
    '$shell = New-Object -ComObject WScript.Shell',
    '$results = @()',
    'foreach ($p in $paths) {',
    '  $items = Get-ChildItem -Path $p -Recurse -File -Include *.lnk,*.exe',
    '  foreach ($item in $items) {',
    '    $target = $item.FullName',
    '    if ($item.Extension -ieq ".lnk") {',
    '      try {',
    '        $shortcut = $shell.CreateShortcut($item.FullName)',
    '        if ($shortcut.TargetPath) { $target = $shortcut.TargetPath }',
    '      } catch {}',
    '    }',
    '    if ($target) {',
    '      $results += [PSCustomObject]@{',
    '        key = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)',
    '        name = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)',
    '        launchTarget = $target,',
    '        launchMode = if ($target -match "\\.exe$") { "filePath" } else { "start" },',
    '        source = $item.FullName',
    '      }',
    '    }',
    '  }',
    '}',
    '$results | ConvertTo-Json -Compress',
  ].join('; ');

  const stdout = await execFilePromise('powershell.exe', ['-NoProfile', '-Command', psScript]);
  const parsed = JSON.parse(stdout || '[]');
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return dedupeApps(list);
}

module.exports = {
  dedupeApps,
  normalizeKey,
  normalizeName,
  scanWindowsApps,
};
