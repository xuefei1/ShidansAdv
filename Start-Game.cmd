@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  set "GAME_NODE=node"
) else (
  set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%GAME_NODE%" if not "%GAME_NODE%"=="node" (
  echo Install Node.js 22 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)
"%GAME_NODE%" scripts\serve.mjs --open
pause
