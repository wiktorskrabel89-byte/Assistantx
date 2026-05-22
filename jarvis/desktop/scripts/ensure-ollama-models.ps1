$ErrorActionPreference = "Stop"

param(
  [string]$ManifestPath = (Join-Path $PSScriptRoot "ollama-model-manifest.json")
)

function Get-Sha256Hex {
  param([string]$Value)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-InstalledModelNames {
  $lines = @(ollama list 2>$null)
  if (-not $lines -or $lines.Count -eq 0) {
    return @()
  }
  return $lines |
    Select-Object -Skip 1 |
    ForEach-Object { ($_ -split '\s+')[0] } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { $_.Trim() } |
    Select-Object -Unique
}

function Test-ModelChecksum {
  param(
    [string]$ModelName,
    [string]$ExpectedChecksum
  )
  if ([string]::IsNullOrWhiteSpace($ExpectedChecksum)) {
    return $true
  }
  try {
    $modelDefinition = (ollama show $ModelName --modelfile 2>$null | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($modelDefinition)) {
      return $false
    }
    $actual = Get-Sha256Hex -Value $modelDefinition
    return $actual -eq $ExpectedChecksum.ToLowerInvariant()
  } catch {
    return $false
  }
}

if (-not (Test-Path $ManifestPath)) {
  throw "Model manifest not found: $ManifestPath"
}

try {
  $manifest = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
} catch {
  throw "Model manifest is invalid JSON: $ManifestPath"
}

$entries = @($manifest.models | Where-Object { $_ -and $_.name })
if ($entries.Count -eq 0) {
  throw "Model manifest has no models: $ManifestPath"
}

Write-Host "Ensuring Ollama models from manifest: $ManifestPath" -ForegroundColor Cyan
$installed = Get-InstalledModelNames
$missingOrInvalid = @()

foreach ($entry in $entries) {
  $name = [string]$entry.name
  $checksum = [string]$entry.modelfileSha256
  $isInstalled = $installed -contains $name
  $checksumValid = $isInstalled -and (Test-ModelChecksum -ModelName $name -ExpectedChecksum $checksum)

  if ($isInstalled -and $checksumValid) {
    Write-Host "Model ready: $name" -ForegroundColor Green
    continue
  }

  if ($isInstalled -and -not $checksumValid -and -not [string]::IsNullOrWhiteSpace($checksum)) {
    Write-Host "Model checksum mismatch, re-pulling: $name" -ForegroundColor Yellow
  } else {
    Write-Host "Pulling missing model: $name" -ForegroundColor Yellow
  }

  try {
    ollama pull $name | Out-Null
  } catch {
    $missingOrInvalid += $name
    Write-Host "Failed to pull model: $name" -ForegroundColor Red
  }
}

if ($missingOrInvalid.Count -gt 0) {
  throw "One or more Ollama models failed to install: $($missingOrInvalid -join ', ')"
}

Write-Host "Ollama models are ready." -ForegroundColor Green
