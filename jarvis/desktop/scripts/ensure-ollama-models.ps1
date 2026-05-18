$ErrorActionPreference = "Stop"

$requiredModels = @(
  "gemma4:e4b",
  "qwen2.5-coder:14b"
)

foreach ($model in $requiredModels) {
  Write-Host "Pulling Ollama model: $model" -ForegroundColor Cyan
  ollama pull $model
}

Write-Host "Ollama models are ready." -ForegroundColor Green

