@echo off
title Reel Reposter - Status
cd /d "%~dp0.."
docker compose ps
echo.
pause
