<#
deploy-jarvis.ps1 -- Sync the working tree at C:\Users\wiktor\Desktop\Assistantx
into the installed Jarvis at C:\Program Files\Jarvis.

Run from any elevated PowerShell:

    pwsh -ExecutionPolicy Bypass -File C:\Users\wiktor\Desktop\Assistantx\.fix\deploy-jarvis.ps1

Steps:
  1. Stop running Jarvis processes (gracefully, then force).
  2. Back up the current resources\app.asar to app.asar.bak.
  3. Extract app.asar to a temp dir.
  4. Overlay every changed jarvis\desktop\ file from the repo into the temp dir.
  5. Repack the temp dir into resources\app.asar (via npx @electron/asar).
  6. Mirror ai-agent\ (Python sidecar) -- robocopy /MIR with safe excludes.
  7. Relaunch Jarvis from C:\Program Files\Jarvis\Jarvis.exe.

Idempotent. Safe to re-run.
#>

[CmdletBinding()]
param(
    [string]$RepoRoot   = 'C:\Users\wiktor\Desktop\Assistantx',
    [string]$InstallDir = 'C:\Program Files\Jarvis',
    [switch]$NoRelaunch
)

$ErrorActionPreference = 'Stop'

# Tee everything to a log file so we can read results from an unelevated shell.
$logPath = Join-Path $env:TEMP 'jarvis-deploy.log'
Start-Transcript -Path $logPath -Force | Out-Null

function Require-Admin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error 'deploy-jarvis.ps1 must be run as Administrator (the installed Jarvis lives under C:\Program Files).'
    }
}

function Stop-Jarvis {
    $processes = Get-Process Jarvis -ErrorAction SilentlyContinue
    if (-not $processes) { Write-Host '  Jarvis is not running.' ; return }
    Write-Host "  Stopping $($processes.Count) Jarvis process(es)..."
    foreach ($proc in $processes) {
        try { $proc.CloseMainWindow() | Out-Null } catch { }
    }
    Start-Sleep -Seconds 2
    $remaining = Get-Process Jarvis -ErrorAction SilentlyContinue
    if ($remaining) {
        Write-Host "  Forcing $($remaining.Count) stubborn process(es)..."
        $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

# Files in jarvis/desktop/ that this deploy script knows how to overlay.
# Add new entries here when the next change touches files not in this list.
$DesktopFiles = @(
    'main.js',
    'preload.js',
    'renderer.js',
    'backend.js',
    'sidecar-bridge.js',
    'voice-gateway.js',
    'runtime-config.js',
    'index.html',
    'package.json'
)

# Directories under jarvis/desktop/ that we mirror in full.
$DesktopDirs = @(
    'electron',
    'launcher',
    'prompts',
    'services',
    'telemetry',
    'voice'
)

# Directories under ai-agent/ that we mirror in full (Python sidecar).
$AiAgentDirs = @(
    'memory',
    'nlp',
    'routing',
    'speech',
    'tools',
    'tts',
    'wakeword'
)

# Loose files at ai-agent/ root.
$AiAgentFiles = @(
    'main.py',
    'action_hub.py',
    'code_analyzer.py',
    'requirements.txt',
    'task_classifier.py',
    'worker.py'
)

# -- Pre-flight ---------------------------------------------------------------
Require-Admin

$desktopSrc = Join-Path $RepoRoot 'jarvis\desktop'
$aiAgentSrc = Join-Path $RepoRoot 'ai-agent'
$resources  = Join-Path $InstallDir 'resources'
$asarFile   = Join-Path $resources 'app.asar'
$asarBak    = Join-Path $resources 'app.asar.bak'

foreach ($p in @($desktopSrc, $aiAgentSrc, $resources, $asarFile)) {
    if (-not (Test-Path $p)) { Write-Error "Missing required path: $p" }
}

# -- 1. Stop Jarvis -----------------------------------------------------------
Write-Host ''
Write-Host '[1/7] Stop running Jarvis...' -ForegroundColor Cyan
Stop-Jarvis

# -- 2. Back up current asar --------------------------------------------------
Write-Host ''
Write-Host '[2/7] Back up current app.asar -> app.asar.bak' -ForegroundColor Cyan
Copy-Item $asarFile $asarBak -Force
Write-Host "  Saved $((Get-Item $asarFile).Length) bytes."

# -- 3. Extract asar ----------------------------------------------------------
$stage = Join-Path $env:TEMP ("jarvis-asar-stage-" + [Guid]::NewGuid().Guid)
Write-Host ''
Write-Host "[3/7] Extract app.asar -> $stage" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $stage | Out-Null
& npx --yes @electron/asar extract $asarFile $stage
if ($LASTEXITCODE -ne 0) { Write-Error "asar extract failed (exit $LASTEXITCODE)" }

# -- 4. Overlay desktop files -------------------------------------------------
Write-Host ''
Write-Host '[4/7] Overlay desktop files from repo' -ForegroundColor Cyan
foreach ($file in $DesktopFiles) {
    $src = Join-Path $desktopSrc $file
    $dst = Join-Path $stage      $file
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  + $file"
    } else {
        Write-Host "  - $file (not in repo, skipping)"
    }
}
foreach ($dir in $DesktopDirs) {
    $src = Join-Path $desktopSrc $dir
    $dst = Join-Path $stage      $dir
    if (-not (Test-Path $src)) { continue }
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    Copy-Item $src $dst -Recurse -Force
    Write-Host "  + $dir\\ (recursive)"
}

# -- 5. Repack asar -----------------------------------------------------------
Write-Host ''
Write-Host '[5/7] Repack app.asar' -ForegroundColor Cyan
& npx --yes @electron/asar pack $stage $asarFile --unpack-dir node_modules
if ($LASTEXITCODE -ne 0) { Write-Error "asar pack failed (exit $LASTEXITCODE)" }
$newSize = (Get-Item $asarFile).Length
Write-Host "  New app.asar: $newSize bytes."

Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

# -- 6. Sync ai-agent (loose Python files, not asar) --------------------------
$aiAgentDst = Join-Path $resources 'ai-agent'
Write-Host ''
Write-Host '[6/7] Sync ai-agent (Python sidecar)' -ForegroundColor Cyan
foreach ($file in $AiAgentFiles) {
    $src = Join-Path $aiAgentSrc $file
    $dst = Join-Path $aiAgentDst $file
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  + $file"
    }
}
foreach ($dir in $AiAgentDirs) {
    $src = Join-Path $aiAgentSrc $dir
    $dst = Join-Path $aiAgentDst $dir
    if (-not (Test-Path $src)) { continue }
    # robocopy mirrors with safe excludes (no tests, no __pycache__).
    robocopy $src $dst /MIR /NJH /NJS /NDL /NP /XD __pycache__ tests venv .git /XF *.pyc *.pyo | Out-Null
    Write-Host "  + $dir\\ (mirrored)"
}

# -- 7. Relaunch --------------------------------------------------------------
Write-Host ''
if ($NoRelaunch) {
    Write-Host '[7/7] Skipping relaunch (-NoRelaunch).' -ForegroundColor Yellow
} else {
    Write-Host '[7/7] Relaunch Jarvis' -ForegroundColor Cyan
    Start-Process -FilePath (Join-Path $InstallDir 'Jarvis.exe')
    Write-Host '  Jarvis relaunched. Verify the new Settings tab shows Audio & voice card with mic test meter.'
}

Write-Host ''
Write-Host 'Deploy complete.' -ForegroundColor Green
Stop-Transcript | Out-Null
