#!/usr/bin/env bash
# Run once in OCI Cloud Shell (the one that set up the server), from the repository folder.
# Creates a limited user `claude` on the VM so Claude cloud sessions can SSH in to read
# logs and check the server. `claude` gets no sudo. It can read the system journal and
# /var/log (groups systemd-journal and adm), nothing more.
#
#   bash scripts/setup-claude-ssh.sh                  # uses ~/claude_oracle and ~/claude_oracle.pub
#   bash scripts/setup-claude-ssh.sh ~/other_key      # another key pair (private key path)
#
# Writes the values for the Claude cloud environment to ~/claude-env.txt (mode 600).
# Never prints private-key contents. Run again any time to replace the key.
set +x
set -Eeuo pipefail
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
CLAUDE_KEY="${1:-$HOME/claude_oracle}"
OUT="$HOME/claude-env.txt"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" 2>/dev/null | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}
[[ -f "$CLAUDE_KEY" ]] || {
  echo "No private key at $CLAUDE_KEY. Make one with: ssh-keygen -t ecdsa -b 521 -N '' -C claude-cloud -f ~/claude_oracle" >&2
  exit 1
}

umask 077
# Rebuild the public key from the private key, so the two always match.
PUB=$(ssh-keygen -y -f "$CLAUDE_KEY" | awk '{print $1, $2}')
[[ "$PUB" =~ ^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa)\ [A-Za-z0-9+/=]+$ ]] || {
  echo "Could not read a public key from $CLAUDE_KEY." >&2
  exit 1
}
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "ubuntu@$PUBLIC_IP")

echo "Creating user claude on $PUBLIC_IP (no sudo)"
"${SSH[@]}" "sudo bash -s -- '$(printf '%s claude-cloud' "$PUB" | base64 -w0)'" <<'REMOTE'
set -Eeuo pipefail
id claude >/dev/null 2>&1 || useradd --create-home --shell /bin/bash claude
# Read-only log access. No sudo group, no sudoers file.
usermod -aG systemd-journal,adm claude
gpasswd -d claude sudo >/dev/null 2>&1 || true
rm -f /etc/sudoers.d/claude
install -d -o claude -g claude -m 700 /home/claude/.ssh
# A shell is allowed; tunnels and agent/X11 forwarding are not.
printf 'no-port-forwarding,no-agent-forwarding,no-X11-forwarding %s\n' "$(printf '%s' "$1" | base64 -d)" \
  > /home/claude/.ssh/authorized_keys
chown claude:claude /home/claude/.ssh/authorized_keys
chmod 600 /home/claude/.ssh/authorized_keys
if sudo -l -U claude 2>/dev/null | grep -q 'may run'; then
  echo "claude can still use sudo. Check /etc/sudoers and /etc/sudoers.d." >&2
  exit 1
fi
echo "User claude is ready, without sudo."
REMOTE

# All of the server's host keys, so any client finds one it accepts.
KNOWN=$("${SSH[@]}" 'cat /etc/ssh/ssh_host_*_key.pub' | awk -v ip="$PUBLIC_IP" 'NF >= 2 {print ip, $1, $2}')
[[ -n "$KNOWN" ]] || { echo "Could not read the server's host keys." >&2; exit 1; }
printf '%s\n' "$KNOWN" > "$WORK/claude-known-hosts"

echo "Checking the new key"
ssh -i "$CLAUDE_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$WORK/claude-known-hosts" "claude@$PUBLIC_IP" \
  'echo "Signed in as $(id -un) on $(hostname)"; journalctl -u coparents-api.service -n 1 --no-pager >/dev/null && echo "Can read the API log."; sudo -n true 2>/dev/null && echo "WARNING: sudo works" || echo "No sudo, as intended."'

{
  echo "# Add these four as environment variables of the Claude cloud environment, then delete this file."
  echo "ORACLE_HOST=$PUBLIC_IP"
  echo "ORACLE_USER=claude"
  echo "ORACLE_SSH_KEY=$(base64 -w0 "$CLAUDE_KEY")"
  echo "ORACLE_KNOWN_HOSTS=$(printf '%s\n' "$KNOWN" | base64 -w0)"
} > "$OUT"
chmod 600 "$OUT"
echo "Done. The values for the Claude cloud environment are in $OUT (not printed here)."
echo "Open it with: cat $OUT   Delete it afterwards with: rm $OUT"
