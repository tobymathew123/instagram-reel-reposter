@echo off
title Reel Reposter - Preview Canva frame
cd /d "%~dp0.."
docker compose exec ffmpeg-api node tools/test-frame.js
echo.
pause
