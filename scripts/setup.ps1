# =====================================================================
#  Instagram Reel Auto-Reposter - setup / update / restart (Windows)
#
#  Easiest: double-click  windows\1-setup.bat
#  Safe to run again any time (e.g. after editing .env).
# =====================================================================
$ErrorActionPreference = 'Continue'  # we check $LASTEXITCODE ourselves (PS 5.1 + native stderr)
Set-Location (Split-Path -Parent $PSScriptRoot)

$WorkflowId = 'IgReelRepost2026'
function Say($m)  { Write-Host "==> $m" -ForegroundColor Green }
function Warn($m) { Write-Host "WARNING: $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

# ---------- 1. Docker present & running ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Die "Docker is not installed. Install Docker Desktop first (README step 2)."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Die "Docker Desktop is not running. Open Docker Desktop, wait until it says 'Engine running', then try again." }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Die "'docker compose' is missing. Update Docker Desktop." }

# ---------- 2. .env exists ----------
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Say "Created your settings file: .env"
  Write-Host "    Notepad will open it. Fill in at least section A (public address), save, close Notepad, and run setup again."
  Start-Process notepad.exe -ArgumentList (Resolve-Path .env).Path
  exit 0
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Read-EnvLines { return [System.IO.File]::ReadAllLines((Resolve-Path .env).Path) }
function Get-EnvValue($key) {
  $line = Read-EnvLines | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
  if ($null -eq $line) { return '' }
  return $line.Substring($key.Length + 1).Trim()
}
function Set-EnvValue($key, $val) {
  $lines = [System.Collections.Generic.List[string]](Read-EnvLines)
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$key=") { $lines[$i] = "$key=$val"; $found = $true }
  }
  if (-not $found) { $lines.Add("$key=$val") }
  [System.IO.File]::WriteAllLines((Resolve-Path .env).Path, $lines, $Utf8NoBom)
}
function New-Secret { return ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')).Substring(0, 48) }

# rewrite once to normalise encoding/line endings (Notepad may add a BOM)
[System.IO.File]::WriteAllLines((Resolve-Path .env).Path, (Read-EnvLines), $Utf8NoBom)

# ---------- 3. auto-fill secrets ----------
if (-not (Get-EnvValue 'META_VERIFY_TOKEN')) { Set-EnvValue 'META_VERIFY_TOKEN' ('verify_' + (New-Secret).Substring(0, 24)); Say 'Generated META_VERIFY_TOKEN' }
if (-not (Get-EnvValue 'FFMPEG_API_KEY'))    { Set-EnvValue 'FFMPEG_API_KEY' (New-Secret); Say 'Generated FFMPEG_API_KEY' }

# ---------- 4. validate ----------
$domain = Get-EnvValue 'PUBLIC_DOMAIN'
$clean = ($domain -replace '^https?://', '') -replace '/+$', ''
if ($clean -ne $domain) { Set-EnvValue 'PUBLIC_DOMAIN' $clean; $domain = $clean }
if (-not $domain) { Die 'PUBLIC_DOMAIN is empty in .env (README step 4).' }

$tunnel = Get-EnvValue 'COMPOSE_PROFILES'
switch ($tunnel) {
  'ngrok'      { if (-not (Get-EnvValue 'NGROK_AUTHTOKEN')) { Die 'COMPOSE_PROFILES=ngrok but NGROK_AUTHTOKEN is empty (README step 4).' } }
  'cloudflare' { if (-not (Get-EnvValue 'CLOUDFLARE_TUNNEL_TOKEN')) { Die 'COMPOSE_PROFILES=cloudflare but CLOUDFLARE_TUNNEL_TOKEN is empty (README step 4).' } }
  default      { Die "COMPOSE_PROFILES must be 'ngrok' or 'cloudflare' (found '$tunnel')." }
}

New-Item -ItemType Directory -Force branding | Out-Null
if (-not (Get-EnvValue 'CANVA_FRAME_PNG_URL') -and -not (Test-Path 'branding\frame.png')) {
  Warn 'No Canva frame yet. Save your PNG as branding\frame.png (README step 5).'
}
foreach ($k in 'META_PAGE_ACCESS_TOKEN', 'IG_BUSINESS_ACCOUNT_ID', 'GEMINI_API_KEY', 'ALLOWED_SENDER_IG_ID') {
  if (-not (Get-EnvValue $k)) { Warn "$k is still empty - fine for now, but needed before going live." }
}

# ---------- 5. start ----------
Say 'Starting (the first time this downloads ~1 GB and can take several minutes)...'
docker compose up -d --build --remove-orphans
if ($LASTEXITCODE -ne 0) { Die 'docker compose failed - see the messages above.' }

function Wait-N8n {
  Write-Host -NoNewline '    waiting for n8n'
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:5678/healthz
      if ($r.StatusCode -eq 200) { Write-Host ' ready.'; return }
    } catch { }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 2
  }
  Write-Host ''
  Die 'n8n did not start. Run: docker compose logs n8n'
}
Wait-N8n

# ---------- 6. import + activate workflow ----------
Say 'Importing the workflow into n8n...'
docker compose exec -T n8n n8n import:workflow --input=/workflows/ig_reel_reposter.json
if ($LASTEXITCODE -ne 0) { Die 'Workflow import failed - see the messages above.' }

Say 'Activating the workflow...'
$activated = $false
docker compose exec -T n8n n8n update:workflow --id=$WorkflowId --active=true *> $null
if ($LASTEXITCODE -eq 0) { $activated = $true } else {
  docker compose exec -T n8n n8n publish:workflow --id=$WorkflowId *> $null
  if ($LASTEXITCODE -eq 0) { $activated = $true }
}
docker compose restart n8n *> $null
Wait-N8n

# ---------- 7. summary ----------
$mode = if ((Get-EnvValue 'DRY_RUN') -eq 'true') { 'DRY RUN (test mode, nothing is posted)' } else { 'LIVE (Reels will be posted)' }
Write-Host ''
Write-Host '=================== ALL SET ===================' -ForegroundColor Cyan
Write-Host " n8n editor (this computer only):  http://localhost:5678"
Write-Host " Public check (open in browser):   https://$domain/healthz"
Write-Host ''
Write-Host ' For the Meta webhook settings (README step 8.6):'
Write-Host "   Callback URL:  https://$domain/webhook/ig-dm"
Write-Host "   Verify token:  $(Get-EnvValue 'META_VERIFY_TOKEN')"
Write-Host ''
Write-Host " Mode: $mode"
if (-not $activated) {
  Warn "Could not switch the workflow on automatically. In n8n, open 'Instagram Reel Auto-Reposter' and click the Active / Publish toggle (top right)."
}
Write-Host '===============================================' -ForegroundColor Cyan
