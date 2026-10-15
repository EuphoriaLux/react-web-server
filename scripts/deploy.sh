#!/usr/bin/env bash
# Run in OCI Cloud Shell. Builds on the Ubuntu server; no local Node install needed.
set +x
set -Eeuo pipefail
KEY="$HOME/react-server-setup/server-key"
STATE="$HOME/react-server-setup/state.env"
[[ -f "$KEY" ]] || { echo 'Missing original server SSH key.' >&2; exit 1; }
if [[ -z "${PUBLIC_IP:-}" ]]; then
  [[ -f "$STATE" ]] || { echo 'Missing provisioning state.' >&2; exit 1; }
  PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$STATE" | tail -n 1)
fi
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Missing/invalid public IP. Rerun provisioning to refresh state.' >&2; exit 1; }
ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "ubuntu@$PUBLIC_IP" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
mkdir -p "$HOME/.cache/cloudmargin"
exec 9>"$HOME/.cache/cloudmargin/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
command -v git >/dev/null || { sudo apt-get update; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git; }
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  [[ ! -e "$NVM_DIR" ]] || { echo 'Existing incomplete NVM installation. Repair it first.' >&2; exit 1; }
  git clone --depth 1 --branch v0.40.8 https://github.com/nvm-sh/nvm.git "$NVM_DIR"
fi
set +u
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
set -u
APP="$HOME/cloudmargin-app"
if [[ ! -d "$APP/.git" ]]; then
  [[ ! -e "$APP" ]] || { echo 'Application path already exists without Git.' >&2; exit 1; }
  git clone https://github.com/EuphoriaLux/react-web-server.git "$APP"
fi
cd "$APP"
[[ "$(git remote get-url origin)" == 'https://github.com/EuphoriaLux/react-web-server.git' ]] || { echo 'Unexpected repository origin.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Deployment checkout has local changes; refusing to overwrite.' >&2; exit 1; }
git checkout main
git pull --ff-only origin main
npm ci --no-audit --no-fund
npm test
npm run build
# Copy versioned assets first, then atomically replace the entry point.
# Keep older assets so already-open browser tabs continue to work.
sudo mkdir -p /var/www/html /var/backups/cloudmargin
STAMP=$(date -u +%Y%m%dT%H%M%S)-$$
sudo tar -czf "/var/backups/cloudmargin/site-$STAMP.tgz" -C /var/www/html .
sudo cp -R dist/assets /var/www/html/
sudo chmod -R a+rX /var/www/html/assets
sudo install -m 644 dist/index.html /var/www/html/.index-cloudmargin-new
sudo mv /var/www/html/.index-cloudmargin-new /var/www/html/index.html
sudo nginx -t
sudo systemctl reload nginx
curl --max-time 15 -fsS http://localhost/ | grep -q 'CloudMargin'
printf '\nCloudMargin deployed at commit %s\n' "$(git rev-parse --short HEAD)"
printf 'Previous site backup: /var/backups/cloudmargin/site-%s.tgz\n' "$STAMP"
REMOTE
curl --connect-timeout 10 --max-time 20 -fsS "http://$PUBLIC_IP/" | grep -q 'CloudMargin'
printf '\nDemo website verified: http://%s\n' "$PUBLIC_IP"
