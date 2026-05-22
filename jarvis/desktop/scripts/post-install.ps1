param(
    [string]$InstallDir = "$env:ProgramFiles\Jarvis",
    [string]$AppName    = "Jarvis.exe"
)

$ErrorActionPreference = "SilentlyContinue"

function Get-JarvisExecutablePath {
    param(
        [string]$SearchRoot,
        [string]$PreferredName
    )

    $preferredPath = Join-Path $SearchRoot $PreferredName
    if (Test-Path $preferredPath) {
        return $preferredPath
    }

    $jarvisExe = Get-ChildItem -Path $SearchRoot -Filter "Jarvis*.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notmatch "^(JarvisSetup.*|unins.*|uninstall.*)$"
        } |
        Select-Object -First 1

    if ($jarvisExe) {
        return $jarvisExe.FullName
    }

    $fallbackExe = Get-ChildItem -Path $SearchRoot -Filter "*.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notmatch "^(JarvisSetup.*|unins.*|uninstall.*)$"
        } |
        Select-Object -First 1

    if ($fallbackExe) {
        return $fallbackExe.FullName
    }

    return $null
}

function Get-JarvisPowerGuardPath {
    param(
        [string]$SearchRoot
    )

    $guardExe = Get-ChildItem -Path $SearchRoot -Filter "jarvis-power-guard.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($guardExe) {
        return $guardExe.FullName
    }

    return $null
}

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   JARVIS POST-INSTALL CONFIGURATION         " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan

# ── 1. Autostart shortcut ─────────────────────────────────────────────────
$appPath      = Get-JarvisExecutablePath -SearchRoot $InstallDir -PreferredName $AppName
$guardPath    = Get-JarvisPowerGuardPath -SearchRoot $InstallDir
$startupDir   = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"
$guardShortcutPath = Join-Path $startupDir "Jarvis Power Guard.lnk"

if ([string]::IsNullOrWhiteSpace($appPath)) {
    Write-Host "[WARN] Application executable was not found under: $InstallDir" -ForegroundColor Yellow
    Write-Host "[WARN] Startup shortcut will NOT be created." -ForegroundColor Yellow
} else {
    try {
        $shell    = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath       = $appPath
        $shortcut.WorkingDirectory = Split-Path -Path $appPath -Parent
        $shortcut.Description      = "Jarvis AI Assistant"
        $shortcut.Save()
        Write-Host "[OK] Autostart shortcut created: $shortcutPath" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not create autostart shortcut: $_" -ForegroundColor Yellow
    }
}

if (-not [string]::IsNullOrWhiteSpace($guardPath)) {
    try {
        $shell    = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($guardShortcutPath)
        $shortcut.TargetPath       = $guardPath
        $shortcut.WorkingDirectory = Split-Path -Path $guardPath -Parent
        $shortcut.Description      = "Jarvis Power Guard"
        $shortcut.Save()
        Write-Host "[OK] Power Guard startup shortcut created: $guardShortcutPath" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not create power guard shortcut: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Power Guard executable not found under install dir. Guard autostart skipped." -ForegroundColor Gray
}

# ── 2. Disable fast startup (HiberbootEnabled) ────────────────────────────
try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power"
    Set-ItemProperty -Path $regPath -Name "HiberbootEnabled" -Value 0 -ErrorAction Stop
    Write-Host "[OK] Fast startup disabled." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not disable fast startup: $_" -ForegroundColor Yellow
}

$guardEnabled = (-not [string]::IsNullOrWhiteSpace($guardPath)) -or ($env:JARVIS_POWER_GUARD_ENABLED -match '^(1|true|yes|on)$')

if ($guardEnabled) {
    try {
        & powercfg /h on 2>&1 | Out-Null
        Write-Host "[OK] Hibernation enabled for Jarvis Power Guard." -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not enable hibernation for power guard: $_" -ForegroundColor Yellow
    }
} else {
    try {
        & powercfg /h off 2>&1 | Out-Null
        Write-Host "[OK] Hibernation disabled." -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not disable hibernation: $_" -ForegroundColor Yellow
    }
}

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   SETUP COMPLETE                             " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan
