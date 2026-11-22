@echo off
title Reel Reposter - Meta token helper
cd /d "%~dp0.."
docker compose exec ffmpeg-api node tools/meta-setup.js
echo.
pause
