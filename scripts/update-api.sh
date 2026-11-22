#!/usr/bin/env bash
# Update the API on the Oracle VM. Run from Cloud Shell after git pull.
set -Eeuo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$HERE/.." && pwd)
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
echo "Updating API on $PUBLIC_IP"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" 'mkdir -p /tmp/coparents-install/server /tmp/coparents-install/db'
scp -i "$ADMIN_KEY" -o IdentitiesOnly=yes "$ROOT/server/api.py" "ubuntu@$PUBLIC_IP:/tmp/coparents-install/server/api.py"
scp -i "$ADMIN_KEY" -o IdentitiesOnly=yes "$ROOT/db/notes.sql" "$ROOT/db/accounts.sql" "$ROOT/db/receipts.sql" "ubuntu@$PUBLIC_IP:/tmp/coparents-install/db/"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
sudo install -m 644 -o coparents -g coparents /tmp/coparents-install/server/api.py /opt/coparents/api.py
sudo -u postgres psql -v ON_ERROR_STOP=1 -d coparents -f /tmp/coparents-install/db/notes.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d coparents -f /tmp/coparents-install/db/accounts.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d coparents -f /tmp/coparents-install/db/receipts.sql
# Site address and mail settings for sign-in links. See docs/accounts.md.
if [[ ! -f /etc/coparents/app.env ]]; then
  printf '%s\n' \
    '# Where the app lives. Sign-in links point here.' \
    'COPARENTS_APP_URL=https://coparent.lu' \
    '# Mail server for sign-in links. While these are empty, links go to the API log only.' \
    'COPARENTS_MAIL_FROM=' \
    'COPARENTS_SMTP_HOST=' \
    'COPARENTS_SMTP_PORT=587' \
    'COPARENTS_SMTP_USER=' \
    'COPARENTS_SMTP_PASSWORD=' | sudo tee /etc/coparents/app.env >/dev/null
  sudo chown root:coparents /etc/coparents/app.env
  sudo chmod 640 /etc/coparents/app.env
fi
# Server logs hold IP addresses. Keep them about 14 days, as the privacy notice says.
sudo install -d /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=14day\n' | sudo tee /etc/systemd/journald.conf.d/coparents-retention.conf >/dev/null
sudo systemctl restart systemd-journald
sudo install -d /etc/systemd/system/coparents-api.service.d
printf '[Service]\nEnvironmentFile=-/etc/coparents/app.env\n' | sudo tee /etc/systemd/system/coparents-api.service.d/app-env.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart coparents-api.service
sleep 1
curl -sf http://127.0.0.1:8787/api/health
echo
echo "Database tables and API updated."
REMOTE
