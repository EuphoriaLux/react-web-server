# Privacy notice and account deletion

The notice is at `https://coparent.lu/#privacy`, in EN, FR, DE and LB. Its text is in `src/privacy-copy.js`, and the operator's name and contact address are at the top of that file. It is a plain-language draft, not legal advice. Have a lawyer read it before a public launch, and have a native speaker check the Luxembourgish.

Keep the notice true when the app changes. The facts it states:

| Notice says | Where it comes from |
| --- | --- |
| Session cookie, 60 days | `SESSION_TTL` in `server/api.py` |
| Sign-in links work once, 15 minutes, deleted a day after expiry | `LOGIN_TTL` and `_auth_request` |
| Server logs about 14 days | journald `MaxRetentionSec=14day` (set by `scripts/update-api.sh`), Ubuntu's nginx logrotate (daily, 14 kept) |
| Nightly backups kept 14 days on the same server | `/etc/cron.d/coparents-backup` (`scripts/install-postgres.sh`) |
| Processors: Oracle Cloud (Frankfurt), Brevo (sign-in email), Microsoft 365 (the privacy@coparent.lu mailbox) | Hosting, `COPARENTS_SMTP_HOST`, coparent.lu MX record |
| No other company sees a visit | Fonts are bundled with the app (`@fontsource-variable/*`), no analytics, no external scripts |

Adding analytics, an external script or font, another email or hosting provider, or keeping data longer means updating the notice first.

## Account deletion

Signed-in parents open **Privacy & account** in the share bar. They can download their data (`GET /api/account/export`, one JSON file with the account, the plan and its notes) and delete their account (`POST /api/account/delete` with `{"confirm": "<their email>"}`).

Deleting removes the user, their sessions and their sign-in links at once. What happens to the shared plan:

- **The other parent is still in the plan:** the plan stays with them, with everything both parents entered. It is their record too, and deleting it would destroy the other parent's calendar, expenses and messages. The leaving parent's seat is freed and the invite code changes, so the old code (which the leaving parent knows) stops working. The remaining parent's app picks up the new code on its next sync. A new parent can join with the new code and takes the free seat.
- **No other parent in the plan:** the plan, its notes and everything in it are deleted.

What the leaving parent wrote stays in a kept plan, including their first name in the family details. The notice says so and tells them to ask the other parent, or the operator, to remove something specific.

The browser copy is removed on the phone that deleted the account. Other phones that were signed in remove it the next time they open the app, because their session no longer exists.

## Backups and restoring

Nightly dumps in `/var/backups/coparents-*.sql.gz` are kept 14 days, so deleted data leaves the backups within 14 days.

Each deletion writes the user and plan ids, never the email, to the `account_deletions` table (kept 30 days) and to the API log. If a backup is ever restored, delete those accounts again.

Before restoring, if the database still runs, save the list:

```bash
sudo -u postgres psql -d coparents -c "\copy account_deletions to '/tmp/deletions.csv' csv"
```

If the database is gone, rebuild the list from the log instead:

```bash
sudo journalctl -u coparents-api --since "15 days ago" | grep 'account deleted'
```

After restoring, load the list and delete again. Sign-in links hold the email and are not tied to the user row, so they go first:

```bash
sudo -u postgres psql -d coparents -c "\copy account_deletions from '/tmp/deletions.csv' csv"
sudo -u postgres psql -d coparents -c "delete from households where id in (select household_id from account_deletions where household_deleted); delete from login_tokens where email in (select email from users where id in (select user_id from account_deletions)); delete from members where user_id in (select user_id from account_deletions); delete from users where id in (select user_id from account_deletions);"
```

A restored plan that was kept by the other parent gets back its old invite code. Change it if that matters:

```bash
sudo -u postgres psql -d coparents -c "update households set code = upper(substr(md5(random()::text), 1, 6)) where id in (select household_id from account_deletions where not household_deleted);"
```
