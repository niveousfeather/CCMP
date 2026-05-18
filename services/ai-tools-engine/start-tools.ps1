$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$engineStart = Join-Path $root "services\ai-tools-engine\start.py"
$checkDeps = Join-Path $root "services\ai-tools-engine\scripts\check_deps.py"
$checkPort = Join-Path $root "services\ai-tools-engine\scripts\check_port.py"

if (-not (Test-Path -LiteralPath $engineStart)) {
  Write-Error "services\ai-tools-engine\start.py was not found. Run this script from the NexusAI project root."
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  Write-Error "Python was not found on PATH."
}

python $checkDeps
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "[ERROR] Python dependencies are incomplete."
  Write-Host "Install them with:"
  Write-Host "  python -m pip install -r .\services\ai-tools-engine\requirements.txt"
  exit 1
}

python $checkPort
if ($LASTEXITCODE -eq 2) {
  Write-Host ""
  Write-Host "[ERROR] Port 8010 is occupied by another process."
  Write-Host "Inspect it with:"
  Write-Host "  netstat -ano | findstr :8010"
  Write-Host "Stop it manually only if safe:"
  Write-Host "  taskkill /PID <pid> /F"
  exit 1
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8010/health" -TimeoutSec 2
  if ($health.service -eq "nexusai-tools-engine") {
    Write-Host "Tools Engine is already running on 127.0.0.1:8010."
    exit 0
  }
} catch {
  # Port is free or not serving HTTP. Continue to start.
}

$env:AI_TOOLS_ENGINE_HOST = "127.0.0.1"
$env:AI_TOOLS_ENGINE_PORT = "8010"
python $engineStart
