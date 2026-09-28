@echo off
setlocal EnableDelayedExpansion
title ServerConsole Local Reset
cd /d "%~dp0"

echo ============================================================
echo               SERVERCONSOLE LOCAL RESET WIZARD
echo ============================================================
echo.
echo WARNING: This action will perform the following operations:
echo.
echo   1. Stop all running ServerConsole services
echo   2. Delete local SQLite database (data\*.sqlite*)
echo   3. Clear temporary service log files (logs\*.log)
echo.
echo ALL REGISTERED SERVERS, CREDENTIALS, AND LOCAL ADMIN ACCOUNTS
echo WILL BE PERMANENTLY REMOVED FROM YOUR LOCAL MACHINE.
echo.
echo ============================================================
echo.

set /p CONFIRM="Type 'RESET' to confirm local data wipe (or press Enter to cancel): "

if /i not "!CONFIRM!"=="RESET" (
    echo.
    echo Reset operation canceled. No files were modified.
    echo.
    pause
    exit /b 0
)

echo.
echo [1/3] Stopping ServerConsole services...
call "%~dp0stop.bat"

echo.
echo [2/3] Removing local SQLite databases in "%~dp0data"...
if exist "%~dp0data" (
    del /f /q "%~dp0data\*.sqlite*" 2>nul
    del /f /q "%~dp0data\*.db*" 2>nul
)

echo [3/3] Clearing local log files in "%~dp0logs"...
if exist "%~dp0logs" (
    del /f /q "%~dp0logs\*.log" 2>nul
    del /f /q "%~dp0logs\pids.json" 2>nul
)

REM Ensure clean directories exist
if not exist "%~dp0data" mkdir "%~dp0data"
if not exist "%~dp0logs" mkdir "%~dp0logs"

echo.
echo ============================================================
echo Local development data has been successfully reset!
echo ============================================================
echo.

set /p RESTART="Would you like to start ServerConsole fresh now? (Y/n): "
if /i "!RESTART!"=="Y" (
    call "%~dp0start.bat"
) else if "!RESTART!"=="" (
    call "%~dp0start.bat"
) else (
    echo.
    echo Done. You can start ServerConsole anytime by running start.bat.
    pause
)
