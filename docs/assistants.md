# AI assistants (MCP connector)

Parents can connect Claude, ChatGPT or another assistant that supports MCP to their
CoParents plan. The assistant can then help them set up the app ("onboarding") and do
everyday entry by conversation: "I paid €42 for school shoes, split 50/50".

Address to add in the assistant: **`https://coparent.lu/api/mcp`**

- Claude (claude.ai, desktop, mobile): Settings › Connectors › Add custom connector, paste the address.
- ChatGPT: turn on developer mode in the settings, then add a connector with that address and OAuth sign-in (menu names change often).
- Others (Cursor, VS Code, MCP Inspector): add a remote "Streamable HTTP" server with that address.

The assistant opens a CoParents page. The parent types their email, gets a 6-digit code
by email, types it, and clicks Allow. A code rather than a link, because the link would
often open in another browser (the phone's mail app) than the one the assistant opened.

## How it works

Everything lives in `server/api.py`, so it deploys with the API on every merge.

| Address | What |
| --- | --- |
| `POST /api/mcp` | MCP over Streamable HTTP. Plain JSON answers, no stream, no session. Bearer token only (a browser cookie is never accepted here). |
| `GET /.well-known/oauth-protected-resource[/api/mcp]`, `/api/oauth/protected-resource` | Where to sign in (RFC 9728). |
| `GET /.well-known/oauth-authorization-server`, `/api/oauth/metadata` | The sign-in server (RFC 8414). |
| `POST /api/oauth/register` | Apps register themselves (RFC 7591). Public clients only; PKCE S256 is required. |
| `GET/POST /api/oauth/authorize`, `/api/oauth/email`, `/api/oauth/code` | The pages the parent sees: email, code, Allow. EN/FR/DE by browser language. |
| `POST /api/oauth/token` | Codes for tokens. Access token 1 hour, refresh token 60 days and replaced on each use. |
| `POST /api/oauth/revoke` | Forget a token. |

The `/.well-known/oauth-...` addresses sit outside `/api/`, so nginx must pass them to the
API. That is a one-time step: `bash scripts/setup-assistants.sh` from Cloud Shell. New
installs get it from `scripts/install-postgres.sh`.

Tables: `db/agents.sql` (`oauth_clients`, `oauth_codes`, `oauth_tokens`, `agent_log`).
Only hashes of codes and tokens are stored. Deleting an account deletes its tokens and
its log rows (cascade); the data export lists connected assistants and their changes.

## Tools

The assistant acts as the signed-in parent, on their side of the plan only. Tools write
the same plan JSON the web app syncs (JSON strings per key, the way `JSON.stringify`
writes them), so the other parent's app picks changes up on its next sync.

Onboarding: `get_started` (where the parent is and the next step), `join_waitlist`,
`create_plan` (respects the beta gate), `join_plan`, `get_invite`,
`get_family_details`, `save_family_details` (the four setup screens, and fills the
calendar from the custody rhythm like the app), `confirm_family_details`.

Everyday: `get_calendar`, `set_custody_days`, `add_calendar_event`, `list_expenses`,
`get_balance`, `add_expense`, `mark_expenses_settled`, `list_messages`, `send_message`.

Rules:

- Nothing can be deleted, and locked months cannot change.
- Write tools are marked as such (`readOnlyHint: false`), and their descriptions ask the
  assistant to repeat what it will save and get a yes.
- Every change goes to `agent_log` and to the plan's activity feed as "… (via Claude)".
- Messages keep the quiet hours (7:00 to 21:00 Luxembourg time) unless urgent.
- Per parent: 120 tool calls per 10 minutes, 20 messages per hour.

Not in this version: receipt photos, payments and budget, documents, swaps.

## Privacy

What a parent reads through an assistant goes to that assistant's provider (Anthropic,
OpenAI, ...), under that parent's own account with them. That can include the other
parent's messages and a child's health note. The privacy notice should say so before
beta families are told about the connector.
