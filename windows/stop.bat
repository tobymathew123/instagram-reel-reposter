@echo off
title Reel Reposter - Stop
cd /d "%~dp0.."
docker compose down
echo.
pause
