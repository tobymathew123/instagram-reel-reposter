@echo off
title Reel Reposter - Dry-run test
cd /d "%~dp0.."
docker compose exec ffmpeg-api node tools/send-test-dm.js
echo.
pause
