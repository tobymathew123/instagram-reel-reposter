#!/usr/bin/env bash
# =====================================================================
#  Instagram Reel Auto-Reposter - setup / update / restart (Mac & Linux)
#
#  Run from the project folder:   bash scripts/setup.sh
#  Safe to run again any time (e.g. after editing .env).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

WORKFLOW_ID="IgReelRepost2026"
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'
say()  { printf "${G}==>${N} %s\n" "$*"; }
warn() { printf "${Y}WARNING:${N} %s\n" "$*"; }
die()  { printf "${R}ERROR:${N} %s\n" "$*" >&2; exit 1; }

# ---------- 1. Docker present & running ----------
command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Desktop first (README step 2)."
docker info >/dev/null 2>&1 || die "Docker Desktop is not running. Open Docker Desktop, wait until it says 'running', then try again."
docker compose version >/dev/null 2>&1 || die "'docker compose' is missing. Update Docker Desktop."

# ---------- 2. .env exists ----------
if [ ! -f .env ]; then
  cp .env.example .env
  say "Created your settings file: .env"
  echo "    Open it, fill in at least section A (public address), save, and run this script again."
  if command -v open >/dev/null 2>&1; then open -e .env 2>/dev/null || true; fi
  exit 0
fi
# remove Windows line endings if the file was edited on Windows
if grep -q $'\r' .env; then tr -d '\r' < .env > .env.tmp && mv .env.tmp .env; fi

get_env() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }
set_env() {
  local key="$1" val="$2"
  if grep -qE "^$key=" .env; then
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
gen_secret() { (openssl rand -hex 24 2>/dev/null) || (head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'); }

# ---------- 3. auto-fill secrets ----------
[ -n "$(get_env META_VERIFY_TOKEN)" ] || { set_env META_VERIFY_TOKEN "verify_$(gen_secret | cut -c1-24)"; say "Generated META_VERIFY_TOKEN"; }
[ -n "$(get_env FFMPEG_API_KEY)" ]    || { set_env FFMPEG_API_KEY "$(gen_secret)"; say "Generated FFMPEG_API_KEY"; }

# ---------- 4. validate ----------
DOMAIN="$(get_env PUBLIC_DOMAIN)"
CLEAN="$(printf '%s' "$DOMAIN" | sed -E 's#^https?://##; s#/+$##')"
[ "$CLEAN" != "$DOMAIN" ] && { set_env PUBLIC_DOMAIN "$CLEAN"; DOMAIN="$CLEAN"; }
[ -n "$DOMAIN" ] || die "PUBLIC_DOMAIN is empty in .env (README step 4)."

PROFILE="$(get_env COMPOSE_PROFILES)"
case "$PROFILE" in
  ngrok)      [ -n "$(get_env NGROK_AUTHTOKEN)" ] || die "COMPOSE_PROFILES=ngrok but NGROK_AUTHTOKEN is empty (README step 4)." ;;
  cloudflare) [ -n "$(get_env CLOUDFLARE_TUNNEL_TOKEN)" ] || die "COMPOSE_PROFILES=cloudflare but CLOUDFLARE_TUNNEL_TOKEN is empty (README step 4)." ;;
  *) die "COMPOSE_PROFILES must be 'ngrok' or 'cloudflare' (found '$PROFILE')." ;;
esac

mkdir -p branding
if [ -z "$(get_env CANVA_FRAME_PNG_URL)" ] && [ ! -f branding/frame.png ]; then
  warn "No Canva frame yet. Save your PNG as branding/frame.png (README step 5)."
fi
for k in META_PAGE_ACCESS_TOKEN IG_BUSINESS_ACCOUNT_ID GEMINI_API_KEY ALLOWED_SENDER_IG_ID; do
  [ -n "$(get_env "$k")" ] || warn "$k is still empty - fine for now, but needed before going live."
done

# ---------- 5. start ----------
say "Starting (the first time this downloads ~1 GB and can take several minutes)..."
docker compose up -d --build --remove-orphans

wait_n8n() {
  printf "    waiting for n8n"
  for _ in $(seq 1 90); do
    if curl -fsS http://localhost:5678/healthz >/dev/null 2>&1; then echo " ready."; return 0; fi
    printf "."; sleep 2
  done
  echo; die "n8n did not start. Run: docker compose logs n8n"
}
wait_n8n

# ---------- 6. import + activate workflow ----------
say "Importing the workflow into n8n..."
docker compose exec -T n8n n8n import:workflow --input=/workflows/ig_reel_reposter.json

say "Activating the workflow..."
if docker compose exec -T n8n n8n update:workflow --id="$WORKFLOW_ID" --active=true >/dev/null 2>&1 \
  || docker compose exec -T n8n n8n publish:workflow --id="$WORKFLOW_ID" >/dev/null 2>&1; then
  ACTIVATED=1
else
  ACTIVATED=0
fi
docker compose restart n8n >/dev/null
wait_n8n

# ---------- 7. summary ----------
echo
printf "${B}=================== ALL SET ===================${N}\n"
echo " n8n editor (this computer only):  http://localhost:5678"
echo " Public check (open in browser):   https://$DOMAIN/healthz"
echo
echo " For the Meta webhook settings (README step 8.6):"
echo "   Callback URL:  https://$DOMAIN/webhook/ig-dm"
echo "   Verify token:  $(get_env META_VERIFY_TOKEN)"
echo
echo " Mode: $( [ "$(get_env DRY_RUN)" = "true" ] && echo 'DRY RUN (test mode, nothing is posted)' || echo 'LIVE (Reels will be posted)')"
if [ "$ACTIVATED" != "1" ]; then
  warn "Could not switch the workflow on automatically. In n8n, open 'Instagram Reel Auto-Reposter' and click the Active / Publish toggle (top right)."
fi
printf "${B}===============================================${N}\n"
