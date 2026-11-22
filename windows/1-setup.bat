@echo off
title Reel Reposter - Setup
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup.ps1"
echo.
pause
