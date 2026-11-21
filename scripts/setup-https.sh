#!/usr/bin/env bash
# Put the site on https://<domain> with a free Let's Encrypt certificate.
# Run from Oracle Cloud Shell after the DNS A record points at the VM. Idempotent.
#
#   bash scripts/setup-https.sh                       # coparents.powerup.lu
#   bash scripts/setup-https.sh other.example.com     # another domain
#   CERT_EMAIL=you@example.com bash scripts/setup-https.sh   # get expiry warnings by email
#
# Running this accepts the Let's Encrypt Subscriber Agreement
# (https://letsencrypt.org/repository/). The plain http://<ip>/ site keeps
# working, so PR previews and the deploy check are not affected.
set -Eeuo pipefail
DOMAIN="${1:-coparents.powerup.lu}"
CERT_EMAIL="${CERT_EMAIL:-}"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "Not a domain name: $DOMAIN" >&2; exit 1; }
[[ -z "$CERT_EMAIL" || "$CERT_EMAIL" =~ ^[^@[:space:]\']+@[^@[:space:]\']+$ ]] || { echo "Not an email address: $CERT_EMAIL" >&2; exit 1; }
WORK="$HOME/react-server-setup"
ADMIN_KEY="$WORK/server-key"
PUBLIC_IP=$(sed -n 's/^PUBLIC_IP=//p' "$WORK/state.env" | tail -n1)
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && -f "$ADMIN_KEY" ]] || {
  echo "Missing $ADMIN_KEY or PUBLIC_IP. Run this in the Cloud Shell that set up the server." >&2
  exit 1
}
SSH=(ssh -i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
echo "Setting up https://$DOMAIN on $PUBLIC_IP"
"${SSH[@]}" "ubuntu@$PUBLIC_IP" "DOMAIN='$DOMAIN' CERT_EMAIL='$CERT_EMAIL' PUBLIC_IP='$PUBLIC_IP' bash -s" <<'REMOTE'
set -Eeuo pipefail

echo "==> DNS"
RESOLVED=$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | tr '\n' ' ')
if [[ " $RESOLVED" != *" $PUBLIC_IP "* ]]; then
  echo "$DOMAIN resolves to '${RESOLVED:-nothing}', not $PUBLIC_IP." >&2
  echo "Fix the DNS A record, or wait for the old value to expire, then run this again." >&2
  exit 1
fi

echo "==> Certbot"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot

echo "==> Certificate"
CONTACT=(--register-unsafely-without-email)
[[ -n "$CERT_EMAIL" ]] && CONTACT=(-m "$CERT_EMAIL" --no-eff-email)
# The existing port 80 site serves /var/www/html, so the challenge file is reachable.
sudo certbot certonly --webroot -w /var/www/html -d "$DOMAIN" \
  --non-interactive --agree-tos "${CONTACT[@]}" --keep-until-expiring \
  --deploy-hook 'systemctl reload nginx'

echo "==> Nginx"
sudo tee /etc/nginx/sites-available/coparents >/dev/null <<NGINX
# Written by scripts/setup-https.sh. The default site still answers on the IP.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    server_tokens off;
    root /var/www/html;
    location /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:coparents:10m;
    root /var/www/html;
    index index.html;
    server_tokens off;
    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    # Present once the API is installed. A pattern, so a missing file is not an error.
    include snippets/coparents-api.con[f];
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
sudo ln -sfn /etc/nginx/sites-available/coparents /etc/nginx/sites-enabled/coparents
if ! sudo nginx -t; then
  # Never leave a config behind that would stop Nginx from starting.
  sudo rm -f /etc/nginx/sites-enabled/coparents
  echo "The new Nginx config was rejected and has been switched off. The site is unchanged." >&2
  exit 1
fi
sudo systemctl reload nginx

echo "==> App address"
if [[ -f /etc/coparents/app.env ]]; then
  sudo sed -i "s|^COPARENTS_APP_URL=.*|COPARENTS_APP_URL=https://$DOMAIN|" /etc/coparents/app.env
  sudo systemctl restart coparents-api.service
else
  echo "No /etc/coparents/app.env yet. scripts/update-api.sh creates it."
fi

echo "==> Check"
sudo systemctl is-enabled --quiet certbot.timer && echo "Automatic renewal is on."
curl --max-time 15 -fsS "https://$DOMAIN/" >/dev/null
curl --max-time 15 -fsS -o /dev/null -w '%{url_effective} answers %{http_code}\n' "http://$PUBLIC_IP/"
echo "Live: https://$DOMAIN"
REMOTE
