#!/usr/bin/env bash
# Install Postgres + the CoParents API on the Oracle VM.
# Run as the ubuntu admin user on the VM, or via scripts/install-postgres-remote.sh
# from Oracle Cloud Shell. Idempotent.
set -Eeuo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this as ubuntu, not root. It uses sudo where needed." >&2
  exit 1
fi

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=/etc/coparents/database.env
API_USER=coparents
DB_NAME=coparents
DB_USER=coparents

echo "==> Packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib python3-psycopg2

echo "==> Database (localhost only)"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASSWORD=$(openssl rand -hex 24)
  sudo install -d -m 755 /etc/coparents
  umask 077
  tmp=$(mktemp)
  printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:5432/%s\n' "$DB_USER" "$DB_PASSWORD" "$DB_NAME" > "$tmp"
  sudo install -m 600 -o root -g root "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL
else
  echo "Keeping existing $ENV_FILE"
fi

# Always enforce localhost. Do not open 5432.
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER ${DB_USER} WITH LOGIN;"
PG_HBA=$(sudo -u postgres psql -tAc "show hba_file")
if ! sudo grep -q "coparents" "$PG_HBA"; then
  echo "host ${DB_NAME} ${DB_USER} 127.0.0.1/32 scram-sha-256" | sudo tee -a "$PG_HBA" >/dev/null
  echo "host ${DB_NAME} ${DB_USER} ::1/128 scram-sha-256" | sudo tee -a "$PG_HBA" >/dev/null
  sudo systemctl reload postgresql
fi

echo "==> Schema"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$ROOT/db/schema.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "ALTER TABLE households OWNER TO ${DB_USER}; ALTER TABLE members OWNER TO ${DB_USER}; ALTER TABLE plans OWNER TO ${DB_USER};"

echo "==> API"
id "$API_USER" >/dev/null 2>&1 || sudo useradd --system --create-home --shell /usr/sbin/nologin "$API_USER"
sudo install -d -o "$API_USER" -g "$API_USER" -m 755 /opt/coparents
sudo install -m 644 -o "$API_USER" -g "$API_USER" "$ROOT/server/api.py" /opt/coparents/api.py
sudo chown root:"$API_USER" "$ENV_FILE"
sudo chmod 640 "$ENV_FILE"

sudo tee /etc/systemd/system/coparents-api.service >/dev/null <<'UNIT'
[Unit]
Description=CoParents API
After=network.target postgresql.service

[Service]
User=coparents
Group=coparents
EnvironmentFile=/etc/coparents/database.env
Environment=COPARENTS_HOST=127.0.0.1
Environment=COPARENTS_PORT=8787
ExecStart=/usr/bin/python3 /opt/coparents/api.py
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now coparents-api.service
sudo systemctl restart coparents-api.service

echo "==> Nginx /api proxy"
SNIP=/etc/nginx/snippets/coparents-api.conf
sudo tee "$SNIP" >/dev/null <<'NGINX'
location /api/ {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
NGINX
for site in /etc/nginx/sites-enabled/*; do
  [[ -f "$site" ]] || continue
  if ! sudo grep -q "snippets/coparents-api.conf" "$site"; then
    sudo sed -i '/server_name/a \    include snippets/coparents-api.conf;' "$site"
  fi
done
sudo nginx -t
sudo systemctl reload nginx

echo "==> Nightly backup, 14 days"
sudo tee /etc/cron.d/coparents-backup >/dev/null <<'CRON'
15 3 * * * postgres pg_dump --no-owner coparents | gzip > /var/backups/coparents-$(date +\%F).sql.gz && find /var/backups -name 'coparents-*.sql.gz' -mtime +14 -delete
CRON
sudo chmod 644 /etc/cron.d/coparents-backup

echo "==> Check"
sleep 1
curl -sf http://127.0.0.1:8787/api/health
echo
echo "Postgres is on localhost only. API is on 127.0.0.1:8787, public via /api/."
echo "Create a plan from the site, or: curl -s -X POST http://127.0.0.1/api/households"
