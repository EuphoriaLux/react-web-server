#!/usr/bin/env bash
# Run once in OCI Cloud Shell, from the repository folder, after setup-github-deploy.sh.
# Lets GitHub Actions update the API when a merge to main changes server/api.py or db/.
# Never prints private-key contents.
set +x
set -Eeuo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$HERE/.." && pwd)
REPO=EuphoriaLux/react-web-server
ENVIRONMENT=api-production
WORK="$HOME/react-server-setup"
KEY="$WORK/github-api-key"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}
export PATH="$HOME/.local/bin:$PATH"
if ! command -v gh >/dev/null || ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is missing or signed out. Run: bash scripts/install-gh.sh, then gh auth login --hostname github.com --git-protocol https --web" >&2
  exit 1
fi

umask 077
# A key of its own, separate from the website deploy key.
[[ -f "$KEY" ]] || ssh-keygen -q -t rsa -b 4096 -N '' -C coparents-github-api-deploy -f "$KEY"
chmod 600 "$KEY"
ssh-keygen -y -f "$KEY" > "$KEY.pub"
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "ubuntu@$PUBLIC_IP")

echo "Installing the API updater on $PUBLIC_IP"
"${SSH[@]}" 'sudo install -m 755 -o root -g root /dev/stdin /usr/local/bin/coparents-api-update' < "$HERE/coparents-api-update"
PUBLIC_KEY=$(base64 -w0 "$KEY.pub")
"${SSH[@]}" "sudo bash -s -- '$PUBLIC_KEY'" <<'REMOTE'
set -Eeuo pipefail
id coparents-api-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash coparents-api-deploy
install -d -o coparents-api-deploy -g coparents-api-deploy -m 700 /home/coparents-api-deploy/.ssh
# The key can only run the updater: no shell, forwarding or terminal.
printf 'restrict,command="sudo -n /usr/local/bin/coparents-api-update" %s\n' "$(printf '%s' "$1" | base64 -d)" \
  > /home/coparents-api-deploy/.ssh/authorized_keys
chown coparents-api-deploy:coparents-api-deploy /home/coparents-api-deploy/.ssh/authorized_keys
chmod 600 /home/coparents-api-deploy/.ssh/authorized_keys
# sudo for exactly this file, with no arguments ("").
printf 'coparents-api-deploy ALL=(root) NOPASSWD: /usr/local/bin/coparents-api-update ""\n' > /tmp/coparents-api-deploy.sudoers
visudo -cf /tmp/coparents-api-deploy.sudoers >/dev/null
install -m 440 -o root -g root /tmp/coparents-api-deploy.sudoers /etc/sudoers.d/coparents-api-deploy
rm -f /tmp/coparents-api-deploy.sudoers
REMOTE

HOST_KEY=$("${SSH[@]}" 'cat /etc/ssh/ssh_host_rsa_key.pub')
printf '%s %s\n' "$PUBLIC_IP" "$HOST_KEY" > "$WORK/github-known-hosts"
chmod 600 "$WORK/github-known-hosts"

echo "Checking the new key with a real API update from this folder"
(cd "$ROOT" && tar -czf - server/api.py db/*.sql) \
  | ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
      -o UserKnownHostsFile="$WORK/github-known-hosts" "coparents-api-deploy@$PUBLIC_IP"

echo "Saving the key in GitHub, usable only by jobs on the main branch"
gh api -X PUT "repos/$REPO/environments/$ENVIRONMENT" \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true' >/dev/null
gh api "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main \
  || gh api -X POST "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" -f name=main -f type=branch >/dev/null
gh secret set API_DEPLOY_SSH_KEY --repo "$REPO" --env "$ENVIRONMENT" < "$KEY"
gh secret set API_DEPLOY_KNOWN_HOSTS --repo "$REPO" --env "$ENVIRONMENT" < "$WORK/github-known-hosts"
gh variable set DEPLOY_HOST --repo "$REPO" --body "$PUBLIC_IP"
echo "Done. Merges to main that change server/api.py or db/ now update the API."
