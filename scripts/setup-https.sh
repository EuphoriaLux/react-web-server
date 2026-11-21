#!/usr/bin/env bash
# Put the site on https://<domain> with a free Let's Encrypt certificate.
# Run from Oracle Cloud Shell after the DNS A records point at the VM. Idempotent.
#
#   bash scripts/setup-https.sh
#       coparent.lu, with www.coparent.lu redirecting to it
#   bash scripts/setup-https.sh app.example.com www.app.example.com
#       the first name is the app's address, the others redirect to it
#   REDIRECT_FROM=coparents.powerup.lu bash scripts/setup-https.sh
#       also send an earlier address (set up by this script before) to the new one
#   CERT_EMAIL=you@example.com bash scripts/setup-https.sh
#       get certificate expiry warnings by email
#
# Running this accepts the Let's Encrypt Subscriber Agreement
# (https://letsencrypt.org/repository/). The plain http://<ip>/ site keeps
# working, so PR previews and the deploy check are not affected.
set -Eeuo pipefail
if (( $# )); then NAMES=("$@"); else NAMES=(coparent.lu www.coparent.lu); fi
read -r -a OLD_NAMES <<< "${REDIRECT_FROM:-}"
CERT_EMAIL="${CERT_EMAIL:-}"
for name in "${NAMES[@]}" "${OLD_NAMES[@]}"; do
  [[ "$name" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "Not a domain name: $name" >&2; exit 1; }
done
for old in "${OLD_NAMES[@]}"; do
  for name in "${NAMES[@]}"; do
    [[ "$old" != "$name" ]] || { echo "$old cannot be both the new address and REDIRECT_FROM." >&2; exit 1; }
  done
done
[[ -z "$CERT_EMAIL" || "$CERT_EMAIL" =~ ^[^@[:space:]\']+@[^@[:space:]\']+$ ]] || { echo "Not an email address: $CERT_EMAIL" >&2; exit 1; }
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
echo "Setting up https://${NAMES[0]} on $PUBLIC_IP"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" "NAMES='${NAMES[*]}' OLD_NAMES='${OLD_NAMES[*]}' CERT_EMAIL='$CERT_EMAIL' PUBLIC_IP='$PUBLIC_IP' bash -s" <<'REMOTE'
set -Eeuo pipefail
read -r -a NAMES <<< "$NAMES"
read -r -a OLD_NAMES <<< "$OLD_NAMES"
DOMAIN="${NAMES[0]}"
ALIASES=("${NAMES[@]:1}")

echo "==> DNS"
for name in "${NAMES[@]}"; do
  RESOLVED=$(getent ahostsv4 "$name" | awk '{print $1}' | sort -u | tr '\n' ' ')
  if [[ " $RESOLVED" != *" $PUBLIC_IP "* ]]; then
    echo "$name resolves to '${RESOLVED:-nothing}', not $PUBLIC_IP." >&2
    echo "Fix the DNS A record, or wait for the old value to expire, then run this again." >&2
    exit 1
  fi
done
for old in "${OLD_NAMES[@]}"; do
  sudo test -f "/etc/letsencrypt/live/$old/fullchain.pem" || {
    echo "No certificate for $old on this server, so it cannot be redirected over https." >&2
    exit 1
  }
done

echo "==> Certbot"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot

echo "==> Certificate"
CONTACT=(--register-unsafely-without-email)
[[ -n "$CERT_EMAIL" ]] && CONTACT=(-m "$CERT_EMAIL" --no-eff-email)
WANTED=()
for name in "${NAMES[@]}"; do WANTED+=(-d "$name"); done
# The existing port 80 site serves /var/www/html, so the challenge file is reachable.
sudo certbot certonly --webroot -w /var/www/html --cert-name "$DOMAIN" "${WANTED[@]}" \
  --non-interactive --agree-tos "${CONTACT[@]}" --keep-until-expiring --expand \
  --deploy-hook 'systemctl reload nginx'

echo "==> Nginx"
TLS="ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:coparents:10m;
    server_tokens off;"
# Every name answers on port 80 for certificate renewals, and otherwise goes to the app.
port80() {
  cat <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $1;
    server_tokens off;
    root /var/www/html;
    location /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}
NGINX
}
# A name that only forwards to the app, using the certificate named in \$2.
forward443() {
  cat <<NGINX
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $1;
    ssl_certificate /etc/letsencrypt/live/$2/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$2/privkey.pem;
    $TLS
    return 301 https://$DOMAIN\$request_uri;
}
NGINX
}
BACKUP=$(sudo mktemp -d /var/backups/coparents-nginx.XXXXXX)
sudo cp -a /etc/nginx/sites-available /etc/nginx/sites-enabled "$BACKUP/"
{
  echo "# Written by scripts/setup-https.sh. The default site still answers on the IP."
  port80 "${NAMES[*]}"
  (( ${#ALIASES[@]} )) && forward443 "${ALIASES[*]}" "$DOMAIN"
  cat <<NGINX
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    $TLS
    root /var/www/html;
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    # Present once the API is installed. A pattern, so a missing file is not an error.
    include snippets/coparents-api.con[f];
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
} | sudo tee "/etc/nginx/sites-available/coparents-$DOMAIN" >/dev/null
sudo ln -sfn "/etc/nginx/sites-available/coparents-$DOMAIN" "/etc/nginx/sites-enabled/coparents-$DOMAIN"
for old in "${OLD_NAMES[@]}"; do
  {
    echo "# Written by scripts/setup-https.sh. An earlier address of the app, now forwarding."
    port80 "$old"
    forward443 "$old" "$old"
  } | sudo tee "/etc/nginx/sites-available/coparents-$old" >/dev/null
  sudo ln -sfn "/etc/nginx/sites-available/coparents-$old" "/etc/nginx/sites-enabled/coparents-$old"
done
# Earlier versions wrote one site file called "coparents". Retire it once its name is covered above.
LEGACY=/etc/nginx/sites-available/coparents
if [[ -f "$LEGACY" ]]; then
  for name in "${NAMES[@]}" "${OLD_NAMES[@]}"; do
    if sudo grep -Eq "server_name ([^;]* )?$name( [^;]*)?;" "$LEGACY"; then
      sudo rm -f /etc/nginx/sites-enabled/coparents "$LEGACY"
      break
    fi
  done
fi
if ! sudo nginx -t; then
  # Never leave a config behind that would stop Nginx from starting.
  sudo rm -rf /etc/nginx/sites-available /etc/nginx/sites-enabled
  sudo cp -a "$BACKUP/sites-available" "$BACKUP/sites-enabled" /etc/nginx/
  sudo rm -rf "$BACKUP"
  echo "The new Nginx config was rejected and the previous one has been put back. The site is unchanged." >&2
  exit 1
fi
sudo systemctl reload nginx
sudo rm -rf "$BACKUP"

echo "==> App address"
if [[ -f /etc/coparents/app.env ]]; then
  sudo sed -i "s|^COPARENTS_APP_URL=.*|COPARENTS_APP_URL=https://$DOMAIN|" /etc/coparents/app.env
  sudo systemctl restart coparents-api.service
else
  echo "No /etc/coparents/app.env yet. scripts/update-api.sh creates it."
fi

echo "==> Check"
sudo systemctl is-enabled --quiet certbot.timer && echo "Automatic renewal is on."
# A reload hands over gradually: for a moment the previous workers still answer,
# with the previous certificates. Give the new ones a few seconds before judging.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl --max-time 15 -fsS "https://$DOMAIN/" >/dev/null 2>&1 && break
  sleep 1
done
curl --max-time 15 -fsS "https://$DOMAIN/" >/dev/null
for name in "${ALIASES[@]}" "${OLD_NAMES[@]}"; do
  curl --max-time 15 -fsS -o /dev/null -w "https://$name/ forwards to %{redirect_url}\n" "https://$name/"
done
curl --max-time 15 -fsS -o /dev/null -w '%{url_effective} answers %{http_code}\n' "http://$PUBLIC_IP/"
echo "Live: https://$DOMAIN"
REMOTE
