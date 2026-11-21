#!/usr/bin/env bash
# Set the mail server the API uses for sign-in links, then send a test link.
# Run from Oracle Cloud Shell. Asks for the SMTP login and key, so they never
# appear in the repo, in shell history, or in a process list.
#
#   bash scripts/set-mail.sh
#
# Defaults fit Brevo (smtp-relay.brevo.com, port 587). Another provider:
#   SMTP_HOST=smtp.example.com SMTP_PORT=587 bash scripts/set-mail.sh
set -Eeuo pipefail
SMTP_HOST="${SMTP_HOST:-smtp-relay.brevo.com}"
SMTP_PORT="${SMTP_PORT:-587}"
[[ "$SMTP_HOST" =~ ^[a-z0-9.-]+$ && "$SMTP_PORT" =~ ^[0-9]+$ ]] || { echo "Bad SMTP_HOST or SMTP_PORT." >&2; exit 1; }
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}

plain() { [[ -n "$1" && "$1" != *[$'\n\r\\"'\']* ]]; }
read -r -p "Sender address [no-reply@coparent.lu]: " SENDER
SENDER="${SENDER:-no-reply@coparent.lu}"
read -r -p "SMTP login: " SMTP_USER
read -r -s -p "SMTP key (hidden while you paste): " SMTP_PASSWORD
echo
read -r -p "Send the test sign-in email to: " TEST_TO
[[ "$SENDER" =~ ^[^@[:space:]\<\>]+@[^@[:space:]\<\>]+$ ]] || { echo "Not an email address: $SENDER" >&2; exit 1; }
[[ "$TEST_TO" =~ ^[^@[:space:]\<\>]+@[^@[:space:]\<\>]+$ ]] && plain "$TEST_TO" || { echo "Not an email address: $TEST_TO" >&2; exit 1; }
plain "$SMTP_USER" && plain "$SMTP_PASSWORD" || { echo "The login and key cannot be empty or contain quotes or backslashes." >&2; exit 1; }
[[ "$SMTP_USER" != *[[:space:]]* && "$SMTP_PASSWORD" != *[[:space:]]* ]] || { echo "The login and key cannot contain spaces. Paste them again." >&2; exit 1; }

# The commands travel as the ssh argument. The values travel on stdin.
REMOTE=$(cat <<'REMOTE'
set -Eeuo pipefail
FILE="${APP_ENV:-/etc/coparents/app.env}"
sudo test -f "$FILE" || { echo "No $FILE on the server. Run scripts/update-api.sh first." >&2; exit 1; }
IFS= read -r HOST; IFS= read -r PORT; IFS= read -r FROM; IFS= read -r LOGIN; IFS= read -r KEY; IFS= read -r TEST_TO
put() {
  # Replace the line for $1, or add it. The value is escaped for sed.
  local value
  value=$(printf '%s' "$2" | sed 's/[&|]/\\&/g')
  if sudo grep -q "^$1=" "$FILE"; then
    sudo sed -i "s|^$1=.*|$1=$value|" "$FILE"
  else
    printf '%s=%s\n' "$1" "$2" | sudo tee -a "$FILE" >/dev/null
  fi
}
put COPARENTS_SMTP_HOST "$HOST"
put COPARENTS_SMTP_PORT "$PORT"
put COPARENTS_MAIL_FROM "CoParents <$FROM>"
put COPARENTS_SMTP_USER "$LOGIN"
put COPARENTS_SMTP_PASSWORD "$KEY"
sudo chown root:coparents "$FILE"
sudo chmod 640 "$FILE"
echo "Mail settings saved on the server."
sudo systemctl restart coparents-api.service
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl -sf -o /dev/null http://127.0.0.1:8787/api/health && break
  sleep 1
done
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST \
  -H 'Content-Type: application/json' -d "{\"email\":\"$TEST_TO\"}" \
  http://127.0.0.1:8787/api/auth/request)
if [[ "$STATUS" == 200 ]]; then
  echo "The mail server accepted a sign-in email for $TEST_TO. Check the inbox, and the spam folder."
else
  echo "The test email was not sent (the API answered $STATUS). The reason is in the log:" >&2
  sudo journalctl -u coparents-api -n 20 --no-pager | grep -i 'sign-in email failed' | tail -n 3 >&2 || true
  exit 1
fi
REMOTE
)
printf '%s\n' "$SMTP_HOST" "$SMTP_PORT" "$SENDER" "$SMTP_USER" "$SMTP_PASSWORD" "$TEST_TO" |
  ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "ubuntu@$PUBLIC_IP" "$REMOTE"
