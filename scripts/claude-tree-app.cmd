@echo off
REM Launcher Claude Tree cho Windows - double-click de chay.
setlocal
cd /d "%~dp0.."
if "%PORT%"=="" set PORT=4799
set URL=http://localhost:%PORT%

REM 1. Server chua chay -> khoi dong (cua so rieng, minimized)
curl -fsS %URL%/ >nul 2>&1
if not errorlevel 1 goto open
if not exist "web\dist\index.html" call npm run setup
start "Claude Tree Server" /min cmd /c "node server\index.js"
:wait
timeout /t 1 /nobreak >nul
curl -fsS %URL%/ >nul 2>&1
if errorlevel 1 goto wait

:open
REM 2. Mo dang app (cua so rieng) - tim Chrome o cac vi tri pho bien
set PROFILE=%USERPROFILE%\.config\claude-tree-app
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
if defined CHROME (
  start "" "%CHROME%" --app=%URL% --user-data-dir="%PROFILE%" --class=ClaudeTree --no-first-run
) else (
  start "" %URL%
)
endlocal
