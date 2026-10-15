# React Web Server

A React website project hosted on an Oracle Cloud Infrastructure ARM64 Ubuntu server.

## Project status

The server and Nginx have been configured successfully. This repository currently contains infrastructure automation; the React application and HTTPS configuration are the next stages.

## Infrastructure target

| Setting | Value |
| --- | --- |
| Region | Frankfurt (`eu-frankfurt-1`), tenancy home region |
| Instance | `react-web-server` |
| Shape | `VM.Standard.A1.Flex`, ARM64 |
| Resources | 1 OCPU, 6 GB RAM, 50 GB boot volume |
| OS | Canonical Ubuntu 24.04 LTS |
| Availability | Prefer AD-1; try AD-2/AD-3 only on host-capacity errors |
| Web server | Ubuntu-packaged Nginx |
| Web root | `/var/www/html` |
| Inbound TCP | 22, 80, 443 |

Free eligibility depends on total tenancy usage and Oracle's current allowances. Before a new launch, the script audits active compartments in the home region against a conservative allowance of 2 A1 OCPUs, 12 GB RAM, and 200 GB block storage. It stops if an inventory request fails. It does not upgrade the account or choose a paid substitute shape.

This is an HTTP hosting baseline. TLS, domain configuration, application deployment, backups, and monitoring remain separate work.

## Run from authenticated OCI Cloud Shell

Provisioning runs in **Cloud Shell**, not inside an SSH session on the Ubuntu server. If the prompt says `ubuntu@react-web-server`, use `exit` first.

```bash
git clone https://github.com/EuphoriaLux/react-web-server.git
cd react-web-server
install -m 700 create-react-server.sh "$HOME/create-react-server.sh"
bash "$HOME/create-react-server.sh"
```

For later updates:

```bash
cd ~/react-web-server
git pull --ff-only
install -m 700 create-react-server.sh "$HOME/create-react-server.sh"
bash "$HOME/create-react-server.sh"
```

Dependencies: authenticated OCI CLI, Bash, jq, Python 3, SSH, curl, and flock. The tenancy context is detected from environment variables, OCI config, or availability-domain metadata. Export `OCI_TENANCY` if automatic detection fails. Permissions are needed to inventory compartments and manage this project's compute/network/storage resources.

## What the script does

1. Detects tenancy context, verifies the home region, and discovers compatible Ubuntu 24.04 ARM64 images.
2. Reconciles the project VCN, internet gateway, routes, security list, and public subnet.
3. Reuses the existing named server or launches the requested shape with AD fallback.
4. Connects by SSH, waits for cloud-init, and installs Nginx and persistent firewall tooling.
5. Places HTTP/HTTPS ACCEPT rules before Oracle Ubuntu's default host-firewall REJECT rules.
6. Configures the default Nginx site for `/var/www/html`, including React client-route fallback.
7. Requires HTTP 200 locally and from Cloud Shell before printing the final report.

Existing site content is preserved. The project's route/security configuration and default Nginx site are managed by the script. The original default Nginx site is backed up once. Existing image/hardware/subnet mismatches stop execution rather than replacing the VM.

## State and SSH keys

These files stay outside the Git checkout:

```text
~/create-react-server.sh
~/react-server-setup/state.env
~/react-server-setup/server-key
~/react-server-setup/server-key.pub
~/react-server-setup/server-information.txt
```

The setup directory uses mode `700`, and the private key uses mode `600`. The script never prints private-key contents. Keep a secure backup of the original private key. An existing server without its original local key causes a stop.

State is written atomically after resource discovery/creation. An exclusive local lock prevents concurrent runs. Older state names are migrated. Name reconciliation helps resume interrupted runs; ambiguous names or mismatched resources stop execution. Following an ambiguous API timeout, inspect pending operations before rerunning.

## Connect and inspect

Use the public IP from the generated report:

```bash
ssh -i "$HOME/react-server-setup/server-key" ubuntu@YOUR_PUBLIC_IP
```

The first SSH connection records the host key with `StrictHostKeyChecking=accept-new`; changed host keys remain blocked.

Read the report in Cloud Shell:

```bash
cat ~/react-server-setup/server-information.txt
```

Port 443 is allowed, but HTTPS is not configured yet. The script installs the supported Ubuntu Nginx package and reports its actual version rather than pinning an old security patch.

## Validation and troubleshooting

Bash syntax and two mocked existing-server reruns passed without create/launch calls. The owner also ran the existing-server path successfully in authenticated Cloud Shell, including external HTTP verification. Fresh provisioning and capacity fallback have not been independently integration-tested.

- **Capacity exhausted:** each AD is tried once. Network progress remains saved; retry later.
- **SSH timeout:** check the key, public IP, firewall, and Cloud Shell public-network access.
- **Stopped instance:** start it explicitly, then rerun.
- **Instance status wait:** bounded polling is used; `instance get --wait-for-state` is not supported.

## Repository security

Commit source code and reusable automation only. Keep private SSH keys, OCI credentials, `.env` secrets, state files, and generated server reports out of Git. Documentation uses placeholders for account-specific addresses and identifiers.

`.gitignore` excludes common sensitive artifacts but does not remove tracked secrets or Git history. Any secret accidentally committed must be revoked or rotated. React browser bundles are public: never embed server-side credentials in frontend configuration.
