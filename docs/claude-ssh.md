# SSH access for Claude cloud sessions

Claude cloud sessions can sign in to the Oracle VM as the limited user `claude`
to read logs and check the server. `claude` has **no sudo**. It is in the groups
`systemd-journal` (read `journalctl`) and `adm` (read `/var/log`), nothing more.
Anything that needs root still goes through the admin scripts in Cloud Shell.

## One-time setup (OCI Cloud Shell)

The key pair `~/claude_oracle` / `~/claude_oracle.pub` already exists. The script
uses the admin key `~/react-server-setup/server-key`, the same one every other
setup script uses.

```
cd ~/react-web-server && git pull && bash scripts/setup-claude-ssh.sh
```

It creates the user, installs the public key, signs in once with the new key to
check it, and writes four values to `~/claude-env.txt` (never printed, mode 600):

| Variable | Value |
| --- | --- |
| `ORACLE_HOST` | the VM's public IP |
| `ORACLE_USER` | `claude` |
| `ORACLE_SSH_KEY` | the private key, base64 on one line |
| `ORACLE_KNOWN_HOSTS` | the server's host keys, base64 on one line |

Add them as environment variables of the project's Claude cloud environment,
allow outbound SSH (port 22 to the VM) in its network settings, then
`rm ~/claude-env.txt`. Never paste the private key into chat or the repo.

Running the script again replaces the key. To revoke access:
`sudo deluser --remove-home claude` on the VM (from the admin account).

## In a Claude session

```
install -d -m 700 ~/.ssh
printf '%s' "$ORACLE_SSH_KEY" | base64 -d > ~/.ssh/oracle && chmod 600 ~/.ssh/oracle
printf '%s' "$ORACLE_KNOWN_HOSTS" | base64 -d > ~/.ssh/oracle_known_hosts
ssh -i ~/.ssh/oracle -o IdentitiesOnly=yes -o UserKnownHostsFile=~/.ssh/oracle_known_hosts \
  -o StrictHostKeyChecking=yes "$ORACLE_USER@$ORACLE_HOST" 'journalctl -u coparents-api.service -n 50 --no-pager'
```

Logs contain IP addresses and email addresses. Read them in the session; don't
copy them into PRs, issues or the public Actions logs.
