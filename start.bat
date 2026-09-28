@echo off
setlocal
title ServerConsole Launcher

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

exit /b %ERRORLEVEL%
