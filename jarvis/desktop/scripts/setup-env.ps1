Write-Host "Starting AssistantX local AI environment setup..." -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $PSScriptRoot "ollama-model-manifest.json"
$desktopRoot = Split-Path -Path $PSScriptRoot -Parent
$repoRoot = Split-Path -Path (Split-Path -Path $desktopRoot -Parent) -Parent
$aiAgentPath = Join-Path $repoRoot "ai-agent"
$ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue

function Test-OllamaReady {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Resolve-PythonExecutable {
  $candidates = @(
    (Join-Path $desktopRoot "python\python.exe"),
    (Join-Path $aiAgentPath "venv\Scripts\python.exe"),
    "python.exe",
    "python"
  )

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if ($candidate -like "*.exe" -or $candidate -like "python*") {
      try {
        if ($candidate -match '[\\/]') {
          if (Test-Path $candidate) { return $candidate }
        } else {
          $resolved = Get-Command $candidate -ErrorAction SilentlyContinue
          if ($resolved) { return $resolved.Source }
        }
      } catch {
        continue
      }
    }
  }

  throw "Python runtime not found. Expected embedded runtime or python.exe in PATH."
}

function Ensure-VoiceAssets {
  param(
    [string]$Language = "en",
    [string]$SttModel = "base"
  )

  $pythonExe = Resolve-PythonExecutable
  if (-not (Test-Path $aiAgentPath)) {
    throw "AI agent directory not found: $aiAgentPath"
  }

  Write-Host "Ensuring Whisper + Kokoro voice assets..." -ForegroundColor Cyan
  $bootstrapCode = @'
import os
import sys

repo_root = os.environ["JARVIS_AI_AGENT_PATH"]
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from speech.model_downloader import ensure_whisper_model, ensure_kokoro_model, ensure_piper_model

language = os.environ.get("JARVIS_LANGUAGE", "en").strip().lower()[:2] or "en"
stt_model = os.environ.get("JARVIS_STT_MODEL", "base").strip().lower() or "base"

ensure_whisper_model(stt_model)
ensure_kokoro_model()
if language == "pl":
    ensure_piper_model(language)
'@

  $env:JARVIS_AI_AGENT_PATH = $aiAgentPath
  $env:JARVIS_LANGUAGE = $Language
  $env:JARVIS_STT_MODEL = $SttModel
  & $pythonExe -c $bootstrapCode
  if ($LASTEXITCODE -ne 0) {
    throw "Voice asset bootstrap failed with exit code $LASTEXITCODE"
  }
  Write-Host "Local Whisper/Kokoro assets are ready." -ForegroundColor Green
}

if (-not (Test-Path $manifestPath)) {
  throw "Missing model manifest: $manifestPath"
}

if (-not $ollamaExe) {
  Write-Host "Ollama not found. Downloading installer..." -ForegroundColor Yellow
  $installerUrl = "https://ollama.com/download/OllamaSetup.exe"
  $installerPath = Join-Path $env:TEMP "OllamaSetup.exe"
  Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
  Write-Host "Installing Ollama..." -ForegroundColor Yellow
  Start-Process -FilePath $installerPath -ArgumentList "/silent" -Wait
}
else {
  Write-Host "Ollama already installed." -ForegroundColor Green
}

$ollamaReady = Test-OllamaReady
if (-not $ollamaReady) {
  Write-Host "Starting Ollama service..." -ForegroundColor Yellow
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
  Start-Sleep -Seconds 6
  $ollamaReady = Test-OllamaReady
}

if (-not $ollamaReady) {
  throw "Ollama service did not become healthy at http://127.0.0.1:11434"
}

Write-Host "Ollama service is healthy." -ForegroundColor Green

Write-Host "Ensuring required local models from manifest..." -ForegroundColor Cyan
& "$PSScriptRoot\ensure-ollama-models.ps1" -ManifestPath $manifestPath

$language = [string]($env:JARVIS_LANGUAGE)
if ([string]::IsNullOrWhiteSpace($language)) { $language = "en" }
$sttModel = [string]($env:JARVIS_STT_MODEL)
if ([string]::IsNullOrWhiteSpace($sttModel)) { $sttModel = "base" }
Ensure-VoiceAssets -Language $language -SttModel $sttModel

try {
  $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
  $required = @($manifest.models | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $installedLines = @(ollama list 2>$null)
  $installed = $installedLines | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] } | Where-Object { $_ } | Select-Object -Unique
  $missing = @($required | Where-Object { $installed -notcontains $_ })
  if ($missing.Count -gt 0) {
    throw "Ollama is running but required models are still missing: $($missing -join ', ')"
  }
  Write-Host "Manifest validation passed. Required models are available." -ForegroundColor Green
} catch {
  throw "Local AI bootstrap validation failed: $($_.Exception.Message)"
}

Write-Host "AssistantX local AI setup completed." -ForegroundColor Green
