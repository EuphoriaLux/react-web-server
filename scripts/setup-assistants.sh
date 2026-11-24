#!/usr/bin/env bash
# One-time step for AI assistants (Claude, ChatGPT, ...): lets them find the
# CoParents sign-in. Assistants look for it at https://coparent.lu/.well-known/oauth-...,
# outside /api/, so nginx must pass those two addresses to the API too.
# Run from Oracle Cloud Shell, in the folder of this repository:
#
#   bash scripts/setup-assistants.sh
#
# Safe to run again. Keeps a copy of the nginx snippet and puts it back if nginx
# refuses the change. See docs/assistants.md.
set -Eeuo pipefail
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" 2>/dev/null | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}

REMOTE=$(cat <<'REMOTE'
set -Eeuo pipefail
SNIP=/etc/nginx/snippets/coparents-api.conf
sudo test -f "$SNIP" || { echo "No $SNIP on the server. Is the API installed?" >&2; exit 1; }
if sudo grep -q "/.well-known/oauth-" "$SNIP"; then
  echo "nginx already passes the assistant sign-in addresses to the API."
else
  sudo cp -a "$SNIP" "$SNIP.before-assistants"
  sudo tee -a "$SNIP" >/dev/null <<'NGINX'
# AI assistants find the OAuth sign-in here (RFC 8414 and RFC 9728). Added by scripts/setup-assistants.sh.
location ^~ /.well-known/oauth- {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
NGINX
  if ! sudo nginx -t 2>/dev/null; then
    sudo cp -a "$SNIP.before-assistants" "$SNIP"
    echo "nginx refused the change, so nothing was changed." >&2
    exit 1
  fi
  sudo systemctl reload nginx
  echo "nginx now passes the assistant sign-in addresses to the API."
fi
REMOTE
)
ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "ubuntu@$PUBLIC_IP" "$REMOTE"

# Checked from outside, the way an assistant sees it.
DOMAIN="${COPARENTS_DOMAIN:-coparent.lu}"
for path in /.well-known/oauth-authorization-server /.well-known/oauth-protected-resource/api/mcp; do
  if curl -sf --max-time 15 "https://$DOMAIN$path" | grep -q '"'; then
    echo "OK   https://$DOMAIN$path"
  else
    echo "FAIL https://$DOMAIN$path (has the new API been deployed? Merge the pull request first.)" >&2
    exit 1
  fi
done
echo "Done. Add https://$DOMAIN/api/mcp as a custom connector in your assistant."
