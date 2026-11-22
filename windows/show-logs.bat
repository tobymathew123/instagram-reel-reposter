@echo off
title Reel Reposter - Logs (close window to exit)
cd /d "%~dp0.."
docker compose logs -f --tail=100
echo.
pause
