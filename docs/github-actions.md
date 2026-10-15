# GitHub Actions deployment

## Behavior

- Every opened/updated non-draft PR from this repository: test, build, and deploy a preview at `http://YOUR_HOST/previews/pr-N/`.
- Draft and fork PRs: tests/build only; no deployment credentials or server access.
- Closing or merging a same-repository PR: delete that PR's preview.
- Push/merge to `main`: deploy the production root website.
- Manual **Run workflow**: deploy the selected branch as production. Choose `main` for normal releases.

The preview URL is shown in the Actions job summary. There is no PR comment bot. A failed build blocks deployment. Builds and SSH deployment run in separate jobs; the deploy job does not check out or execute application source. Official GitHub actions are pinned to commit SHAs. No `pull_request_target` or self-hosted runner is used.

## One-time setup in Cloud Shell

```bash
cd ~/react-web-server
git pull --ff-only
bash scripts/install-gh.sh
export PATH="$HOME/.local/bin:$PATH"
gh auth login --hostname github.com --git-protocol https --web
bash scripts/setup-github-deploy.sh
```

This generates a new, dedicated RSA 4096 key (compatible with Cloud Shell FIPS mode) without printing its private contents, installs the forced-command receiver on Ubuntu, and creates a `cloudmargin-deploy` account. The account has no sudo grant. Its SSH key disables forwarding, PTY, and arbitrary commands. The account owns the static web root so it can deploy files without privileged shell access. Your original Ubuntu administrator key stays separate.

The receiver accepts only `deploy production`, `deploy pr-N`, and `remove pr-N`. It rejects traversal, symlinks, special archive files, unexpected root paths, and excessive payload sizes. It backs up the previous production entry point (last 10), preserves existing hashed assets, and replaces the HTML entry point atomically. Preview files are public, share the website origin, and are for trusted demo changes only; they are not isolated customer environments. Do not use them for secrets or real customer data. Deleting preview files does not clear browser-local demo preferences.

The script reads the server host public key through your existing trusted administrator SSH connection. Actions pins this key and never uses an unauthenticated `ssh-keyscan` during deployment.

### Configure GitHub without printing private keys

If `gh` is installed and authenticated, setup uploads configuration automatically:

- Secret `DEPLOY_SSH_KEY`: dedicated private key.
- Secret `DEPLOY_KNOWN_HOSTS`: pinned server host key.
- Actions variable `DEPLOY_HOST`: server public IP or hostname.

If not authenticated, run:

```bash
gh auth login --hostname github.com --git-protocol https --web
bash scripts/setup-github-deploy.sh
```

If `gh` is unavailable, run `bash scripts/install-gh.sh` and `export PATH="$HOME/.local/bin:$PATH"`. The installer downloads the official Linux release for the Cloud Shell architecture and verifies its SHA-256 checksum before installing it to `~/.local/bin/gh`, without sudo. Then authenticate as above. Alternatively, use Cloud Shell's file-download menu to download `~/react-server-setup/github-actions-key` and `~/react-server-setup/github-known-hosts`, and add their contents directly in **Repository Settings → Secrets and variables → Actions → Secrets**. Set `DEPLOY_HOST` under **Variables**. Never paste private keys into chat, commit them, or put them in a repository variable. Treat downloaded private-key copies as credentials.

Once configured, the CLI path is:

```bash
gh workflow run deploy.yml --repo EuphoriaLux/react-web-server --ref main
gh run list --repo EuphoriaLux/react-web-server --workflow deploy.yml --limit 5
```

To inspect a failure:

```bash
gh run view --repo EuphoriaLux/react-web-server --log-failed
```

The workflow reports missing configuration explicitly. The first push that adds the workflow may fail before secrets are set; rerun it after setup.

## Operational limits

HTTP is currently used because the site's TLS/domain configuration is still pending. GitHub-to-server deployment uses SSH encryption and host-key validation. Preview code executes in the browser on the same origin as production; only trusted repository contributors should receive preview deployment access. Public forks never auto-deploy. Restrict repository write access and review workflow changes.

Production/index backups and assets are not full infrastructure backups. Old hashed assets accumulate; add retention as the site grows. Keep manual deployments and Actions deployments from running simultaneously. The existing Nginx static setup serves preview subdirectories without a reload; application base paths are built per PR. Real application URL routing is not implemented yet.

The bootstrap script and receiver need to be installed on the VM before CI can connect. If the public IP or host key changes, update the configuration using the trusted bootstrap path again.

## Validation

Receiver tests verify command restrictions, traversal/link rejection, preview isolation from the production entry point, cleanup, and production entry-point backup. YAML and shell syntax are validated locally. Live Actions/SSH execution requires the one-time setup in your authenticated Cloud Shell.

### FIPS compatibility

The setup uses RSA 4096 for the dedicated client key and pins the server RSA host public key, retrieved over the existing trusted administrator SSH session. It does not enable deprecated SHA-1 `ssh-rsa` signatures or disable FIPS. Existing private keys are preserved; an existing incompatible key must be handled explicitly rather than silently rotated.
