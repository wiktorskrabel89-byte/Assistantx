param(
    [string]$InstallDir = "$env:ProgramFiles\Jarvis",
    [string]$AppName    = "Jarvis.exe"
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   JARVIS POST-INSTALL CONFIGURATION         " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan

# ── 1. Autostart shortcut ─────────────────────────────────────────────────
$appPath     = Join-Path $InstallDir $AppName
$startupDir  = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"

try {
    $shell    = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath       = $appPath
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description      = "Jarvis AI Assistant"
    $shortcut.Save()
    Write-Host "[OK] Autostart shortcut created: $shortcutPath" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not create autostart shortcut: $_" -ForegroundColor Yellow
}

# ── 2. Disable fast startup (HiberbootEnabled) ────────────────────────────
try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power"
    Set-ItemProperty -Path $regPath -Name "HiberbootEnabled" -Value 0 -ErrorAction Stop
    Write-Host "[OK] Fast startup disabled." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not disable fast startup: $_" -ForegroundColor Yellow
}

# ── 3. Disable hibernation ────────────────────────────────────────────────
try {
    & powercfg /h off 2>&1 | Out-Null
    Write-Host "[OK] Hibernation disabled." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not disable hibernation: $_" -ForegroundColor Yellow
}

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   SETUP COMPLETE                             " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan
