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

Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "   JARVIS POST-INSTALL CONFIGURATION         " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan

# ── 1. Autostart shortcut ─────────────────────────────────────────────────
$appPath      = Get-JarvisExecutablePath -SearchRoot $InstallDir -PreferredName $AppName
$startupDir   = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"

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
