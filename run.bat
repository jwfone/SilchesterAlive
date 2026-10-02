@echo off
REM Silchester (Calleva Atrebatum) - double-click to run the walkable 3D town.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 18 or newer from https://nodejs.org/ then run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies - first run only, this takes a minute...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting dev server - your browser will open automatically, then click to walk.
echo Press Ctrl+C in this window to stop.
call npm run dev -- --open --port 5173
pause
