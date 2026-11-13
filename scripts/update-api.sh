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
scp -i "$ADMIN_KEY" -o IdentitiesOnly=yes "$ROOT/db/notes.sql" "ubuntu@$PUBLIC_IP:/tmp/coparents-install/db/notes.sql"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
sudo install -m 644 -o coparents -g coparents /tmp/coparents-install/server/api.py /opt/coparents/api.py
sudo -u postgres psql -v ON_ERROR_STOP=1 -d coparents -f /tmp/coparents-install/db/notes.sql
sudo systemctl restart coparents-api.service
sleep 1
curl -sf http://127.0.0.1:8787/api/health
echo
echo "Notes table and API updated."
REMOTE
