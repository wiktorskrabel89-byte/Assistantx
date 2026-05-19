Write-Host "Starting AssistantX local AI environment setup..." -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $PSScriptRoot "ollama-model-manifest.json"
$ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue

function Test-OllamaReady {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
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
