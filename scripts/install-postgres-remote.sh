#!/usr/bin/env bash
# Run from Oracle Cloud Shell. Uses the admin key from the original setup.
# Copies the installer to the VM and runs it. Does not print the database password.
set -Eeuo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$HERE/.." && pwd)
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP in $WORK/state.env." >&2
  echo "Run this in the Cloud Shell that originally set up the server." >&2
  exit 1
}
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
echo "Installing Postgres on $PUBLIC_IP"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" 'rm -rf /tmp/coparents-install && mkdir -p /tmp/coparents-install/db /tmp/coparents-install/server /tmp/coparents-install/scripts'
scp -i "$ADMIN_KEY" -o IdentitiesOnly=yes \
  "$ROOT/db/schema.sql" "ubuntu@$PUBLIC_IP:/tmp/coparents-install/db/schema.sql"
scp -i "$ADMIN_KEY" -o IdentitiesOnly=yes \
  "$ROOT/server/api.py" "ubuntu@$PUBLIC_IP:/tmp/coparents-install/server/api.py"
scp -i "$ADMIN_KEY" -o IdentitiesOnly=yes \
  "$HERE/install-postgres.sh" "ubuntu@$PUBLIC_IP:/tmp/coparents-install/scripts/install-postgres.sh"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" 'bash /tmp/coparents-install/scripts/install-postgres.sh'
