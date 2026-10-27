@echo off
chcp 65001 >nul
title FLOWI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   XATO: Node.js o'rnatilmagan yoki topilmadi.
  echo   1^) https://nodejs.org saytidan "LTS" versiyani yuklab o'rnating.
  echo   2^) Kompyuterni qayta yoqing va shu faylni yana ikki marta bosing.
  echo.
  pause
  exit /b 1
)
rem Open the browser 2 seconds later, when the server is already listening.
rem Chrome/Edge with --kiosk-printing prints checks straight to the printer, without the print window.
set "BROWSER="
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe") do if not defined BROWSER if exist %%B set "BROWSER=%%~B"
if defined BROWSER (
  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" "%BROWSER%" --kiosk-printing --no-first-run --user-data-dir="%LOCALAPPDATA%\FLOWI-kassa" --app=http://localhost:3000"
) else (
  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
)
node --no-warnings server\index.js
pause
