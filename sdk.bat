@echo off
rem Starts the dev server and opens the T&T SDK (the map editor) in the browser.
rem (The dev server is also what lets the SDK publish maps into the game.)
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
node node_modules\vite\bin\vite.js --open /sdk.html
pause
