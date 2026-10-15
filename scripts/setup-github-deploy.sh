#!/usr/bin/env bash
# Run once in OCI Cloud Shell. Never prints private-key contents.
set +x
set -Eeuo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WORK="$HOME/react-server-setup"
KEY="$WORK/github-actions-key"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]]
umask 077
[[ -f "$KEY" ]] || ssh-keygen -q -t rsa -b 4096 -N '' -C cloudmargin-github-actions -f "$KEY"
chmod 600 "$KEY"
ssh-keygen -y -f "$KEY" > "$KEY.pub"
[[ -f "$KEY.pub" ]] || ssh-keygen -y -f "$KEY" > "$KEY.pub"
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "ubuntu@$PUBLIC_IP")
# Stream the receiver, never any private key, into an administrative installation.
"${SSH[@]}" 'sudo install -m 755 /dev/stdin /usr/local/bin/cloudmargin-receive' < "$HERE/receive-deployment.py"
PUBLIC_KEY=$(base64 -w0 "$KEY.pub")
"${SSH[@]}" "sudo bash -s -- '$PUBLIC_KEY'" <<'REMOTE'
set -Eeuo pipefail
id cloudmargin-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash cloudmargin-deploy
install -d -o cloudmargin-deploy -g cloudmargin-deploy -m 700 /home/cloudmargin-deploy/.ssh
# Dedicated account: only its forced deployment command is allowed.
printf 'restrict,command="/usr/local/bin/cloudmargin-receive" %s\n' "$(printf '%s' "$1" | base64 -d)" > /home/cloudmargin-deploy/.ssh/authorized_keys
chown cloudmargin-deploy:cloudmargin-deploy /home/cloudmargin-deploy/.ssh/authorized_keys
chmod 600 /home/cloudmargin-deploy/.ssh/authorized_keys
install -d -o cloudmargin-deploy -g cloudmargin-deploy -m 755 /var/lib/cloudmargin-deploy /var/www/html/previews
chown -R cloudmargin-deploy:cloudmargin-deploy /var/www/html
REMOTE
# Retrieve the host public key through the existing trusted admin connection.
HOST_KEY=$("${SSH[@]}" 'cat /etc/ssh/ssh_host_rsa_key.pub')
printf '%s %s\n' "$PUBLIC_IP" "$HOST_KEY" > "$WORK/github-known-hosts"
chmod 600 "$WORK/github-known-hosts"
echo 'Dedicated deployment account configured.'
echo "Private key file (do not paste into chat): $KEY"
echo "Known-hosts file: $WORK/github-known-hosts"
export PATH="$HOME/.local/bin:$PATH"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh secret set DEPLOY_SSH_KEY --repo EuphoriaLux/react-web-server < "$KEY"
  gh secret set DEPLOY_KNOWN_HOSTS --repo EuphoriaLux/react-web-server < "$WORK/github-known-hosts"
  gh variable set DEPLOY_HOST --repo EuphoriaLux/react-web-server --body "$PUBLIC_IP"
  echo 'GitHub Actions secrets and deployment-host variable configured.'
else
  echo 'GitHub CLI is not authenticated. Install/authenticate gh, then rerun this script to upload secrets without printing them.'
fi
