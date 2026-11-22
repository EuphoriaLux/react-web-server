#!/usr/bin/env bash
# Run the private beta from Oracle Cloud Shell.
#
#   bash scripts/beta.sh list                     who signed up, who is approved
#   bash scripts/beta.sh approve anna@example.com  let them create a plan, and email the invitation
#   bash scripts/beta.sh approve anna@example.com de   same, invitation in German (en, fr, de, lb)
#   bash scripts/beta.sh remove anna@example.com   take them off the list
#   bash scripts/beta.sh notify you@example.com    where new sign-ups are announced
#   bash scripts/beta.sh gate off                  anyone signed in may create a plan again (gate on: invite-only)
#
# Joining a plan with the other parent's code always works, approved or not.
set -Eeuo pipefail
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" 2>/dev/null | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}
EMAIL_RE='^[^@[:space:]<>"'"'"'\\]+@[^@[:space:]<>"'"'"'\\]+\.[^@[:space:]<>"'"'"'\\]+$'
ACTION="${1:-}"
ARG="${2:-}"
LANG_ARG="${3:-}"
case "$ACTION" in
  list) ;;
  approve|remove|notify)
    [[ "$ARG" =~ $EMAIL_RE ]] || { echo "Give an email address: bash scripts/beta.sh $ACTION someone@example.com" >&2; exit 1; }
    [[ -z "$LANG_ARG" || "$LANG_ARG" =~ ^(en|fr|de|lb)$ ]] || { echo "Language must be en, fr, de or lb." >&2; exit 1; } ;;
  gate)
    [[ "$ARG" =~ ^(on|off)$ ]] || { echo "Use: bash scripts/beta.sh gate on   (or off)" >&2; exit 1; } ;;
  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 1 ;;
esac

# The commands travel as the ssh argument. The values travel on stdin.
REMOTE=$(cat <<'REMOTE'
set -Eeuo pipefail
IFS= read -r ACTION; IFS= read -r ARG; IFS= read -r LANG_ARG
FILE=/etc/coparents/app.env
put() {
  local value
  value=$(printf '%s' "$2" | sed 's/[&|]/\\&/g')
  if sudo grep -q "^$1=" "$FILE"; then
    sudo sed -i "s|^$1=.*|$1=$value|" "$FILE"
  else
    printf '%s=%s\n' "$1" "$2" | sudo tee -a "$FILE" >/dev/null
  fi
}
restart() {
  sudo systemctl restart coparents-api.service
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf -o /dev/null http://127.0.0.1:8787/api/health && return 0
    sleep 1
  done
  echo "The API did not come back after the restart. See: sudo journalctl -u coparents-api -n 30" >&2
  exit 1
}
case "$ACTION" in
  notify)
    put COPARENTS_BETA_NOTIFY "$ARG"; restart
    echo "New sign-ups will be emailed to $ARG." ;;
  gate)
    if [[ "$ARG" == off ]]; then put COPARENTS_BETA_GATE 0; else put COPARENTS_BETA_GATE 1; fi
    restart
    echo "Beta gate is $ARG." ;;
  *)
    # Same user and settings as the API service itself.
    run=(sudo systemd-run --quiet --wait --pipe --collect -p User=coparents
      -p EnvironmentFile=/etc/coparents/database.env -p EnvironmentFile=-/etc/coparents/app.env
      /usr/bin/python3 /opt/coparents/api.py beta "$ACTION")
    [[ -n "$ARG" ]] && run+=("$ARG")
    [[ -n "$LANG_ARG" ]] && run+=("$LANG_ARG")
    "${run[@]}" ;;
esac
REMOTE
)
printf '%s\n' "$ACTION" "$ARG" "$LANG_ARG" |
  ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "ubuntu@$PUBLIC_IP" "$REMOTE"
