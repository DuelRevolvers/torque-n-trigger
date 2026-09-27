@echo off
rem Starts the Torque & Trigger dev server and opens the game in the browser.
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js is required: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing dependencies...
  call npm install || (pause & exit /b 1)
)

rem Vite is called through node directly: the "&" in this folder name breaks npm's shims.
node node_modules\vite\bin\vite.js --open
pause
