@echo off
chcp 65001 >nul
title Choyxona Pro
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
start "" http://localhost:3000
node --no-warnings server\index.js
pause
