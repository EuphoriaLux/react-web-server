# Private beta

During the beta, anyone can sign in, and anyone can join a plan with the other
parent's code. Only approved email addresses can **create** a new plan.

People ask to join with the form at the bottom of the home page
(`/#beta`). Each sign-up is stored in the `beta_signups` table (`db/beta.sql`).

## Everyday commands (Oracle Cloud Shell)

```bash
cd ~/react-web-server && git pull --ff-only
bash scripts/beta.sh notify you@example.com     # once: where new sign-ups are emailed
bash scripts/beta.sh list                       # who is waiting, who is approved
bash scripts/beta.sh users                      # everyone with an account: joined, last sign-in, plan
bash scripts/beta.sh approve anna@example.com   # lets them create a plan and emails the invitation
bash scripts/beta.sh approve anna@example.com de    # invitation in German (en, fr, de, lb)
bash scripts/beta.sh remove anna@example.com    # takes them off the list
bash scripts/beta.sh gate off                   # end the beta: everyone may create plans
```

`users` is read-only. It prints to your Cloud Shell only, never to the public
Actions logs. "Last sign-in" is the latest sign-in link used, session or AI
assistant connection still on record (expired sessions are cleaned up, so it can
show `-` for someone who has not been back in a long while). Plan join codes are
not shown.

`approve` also works for someone who never filled in the form, for example a
family you invite directly. Their invitation is sent in French unless you name
a language.

Invitations come from the sign-in sender address. Replies go to the `notify`
address.

## Privacy

The privacy notice lists the waitlist (consent, kept until the beta ends or the
person asks to be removed). Deleting an account deletes its waitlist entry, and
the data download includes it.
