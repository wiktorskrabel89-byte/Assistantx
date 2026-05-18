Write-Host "Starting AssistantX local AI environment setup..." -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue

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

$ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaProcess) {
  Write-Host "Starting Ollama service..." -ForegroundColor Yellow
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
  Start-Sleep -Seconds 5
}

Write-Host "Ensuring required local models..." -ForegroundColor Cyan
& "$PSScriptRoot\ensure-ollama-models.ps1"

Write-Host "AssistantX local AI setup completed." -ForegroundColor Green

