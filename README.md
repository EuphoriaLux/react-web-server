# CloudMargin — Azure-first FinOps

A React website for exploring cloud costs and optimization opportunities. The first release focuses on Azure, with AWS, Google Cloud, and OCI reserved for later connectors.

**This is a frontend demo.** All cost/resource/recommendation data is synthetic. No Microsoft authorization, customer authentication, backend database, tenant isolation, or billing imports are implemented. Do not enter confidential information. HTTPS must be configured before real customer onboarding.

## Website features

- Overview with spend metrics, daily chart, service breakdown, and estimated opportunities.
- Cost explorer with service search, subscription/date filters, grouping, and CSV export.
- Optimization recommendations with details, dismiss, and review states.
- Cloud account cards and an Azure onboarding walkthrough that does not collect credentials.
- Three-step demo workspace onboarding and browser-local preferences.
- Editable demo budget and responsive desktop/mobile navigation.

Only workspace name, budget, and recommendation states persist in browser localStorage. There is no actual signup or shared customer workspace. Switching the demo name does not create an isolated tenant.

## Local development

Requires Node 22.12+ (Node 22 recommended) and npm.

```bash
npm ci
npm run dev
```

```bash
npm test
npm run build
npm run preview
```

The build produces `dist/`, served as static files by Nginx. No Node process is needed to serve the built website.

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

The deployment script reads the IP and original key from `~/react-server-setup`, connects to Ubuntu, installs user-local Node 22 using the official NVM project (installer checkout pinned to `v0.40.8`), clones this public repository, installs locked dependencies, runs tests, builds, backs up the previous site, and copies the output to Nginx. It keeps old fingerprinted assets for open browser sessions and replaces `index.html` atomically. The deployment checkout must have no local changes. Backups accumulate under `/var/backups/cloudmargin`; manage retention as the project grows.

It then verifies the CloudMargin entry point locally and externally. Deployment requires outbound GitHub/npm/Node downloads from the VM. No credentials are stored in Git, and the private SSH key is never printed.

## Infrastructure provisioning

`create-react-server.sh` targets:

| Setting | Value |
| --- | --- |
| Region | Frankfurt (`eu-frankfurt-1`), tenancy home region |
| Instance | `react-web-server` |
| Shape | `VM.Standard.A1.Flex`, ARM64 |
| Resources | 1 OCPU, 6 GB RAM, 50 GB boot disk |
| Image | Canonical Ubuntu 24.04 ARM64 |
| Availability | Prefer AD-1; capacity fallback to AD-2/AD-3 |
| Web root | `/var/www/html` |
| Inbound TCP | 22, 80, 443 |

Run provisioning from authenticated Cloud Shell:

```bash
install -m 700 create-react-server.sh "$HOME/create-react-server.sh"
bash "$HOME/create-react-server.sh"
```

The script detects tenancy context, discovers images, reconciles networking, reuses an existing named VM, configures Nginx and the OCI Ubuntu host firewall, and checks HTTP. State is written atomically, older field names are migrated, and a local lock prevents overlapping runs. Ambiguous resources or existing hardware/image mismatches stop execution rather than replacing a server. The first SSH connection records its host key; mismatches remain blocked.

Existing web content is preserved by provisioning. It manages the project route/security rules and default Nginx site, backing up the original default configuration once. The Nginx configuration supports React client-side route fallback.

Before a **new** launch, all discoverable active compartments in the home region are audited against 2 A1 OCPUs, 12 GB RAM, and 200 GB block storage. Inventory failures stop execution. Free eligibility still depends on the whole account, Oracle's current terms, and resource availability; this is not a billing guarantee. This is a small HTTP hosting baseline, not a high-availability production deployment.

## Private Cloud Shell files

```text
~/create-react-server.sh
~/react-server-setup/state.env
~/react-server-setup/server-key
~/react-server-setup/server-key.pub
~/react-server-setup/server-information.txt
```

Directory mode: `700`. Private-key mode: `600`. Keep a secure key backup. Existing servers require the original key; missing keys are not silently replaced.

```bash
ssh -i "$HOME/react-server-setup/server-key" ubuntu@YOUR_PUBLIC_IP
cat ~/react-server-setup/server-information.txt
```

Do not commit keys, OCI credentials, generated state/reports, or `.env` secrets. `.gitignore` does not protect already-tracked files or erase Git history. Frontend bundles are public; future provider credentials must stay in a protected backend.

## Demo-data assumptions

The model uses a fixed synthetic September 2026 dataset and EUR. Subscription allocation is 65% Production, 23% Development, and 12% Shared services. The seven-day view prorates monthly rows by 7/30; it is illustrative, not a real daily billing history. Chart weights are synthetic and reconcile with filtered totals. The prior-period comparison assumes an illustrative 8.3% reduction; the next-month forecast assumes a 7% uplift on normalized monthly spend. Savings are hypothetical monthly estimates, may overlap, and are not realized savings. Budget usage is normalized to a month for partial periods.

## Validation

- Four Node tests cover subscription reconciliation, period/search filtering, grouped/chart totals, and CSV escaping.
- Production Vite build completed successfully.
- Provisioning previously passed two mocked reruns, then the owner verified its existing-server path and HTTP checks in Cloud Shell.
- Browser QA, fresh-provisioning fallback, and the new deployment script have not been live-tested in this environment.

## Next milestones

1. Review the website UX and branding.
2. Configure a domain and HTTPS.
3. Add real authentication, server-side tenant isolation, database, and audit logging.
4. Implement Azure authorization, validated scope selection, read-only ingestion, and import status.
5. Add other providers behind a shared connector/data model.

## Automatic deployments with GitHub Actions

PR previews and production deployments are configured in `.github/workflows/deploy.yml`. Complete the one-time dedicated SSH account/secret setup in [the Actions guide](docs/github-actions.md). Same-repository non-draft PRs get preview paths, fork PRs only run checks, and merges to `main` publish production. No OCI API key is needed.
