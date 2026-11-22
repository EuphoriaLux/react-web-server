# Accounts and sign-in

Parents sign in with a link sent to their email. There are no passwords.

1. The parent enters an email address. The API stores a one-time token (hashed) and emails a link to `COPARENTS_APP_URL/?login=…`.
2. Opening the link signs them in. The link works once and expires after 15 minutes.
3. The session is an `HttpOnly`, `SameSite=Lax` cookie that lasts 60 days. It is marked `Secure` when `COPARENTS_APP_URL` starts with `https://`.
4. A signed-in parent creates the shared plan, then gives the 6-character code to the other parent, who signs in and joins with it. A plan holds two parents, and an account belongs to one plan.

Limits: 3 sign-in emails per address per 15 minutes, 10 per network address per hour, and 8 code attempts per account per hour.

## Plans made before accounts

Phones that created or joined a plan before this change hold a device token. They keep syncing with it. When that parent asks for a sign-in link from that phone, the plan moves to their account as soon as they open the link, even if the link opens on a different site address. The old token then stops working.

Signing out removes the shared plan from the phone. It stays in the account.

## Server setup

Run from Oracle Cloud Shell, as with the other scripts. The domain's DNS A record must already point at the VM.

```bash
cd ~/react-web-server && git pull --ff-only
bash scripts/update-api.sh
bash scripts/setup-https.sh
```

`setup-https.sh` gets a free Let's Encrypt certificate for `coparent.lu` and `www.coparent.lu`, serves the app on `https://coparent.lu`, sends `www` and plain http there, and renews on its own. The plain `http://<ip>/` site keeps working for PR previews. Sign-in needs https, because the session cookie is `Secure`.

`update-api.sh` adds the account tables, restarts the API, and creates `/etc/coparents/app.env` on the VM if it is missing:

```
COPARENTS_APP_URL=https://coparent.lu
COPARENTS_MAIL_FROM=
COPARENTS_SMTP_HOST=
COPARENTS_SMTP_PORT=587
COPARENTS_SMTP_USER=
COPARENTS_SMTP_PASSWORD=
```

Set the mail server from Cloud Shell:

```bash
bash scripts/set-mail.sh
```

It asks for the sender address, the SMTP login and the SMTP key (hidden as you paste), writes them to `/etc/coparents/app.env` on the VM, restarts the API and sends a test sign-in email. The defaults fit Brevo (`smtp-relay.brevo.com`, port 587). Any provider with STARTTLS works: `SMTP_HOST=… SMTP_PORT=… bash scripts/set-mail.sh`. The sender's domain must be verified with the provider, which means adding its DNS records.

Until the mail settings are filled in, no email is sent. The link is written to the API log instead, which is enough to test:

```bash
sudo journalctl -u coparents-api -n 20 | grep 'sign-in link'
```

Merging to `main` now updates the API before the web app (see docs/github-actions.md). Run `update-api.sh` by hand only if that job is not set up or failed.

## Moving to another domain

Point the new name's DNS A record at the VM, then:

```bash
REDIRECT_FROM=coparents.powerup.lu bash scripts/setup-https.sh coparent.lu www.coparent.lu
```

The first name becomes the app's address and `COPARENTS_APP_URL`. The other names, and every name in `REDIRECT_FROM`, forward to it with their path, so old bookmarks and unopened sign-in links still work. Keep the old name's DNS record for as long as it should forward.

Plans and accounts live on the server and are not affected. Browsers keep sign-in per address, so a parent who was signed in on the old address signs in once more on the new one. Update the sender address in `/etc/coparents/app.env` when mail is set up.

## Local development

```bash
createdb cptest
psql cptest -f db/schema.sql -f db/accounts.sql -f db/receipts.sql
DATABASE_URL=postgresql:///cptest python3 server/api.py   # prints sign-in links
npm run dev                                               # proxies /api to the API
```

Tests (they empty every table, so use a throwaway database):

```bash
DATABASE_URL=postgresql:///cptest python3 -m unittest server/test_api.py
```
