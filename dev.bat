@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo => Wulon's MCSS
echo.
echo [1] Dev - Vite + Electron
echo [2] Build
echo [3] Preview
echo.
set /p mode="Select (1/2/3, default 1): "
if "%mode%"=="3" goto preview
if "%mode%"=="2" goto build
if "%mode%"=="" goto dev

:dev
pnpm dev
goto end

:build
pnpm build
goto end

:preview
pnpm preview
goto end

:end
pause