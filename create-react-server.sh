#!/usr/bin/env bash
# Run in authenticated OCI Cloud Shell, not inside the Ubuntu VM.
# No private-key contents are printed or uploaded by this script.
set +x
set -Eeuo pipefail
umask 077
export OCI_CLI_REGION=eu-frankfurt-1
export OCI_CLI_OUTPUT=json
for tool in oci jq ssh ssh-keygen curl flock python3; do
  command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }
done
WORK="$HOME/react-server-setup"
mkdir -p "$WORK"
chmod 700 "$WORK"
exec 9>"$WORK/provision.lock"
flock -n 9 || { echo 'Another provisioning run is active.' >&2; exit 1; }
cd "$WORK"
STATE="$WORK/state.env"
KEY="$WORK/server-key"
die() { echo "ERROR: $*" >&2; exit 1; }
trap 'echo "Stopped at line $LINENO. Progress retained in $STATE; inspect the error before retrying." >&2' ERR

# Read only simple, known state fields. Do not execute state.env as shell code.
if [[ -f "$STATE" ]]; then
  while IFS='=' read -r name value; do
    case "$name" in
      COMPARTMENT_ID|TENANCY_ID|VCN_ID|IGW_ID|RT_ID|SL_ID|SUBNET_ID|IMAGE_ID|INSTANCE_ID|PUBLIC_IP|PRIVATE_IP|GATEWAY_ID|ROUTE_ID|SECURITY_ID)
        [[ "$value" =~ ^[a-zA-Z0-9._:-]+$ ]] || die "Invalid state field: $name"
        printf -v "$name" '%s' "$value" ;;
    esac
  done < "$STATE"
fi
IGW_ID=${IGW_ID:-${GATEWAY_ID:-}}
RT_ID=${RT_ID:-${ROUTE_ID:-}}
SL_ID=${SL_ID:-${SECURITY_ID:-}}
save() {
  local name tmp
  tmp=$(mktemp "$WORK/.state.XXXXXX")
  for name in TENANCY_ID COMPARTMENT_ID VCN_ID IGW_ID RT_ID SL_ID SUBNET_ID IMAGE_ID INSTANCE_ID PUBLIC_IP PRIVATE_IP; do
    [[ -z "${!name:-}" ]] || printf '%s=%s\n' "$name" "${!name}"
  done > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$STATE"
}
# OCI emits no JSON for some empty list results. Normalize that case.
api() {
  local result
  result=$(oci "$@" --output json) || return $?
  if [[ -z "$result" ]]; then printf '{"data":[]}\n'; else printf '%s\n' "$result"; fi
}
one() {
  jq -er 'if length > 1 then error("Ambiguous resource name: multiple matches") elif length == 1 then .[0].id else empty end' || {
    local rc=$?
    [[ $rc == 4 ]] || return "$rc"
  }
}
id() { jq -er '.data.id'; }

# Prefer explicit root tenancy context, then Cloud Shell/config metadata.
TENANCY_ID=${TENANCY_ID:-${OCI_TENANCY:-${OCI_CLI_TENANCY:-${TENANCY_OCID:-}}}}
if [[ -z "$TENANCY_ID" ]]; then
  TENANCY_ID=$(python3 - <<'PY'
import configparser, os
p=configparser.ConfigParser()
p.read(os.path.expanduser(os.environ.get('OCI_CLI_CONFIG_FILE','~/.oci/config')))
print(p.get(os.environ.get('OCI_CLI_PROFILE','DEFAULT'),'tenancy',fallback=''))
PY
  )
fi
if [[ -z "$TENANCY_ID" ]]; then
  TENANCY_ID=$(api iam availability-domain list | jq -er '.data[0]."compartment-id"')
fi
[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || die 'Cannot detect tenancy. Export OCI_TENANCY and retry.'
COMPARTMENT_ID=${COMPARTMENT_ID:-$TENANCY_ID}
save
api iam region-subscription list --tenancy-id "$TENANCY_ID" > regions.json
jq -e '.data[] | select(."region-name"=="eu-frankfurt-1" and ."is-home-region"==true)' regions.json >/dev/null || die 'Frankfurt must be the home region for this Always Free deployment.'
api iam availability-domain list --compartment-id "$TENANCY_ID" > ads.json
jq -er '.data | sort_by(.name)[] | .name' ads.json > ads.txt

echo 'Discovering Ubuntu 24.04 ARM64 images...'
api compute image list --compartment-id "$COMPARTMENT_ID" \
  --operating-system 'Canonical Ubuntu' --shape VM.Standard.A1.Flex \
  --sort-by TIMECREATED --sort-order DESC --all > images.json
LATEST_IMAGE=$(jq -er '[.data[] | select(."lifecycle-state"=="AVAILABLE") | select(."display-name" | test("^Canonical-Ubuntu-24\\.04(-Minimal)?-aarch64-"))] | sort_by(."time-created") | reverse | .[0].id // empty' images.json)

# Reconcile the already-created server before considering a new launch.
api compute instance list --compartment-id "$COMPARTMENT_ID" --all > instances.json
FOUND=$(jq '[.data[] | select(."display-name"=="react-web-server" and ."lifecycle-state"!="TERMINATED")]' instances.json | one)
if [[ -n "${INSTANCE_ID:-}" ]]; then
  [[ "$FOUND" == "$INSTANCE_ID" ]] || die 'Saved instance and name lookup disagree; refusing to duplicate resources.'
else
  INSTANCE_ID=$FOUND
fi
if [[ -n "${INSTANCE_ID:-}" ]]; then
  [[ -f "$KEY" ]] || die 'Existing server found but its SSH private key is missing. Restore the original key; do not generate a replacement.'
else
  # Audit all active compartments before allocating more free compute/storage.
  echo 'Checking tenancy-wide compute and block-storage allocation...'
  api iam compartment list --compartment-id "$TENANCY_ID" --compartment-id-in-subtree true --all > compartments.json
  { printf '%s\n' "$TENANCY_ID"; jq -r '.data[] | select(."lifecycle-state"=="ACTIVE") | .id' compartments.json; } | sort -u > compartments.txt
  CPU=0; RAM=0; STORAGE=0
  while IFS= read -r compartment; do
    api compute instance list --compartment-id "$compartment" --all > audit-instances.json
    read -r used_cpu used_ram < <(jq -r '[.data[] | select(.shape=="VM.Standard.A1.Flex" and ."lifecycle-state"!="TERMINATED") | ."shape-config"] | [([.[].ocpus] | add // 0), ([.[]."memory-in-gbs"] | add // 0)] | @tsv' audit-instances.json)
    CPU=$(jq -n "$CPU + $used_cpu"); RAM=$(jq -n "$RAM + $used_ram")
    api bv volume list --compartment-id "$compartment" --all > audit-volumes.json
    used=$(jq '[.data[] | select(."lifecycle-state"!="TERMINATED") | ."size-in-gbs"] | add // 0' audit-volumes.json)
    STORAGE=$((STORAGE + used))
    while IFS= read -r ad; do
      api bv boot-volume list --compartment-id "$compartment" --availability-domain "$ad" --all > audit-boots.json
      used=$(jq '[.data[] | select(."lifecycle-state"!="TERMINATED") | ."size-in-gbs"] | add // 0' audit-boots.json)
      STORAGE=$((STORAGE + used))
    done < ads.txt
  done < compartments.txt
  jq -en "$CPU + 1 <= 2 and $RAM + 6 <= 12 and $STORAGE + 50 <= 200" >/dev/null || die 'Insufficient unused Always Free compute/storage allocation.'
  if [[ ! -f "$KEY" ]]; then
    [[ ! -f "$KEY.pub" ]] || die 'Public key exists without private key; restore the original pair.'
    ssh-keygen -q -t rsa -b 4096 -N '' -C react-web-server -f "$KEY"
  fi
fi
chmod 600 "$KEY"
if [[ ! -f "$KEY.pub" ]]; then ssh-keygen -y -f "$KEY" > "$KEY.pub"; fi
[[ "$(ssh-keygen -y -f "$KEY" | cut -d' ' -f1,2)" == "$(cut -d' ' -f1,2 "$KEY.pub")" ]] || die 'SSH key pair does not match.'

echo 'Reconciling network...'
if [[ -z "${VCN_ID:-}" ]]; then
  VCN_ID=$(api network vcn list --compartment-id "$COMPARTMENT_ID" --all | jq '[.data[] | select(."display-name"=="react-web-vcn" and ."lifecycle-state"!="TERMINATED")]' | one)
  if [[ -z "$VCN_ID" ]]; then
    VCN_ID=$(api network vcn create --compartment-id "$COMPARTMENT_ID" --display-name react-web-vcn --cidr-block 10.42.0.0/16 --dns-label reactweb | id)
  fi
  save
fi
api network vcn get --vcn-id "$VCN_ID" > vcn.json
jq -e --arg c "$COMPARTMENT_ID" '.data | ."cidr-block"=="10.42.0.0/16" and ."compartment-id"==$c' vcn.json >/dev/null || die 'VCN configuration mismatch.'
if [[ -z "${IGW_ID:-}" ]]; then
  IGW_ID=$(api network internet-gateway list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --all | jq '[.data[] | select(."display-name"=="react-web-internet" and ."lifecycle-state"!="TERMINATED")]' | one)
  if [[ -z "$IGW_ID" ]]; then IGW_ID=$(api network internet-gateway create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name react-web-internet --is-enabled true | id); fi
  save
fi
api network internet-gateway get --ig-id "$IGW_ID" | jq -e --arg v "$VCN_ID" '.data."vcn-id"==$v' >/dev/null || die 'Gateway belongs to another VCN.'
api network internet-gateway update --ig-id "$IGW_ID" --is-enabled true --force >/dev/null
if [[ -z "${RT_ID:-}" ]]; then
  RT_ID=$(api network route-table list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --all | jq '[.data[] | select(."display-name"=="react-web-routes" and ."lifecycle-state"!="TERMINATED")]' | one)
  if [[ -z "$RT_ID" ]]; then RT_ID=$(api network route-table create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name react-web-routes | id); fi
  save
fi
api network route-table get --rt-id "$RT_ID" | jq -e --arg v "$VCN_ID" '.data."vcn-id"==$v' >/dev/null || die 'Route table belongs to another VCN.'
jq -n --arg id "$IGW_ID" '[{destination:"0.0.0.0/0",destinationType:"CIDR_BLOCK",networkEntityId:$id}]' > routes.json
api network route-table update --rt-id "$RT_ID" --route-rules file://routes.json --force >/dev/null
cat > ingress.json <<'JSON'
[
 {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
 {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
 {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":443,"max":443}}},
 {"protocol":"1","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","isStateless":false,"icmpOptions":{"type":3,"code":4}}
]
JSON
printf '%s\n' '[{"protocol":"all","destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","isStateless":false}]' > egress.json
if [[ -z "${SL_ID:-}" ]]; then
  SL_ID=$(api network security-list list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --all | jq '[.data[] | select(."display-name"=="react-web-firewall" and ."lifecycle-state"!="TERMINATED")]' | one)
  if [[ -z "$SL_ID" ]]; then SL_ID=$(api network security-list create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name react-web-firewall --ingress-security-rules file://ingress.json --egress-security-rules file://egress.json | id); fi
  save
fi
api network security-list get --security-list-id "$SL_ID" | jq -e --arg v "$VCN_ID" '.data."vcn-id"==$v' >/dev/null || die 'Security list belongs to another VCN.'
api network security-list update --security-list-id "$SL_ID" --ingress-security-rules file://ingress.json --egress-security-rules file://egress.json --force >/dev/null
if [[ -z "${SUBNET_ID:-}" ]]; then
  SUBNET_ID=$(api network subnet list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --all | jq '[.data[] | select(."display-name"=="react-web-public" and ."lifecycle-state"!="TERMINATED")]' | one)
  if [[ -z "$SUBNET_ID" ]]; then
    SUBNET_ID=$(api network subnet create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name react-web-public --cidr-block 10.42.1.0/24 --dns-label public --route-table-id "$RT_ID" --security-list-ids "[\"$SL_ID\"]" --prohibit-public-ip-on-vnic false | id)
  fi
  save
fi
api network subnet get --subnet-id "$SUBNET_ID" > subnet.json
jq -e --arg v "$VCN_ID" '.data | ."vcn-id"==$v and ."cidr-block"=="10.42.1.0/24" and ."prohibit-public-ip-on-vnic"==false' subnet.json >/dev/null || die 'Subnet configuration mismatch.'
api network subnet update --subnet-id "$SUBNET_ID" --route-table-id "$RT_ID" --security-list-ids "[\"$SL_ID\"]" --force >/dev/null

if [[ -z "${INSTANCE_ID:-}" ]]; then
  IMAGE_ID=$LATEST_IMAGE; save
  api network private-ip list --subnet-id "$SUBNET_ID" --all > private-ips.json
  IP_ARGS=()
  if jq -e '[.data[] | select(."ip-address"=="10.42.1.58")] | length==0' private-ips.json >/dev/null; then IP_ARGS=(--private-ip 10.42.1.58); fi
  while IFS= read -r ad; do
    echo "Launching in $ad..."
    if api compute instance launch --compartment-id "$COMPARTMENT_ID" --availability-domain "$ad" \
      --display-name react-web-server --shape VM.Standard.A1.Flex --shape-config '{"ocpus":1,"memoryInGBs":6}' \
      --image-id "$IMAGE_ID" --boot-volume-size-in-gbs 50 --subnet-id "$SUBNET_ID" \
      --assign-public-ip true "${IP_ARGS[@]}" --ssh-authorized-keys-file "$KEY.pub" > launch.json 2> launch-error.txt; then
      INSTANCE_ID=$(id < launch.json); save; break
    fi
    cat launch-error.txt >&2
    grep -qi 'out of host capacity' launch-error.txt || die 'Launch failed. On ambiguous timeouts, wait and inspect instances before rerunning.'
  done < ads.txt
  [[ -n "${INSTANCE_ID:-}" ]] || die 'No Ampere capacity in any AD. Network retained; retry later.'
fi

echo 'Waiting for RUNNING...'
deadline=$((SECONDS+1200))
while :; do
  api compute instance get --instance-id "$INSTANCE_ID" > instance.json
  status=$(jq -r '.data."lifecycle-state"' instance.json)
  [[ "$status" != TERMINATED && "$status" != TERMINATING ]] || die "Instance is $status."
  [[ "$status" != STOPPED ]] || die 'Existing instance is STOPPED. Start it explicitly, then rerun.'
  [[ "$status" == RUNNING ]] && break
  (( SECONDS < deadline )) || die 'Timed out waiting for RUNNING.'
  sleep 10
done
jq -e '.data | .shape=="VM.Standard.A1.Flex" and ."shape-config".ocpus==1 and ."shape-config"."memory-in-gbs"==6' instance.json >/dev/null || die 'Existing instance hardware differs from requested configuration.'
ACTUAL_AD=$(jq -r '.data."availability-domain"' instance.json)
IMAGE_ID=$(jq -er '.data."image-id"' instance.json); save
api compute image get --image-id "$IMAGE_ID" | jq -e '.data."display-name" | test("^Canonical-Ubuntu-24\\.04(-Minimal)?-aarch64-")' >/dev/null || die 'Existing server image is not Ubuntu 24.04 ARM64.'
api compute boot-volume-attachment list --compartment-id "$COMPARTMENT_ID" --availability-domain "$ACTUAL_AD" --instance-id "$INSTANCE_ID" --all > boot-attachments.json
BOOT_ID=$(jq -er '.data[] | select(."lifecycle-state"=="ATTACHED") | ."boot-volume-id"' boot-attachments.json)
api bv boot-volume get --boot-volume-id "$BOOT_ID" > boot.json
jq -e '.data."size-in-gbs"==50 and (.data."vpus-per-gb" <= 10)' boot.json >/dev/null || die 'Boot disk size/performance differs from free-tier target.'
api compute instance list-vnics --instance-id "$INSTANCE_ID" --all > vnics.json
PRIMARY=$(jq -ce '.data[] | select(."is-primary"==true)' vnics.json)
[[ "$(jq -r '."subnet-id"' <<<"$PRIMARY")" == "$SUBNET_ID" ]] || die 'Instance uses a different subnet.'
PUBLIC_IP=$(jq -er '."public-ip" // empty' <<<"$PRIMARY")
PRIVATE_IP=$(jq -er '."private-ip"' <<<"$PRIMARY"); save

SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ubuntu@$PUBLIC_IP")
echo 'Waiting for SSH...'
deadline=$((SECONDS+600))
until "${SSH[@]}" true 2> ssh-error.txt; do
  (( SECONDS < deadline )) || { cat ssh-error.txt >&2; die 'SSH timeout. Check Cloud Shell public-network access, instance firewall, and key.'; }
  sleep 10
done
echo 'Configuring Nginx and persistent firewall rules...'
"${SSH[@]}" 'sudo bash -s' <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
timeout 600 cloud-init status --wait
apt-get -o DPkg::Lock::Timeout=300 update
apt-get -o DPkg::Lock::Timeout=300 install -y nginx iptables-persistent curl
for port in 80 443; do
  # Insertion at position 1 places ACCEPT ahead of OCI's existing REJECT.
  # Delete exact copies first to keep repeated runs idempotent.
  while iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; do
    iptables -D INPUT -p tcp --dport "$port" -j ACCEPT
  done
  iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
netfilter-persistent save
mkdir -p /var/www/html
if [[ ! -e /var/www/html/index.html ]]; then
  printf '%s\n' '<!doctype html><html lang="en"><meta charset="utf-8"><title>Tom’s server</title><h1>Your Oracle server is online!</h1><p>Ready for React.</p></html>' > /var/www/html/index.html
fi
if [[ ! -e /etc/nginx/sites-available/default.before-react-setup ]]; then
  cp -a /etc/nginx/sites-available/default /etc/nginx/sites-available/default.before-react-setup
fi
cat > /etc/nginx/sites-available/default <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/html;
    index index.html;
    server_tokens off;
    add_header X-Content-Type-Options nosniff always;
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
nginx -t
systemctl enable --now nginx
systemctl reload nginx
systemctl is-active --quiet nginx
systemctl is-enabled --quiet nginx
[[ "$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' http://localhost/)" == 200 ]]
REMOTE

echo 'Verifying HTTP from Cloud Shell...'
deadline=$((SECONDS+120))
while :; do
  HTTP_CODE=$(curl --connect-timeout 5 --max-time 15 -sS -o /dev/null -w '%{http_code}' "http://$PUBLIC_IP/" || true)
  [[ "$HTTP_CODE" == 200 ]] && break
  (( SECONDS < deadline )) || die "External HTTP check failed: $HTTP_CODE"
  sleep 5
done
OS_VERSION=$("${SSH[@]}" '. /etc/os-release; printf "%s" "$PRETTY_NAME"')
NGINX_VERSION=$("${SSH[@]}" 'nginx -v 2>&1' | sed 's/^nginx version: //')
ARCH=$("${SSH[@]}" uname -m)
[[ "$ARCH" == aarch64 ]] || die 'Unexpected CPU architecture.'
cat > "$WORK/server-information.txt" <<REPORT
SERVER INFORMATION
Name: react-web-server
Cloud provider: Oracle Cloud Infrastructure (OCI)
Region: Frankfurt, Germany (eu-frankfurt-1)
Availability domain: $ACTUAL_AD
Status: RUNNING

HARDWARE
Shape: VM.Standard.A1.Flex
Architecture: ARM64 (aarch64)
CPU: 1 OCPU
RAM: 6 GB
Boot disk: 50 GB
Plan: Configured within Always Free resource allowances

OPERATING SYSTEM
OS: $OS_VERSION
Username: ubuntu

NETWORK
Public IPv4: $PUBLIC_IP
Private IPv4: $PRIVATE_IP
VCN: react-web-vcn
VCN CIDR: 10.42.0.0/16
Subnet: react-web-public
Subnet CIDR: 10.42.1.0/24
Allowed inbound TCP ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

WEBSITE
URL: http://$PUBLIC_IP
Web server: $NGINX_VERSION
Web root: /var/www/html
Nginx status: Active and enabled at startup
Local HTTP check: 200 OK
HTTPS: Not configured
React: Not deployed yet

SSH ACCESS FROM CLOUD SHELL
ssh -i "\$HOME/react-server-setup/server-key" ubuntu@$PUBLIC_IP

FILES IN CLOUD SHELL
Private SSH key: ~/react-server-setup/server-key
Public SSH key: ~/react-server-setup/server-key.pub
Resource IDs: ~/react-server-setup/state.env
Creation script: ~/create-react-server.sh
REPORT
cat "$WORK/server-information.txt"
