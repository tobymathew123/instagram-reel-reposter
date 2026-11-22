#!/usr/bin/env bash
# Everyday commands for Mac & Linux. Run from the project folder, e.g.:
#   bash scripts/reposter.sh status
set -uo pipefail
cd "$(dirname "$0")/.."

case "${1:-help}" in
  setup|start|update) bash scripts/setup.sh ;;
  stop)          docker compose down && echo "Stopped. Start again with: bash scripts/setup.sh" ;;
  status)        docker compose ps ;;
  logs)          docker compose logs -f --tail=100 ;;
  meta-token)    docker compose exec ffmpeg-api node tools/meta-setup.js ;;
  test-frame)    docker compose exec ffmpeg-api node tools/test-frame.js ;;
  test-pipeline) shift; docker compose exec ffmpeg-api node tools/send-test-dm.js "$@" ;;
  *)
    cat <<'EOF'
Usage: bash scripts/reposter.sh <command>

  setup          start everything / apply .env changes (same as scripts/setup.sh)
  stop           stop everything
  status         show what is running
  logs           live logs (Ctrl+C to exit)
  meta-token     Meta helper: get never-expiring token + Instagram account ID
  test-frame     preview your Canva frame on sample videos
  test-pipeline  send a fake Reel DM through the whole workflow (needs DRY_RUN=true)
EOF
    ;;
esac
