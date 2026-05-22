param(
    [string]$InstallDir = "$env:ProgramFiles\Jarvis"
)

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   JARVIS UNINSTALL CLEANUP                   " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan

# ── 1. Remove Startup shortcut ────────────────────────────────────────────
$startupDir   = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"
$guardShortcutPath = Join-Path $startupDir "Jarvis Power Guard.lnk"

if (Test-Path $shortcutPath) {
    try {
        Remove-Item -Path $shortcutPath -Force -ErrorAction Stop
        Write-Host "[OK] Startup shortcut removed: $shortcutPath" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not remove startup shortcut: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] No startup shortcut found at: $shortcutPath" -ForegroundColor Gray
}

if (Test-Path $guardShortcutPath) {
    try {
        Remove-Item -Path $guardShortcutPath -Force -ErrorAction Stop
        Write-Host "[OK] Power Guard startup shortcut removed: $guardShortcutPath" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not remove Power Guard shortcut: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] No Power Guard shortcut found at: $guardShortcutPath" -ForegroundColor Gray
}

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   CLEANUP COMPLETE                           " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan
