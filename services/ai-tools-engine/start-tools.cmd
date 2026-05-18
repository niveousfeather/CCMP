@echo off
setlocal

set "ROOT=%CD%"
set "ENGINE_START=%ROOT%\services\ai-tools-engine\start.py"
set "CHECK_DEPS=%ROOT%\services\ai-tools-engine\scripts\check_deps.py"
set "CHECK_PORT=%ROOT%\services\ai-tools-engine\scripts\check_port.py"

if not exist "%ENGINE_START%" (
  echo [ERROR] services\ai-tools-engine\start.py was not found.
  echo Run this script from the NexusAI project root.
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found on PATH.
  exit /b 1
)

python "%CHECK_DEPS%"
if errorlevel 1 (
  echo.
  echo [ERROR] Python dependencies are incomplete.
  echo Install them with:
  echo   python -m pip install -r .\services\ai-tools-engine\requirements.txt
  exit /b 1
)

python "%CHECK_PORT%" > "%TEMP%\nexusai-tools-port-check.txt"
type "%TEMP%\nexusai-tools-port-check.txt"
if errorlevel 2 (
  echo.
  echo [ERROR] Port 8010 is occupied by another process.
  echo Inspect it with:
  echo   netstat -ano ^| findstr :8010
  echo Stop it manually only if safe:
  echo   taskkill /PID ^<pid^> /F
  exit /b 1
)
findstr /C:"Existing service: nexusai-tools-engine" "%TEMP%\nexusai-tools-port-check.txt" >nul 2>nul
if not errorlevel 1 (
  echo Tools Engine is already running on 127.0.0.1:8010.
  exit /b 0
)

set "AI_TOOLS_ENGINE_HOST=127.0.0.1"
set "AI_TOOLS_ENGINE_PORT=8010"
python "%ENGINE_START%"
