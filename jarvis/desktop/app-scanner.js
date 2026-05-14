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
        launchType: app.launchType || (app.launchMode === 'filePath' ? 'executable' : 'shell'),
        launchMode: app.launchMode === 'filePath' ? 'filePath' : 'start',
        source: app.source || 'scan',
        aliases: Array.from(aliases).filter(Boolean),
        iconPath: app.iconPath || null,
        installRoot: app.installRoot || null,
        riskLevel: app.riskLevel || 'safe',
      });
      continue;
    }

    if (!current.launchTarget && launchTarget) current.launchTarget = launchTarget;
    if (current.launchType !== 'executable' && app.launchType === 'executable') current.launchType = 'executable';
    if (current.launchMode !== 'filePath' && app.launchMode === 'filePath') current.launchMode = 'filePath';
    if (!current.iconPath && app.iconPath) current.iconPath = app.iconPath;
    if (!current.installRoot && app.installRoot) current.installRoot = app.installRoot;
    current.aliases = Array.from(new Set([...(current.aliases || []), ...aliases])).filter(Boolean);
  }

  return Array.from(map.values());
}

async function scanWindowsApps(execFilePromise) {
  const psScript = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$results = New-Object System.Collections.Generic.List[Object]',
    'function Add-LauncherResult {',
    '  param([string]$Name, [string]$Target, [string]$LaunchType, [string]$Source, [string]$IconPath, [string]$InstallRoot)',
    '  if ([string]::IsNullOrWhiteSpace($Name) -or [string]::IsNullOrWhiteSpace($Target)) { return }',
    '  $results.Add([PSCustomObject]@{',
    '    key = [System.IO.Path]::GetFileNameWithoutExtension($Name)',
    '    name = [System.IO.Path]::GetFileNameWithoutExtension($Name)',
    '    launchTarget = $Target,',
    '    launchType = $LaunchType,',
    '    launchMode = if ($LaunchType -eq "executable") { "filePath" } else { "start" },',
    '    source = $Source,',
    '    iconPath = $IconPath,',
    '    installRoot = $InstallRoot',
    '  })',
    '}',
    '$shell = New-Object -ComObject WScript.Shell',
    '$startMenuPaths = @(',
    '  (Join-Path $env:ProgramData "Microsoft\\Windows\\Start Menu\\Programs"),',
    '  (Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs")',
    ') | Where-Object { $_ -and (Test-Path $_) }',
    'foreach ($menuPath in $startMenuPaths) {',
    '  Get-ChildItem -Path $menuPath -Recurse -File -Include *.lnk,*.exe | ForEach-Object {',
    '    $target = $_.FullName',
    '    $launchType = if ($_.Extension -ieq ".lnk") { "shortcut" } else { "executable" }',
    '    $icon = $_.FullName',
    '    $installRoot = Split-Path -Parent $_.FullName',
    '    if ($_.Extension -ieq ".lnk") {',
    '      try {',
    '        $shortcut = $shell.CreateShortcut($_.FullName)',
    '        if ($shortcut.TargetPath) { $target = $shortcut.TargetPath }',
    '        if ($shortcut.IconLocation) { $icon = ($shortcut.IconLocation -split ",")[0] }',
    '        if ($shortcut.WorkingDirectory) { $installRoot = $shortcut.WorkingDirectory }',
    '      } catch {}',
    '    }',
    '    Add-LauncherResult -Name $_.Name -Target $target -LaunchType $launchType -Source $_.FullName -IconPath $icon -InstallRoot $installRoot',
    '  }',
    '}',
    '$uninstallRoots = @(',
    '  "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",',
    '  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"',
    ')',
    'foreach ($root in $uninstallRoots) {',
    '  Get-ItemProperty -Path $root | ForEach-Object {',
    '    $name = $_.DisplayName',
    '    $icon = if ($_.DisplayIcon) { ($_.DisplayIcon -split ",")[0].Trim("\"") } else { $null }',
    '    $target = $icon',
    '    if ((-not $target -or -not (Test-Path $target)) -and $_.InstallLocation -and (Test-Path $_.InstallLocation)) {',
    '      $candidate = Get-ChildItem -Path $_.InstallLocation -File -Filter *.exe | Select-Object -First 1',
    '      if ($candidate) { $target = $candidate.FullName }',
    '    }',
    '    if ($name -and $target) {',
    '      Add-LauncherResult -Name $name -Target $target -LaunchType "executable" -Source $root -IconPath $icon -InstallRoot $_.InstallLocation',
    '    }',
    '  }',
    '}',
    '$appPathRoots = @(',
    '  "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",',
    '  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths"',
    ')',
    'foreach ($root in $appPathRoots) {',
    '  if (-not (Test-Path $root)) { continue }',
    '  Get-ChildItem -Path $root | ForEach-Object {',
    '    $props = Get-ItemProperty -Path $_.PSPath',
    '    $target = $props."(default)"',
    '    $name = $_.PSChildName',
    '    if ($target) {',
    '      Add-LauncherResult -Name $name -Target $target -LaunchType "executable" -Source $_.PSPath -IconPath $target -InstallRoot (Split-Path -Parent $target)',
    '    }',
    '  }',
    '}',
    '$installRoots = @(',
    '  $env:ProgramFiles,',
    '  ${env:ProgramFiles(x86)},',
    '  (Join-Path $env:LOCALAPPDATA "Programs"),',
    '  (Join-Path $env:LOCALAPPDATA "Microsoft\\WindowsApps")',
    ') | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique',
    'foreach ($root in $installRoots) {',
    '  $rootFiles = Get-ChildItem -Path $root -File -Filter *.exe | Select-Object -First 20',
    '  foreach ($file in $rootFiles) {',
    '    Add-LauncherResult -Name $file.Name -Target $file.FullName -LaunchType "executable" -Source $root -IconPath $file.FullName -InstallRoot $root',
    '  }',
    '  $directories = Get-ChildItem -Path $root -Directory | Select-Object -First 120',
    '  foreach ($directory in $directories) {',
    '    Get-ChildItem -Path $directory.FullName -File -Filter *.exe | Select-Object -First 3 | ForEach-Object {',
    '      Add-LauncherResult -Name $_.Name -Target $_.FullName -LaunchType "executable" -Source $directory.FullName -IconPath $_.FullName -InstallRoot $directory.FullName',
    '    }',
    '  }',
    '}',
    'Get-StartApps | ForEach-Object {',
    '  if ($_.Name -and $_.AppID) {',
    '    Add-LauncherResult -Name $_.Name -Target $_.AppID -LaunchType "uwp" -Source "Get-StartApps" -IconPath $null -InstallRoot $null',
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
