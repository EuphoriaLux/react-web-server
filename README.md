# CoParents

A calm shared space for divorced and separated parents who still raise a child together.

**Goal:** eliminate friction around schedules, expenses, messages, and documents so the focus stays on the child.

This repository currently hosts the **concept homepage** (marketing landing page). The product app (auth, shared calendar, expenses, messaging, documents) will be built next on the same Oracle Cloud hosting baseline.

## Local development

Requires Node 22.12+ and npm.

```bash
npm ci
npm run dev
```

```bash
npm run build
npm run preview
```

The build produces `dist/`, served as static files by Nginx.

## Deploy to the existing Oracle server

Run in authenticated **OCI Cloud Shell**, not in an SSH session on Ubuntu. Use `exit` first if your prompt is `ubuntu@react-web-server`.

```bash
git clone https://github.com/EuphoriaLux/react-web-server.git
cd react-web-server
bash scripts/deploy.sh
```

If already cloned:

```bash
cd ~/react-web-server
git pull --ff-only
bash scripts/deploy.sh
```

The deployment script reads the IP and original key from `~/react-server-setup`, connects to Ubuntu, installs user-local Node 22, clones this repository, installs dependencies, builds, and publishes to Nginx.

## Infrastructure

`create-react-server.sh` provisions the Always Free ARM instance in `eu-frankfurt-1`:

| Setting | Value |
| --- | --- |
| Region | Frankfurt (`eu-frankfurt-1`) |
| Instance | `react-web-server` |
| Shape | `VM.Standard.A1.Flex`, ARM64 |
| Resources | 1 OCPU, 6 GB RAM, 50 GB boot disk |
| Image | Canonical Ubuntu 24.04 ARM64 |
| Web root | `/var/www/html` |
| Inbound TCP | 22, 80, 443 |

## Product direction

1. Homepage (done) — concept & early-access landing
2. Authentication + parent-pair tenancy
3. Shared calendar & handovers
4. Expense tracking & settlements
5. Structured messaging
6. Secure document vault

## Automatic deployments

GitHub Actions deploy on merge to `main`. See [docs/github-actions.md](docs/github-actions.md).
