# Install optional vision models from manifest
# Usage: .\ensure-vision-models.ps1 -ManifestPath <path> -SkipInstall
param(
  [string]$ManifestPath = "vision-model-manifest.json",
  [switch]$SkipInstall,
  [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ManifestPath)) {
  Write-Host "Vision model manifest not found: $ManifestPath" -ForegroundColor Yellow
  exit 0
}

try {
  $manifest = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
} catch {
  Write-Host "Failed to parse vision model manifest: $_" -ForegroundColor Yellow
  exit 0
}

$models = @($manifest.models | Where-Object { $_ })
if ($models.Count -eq 0) {
  Write-Host "No vision models defined in manifest." -ForegroundColor DarkGray
  exit 0
}

Write-Host "Vision Models Available:" -ForegroundColor Cyan
$models | ForEach-Object {
  Write-Host "  • $($_.name) ($($_.size_gb)GB) - $($_.description)" -ForegroundColor Gray
}

if ($ListOnly) {
  exit 0
}

if ($SkipInstall) {
  Write-Host "Skipping vision model installation (--skip-install used)." -ForegroundColor DarkGray
  exit 0
}

# Check if ollama is available
$ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaExe) {
  Write-Host "Note: Ollama not found. Vision models can be installed later via Settings → Models." -ForegroundColor Yellow
  exit 0
}

# Install vision models
Write-Host "Installing optional vision models…" -ForegroundColor Cyan
foreach ($model in $models) {
  Write-Host "  Pulling $($model.name)…" -ForegroundColor Gray
  try {
    & ollama pull "$($model.name)" 2>&1 | Out-Null
    Write-Host "  ✓ $($model.name) installed" -ForegroundColor Green
  } catch {
    Write-Host "  ⚠ Failed to install $($model.name): $_" -ForegroundColor Yellow
  }
}

Write-Host "Vision models ready (or will be installed on demand)." -ForegroundColor Green
