-- AI assistants (Claude, ChatGPT and others) connected over MCP with OAuth.
-- Idempotent. Run after accounts.sql. See docs/assistants.md.
-- Everything here hangs off a user or a plan, so deleting an account removes it (cascade).

-- Apps that registered themselves (OAuth dynamic client registration). Public clients:
-- no secret, PKCE is required instead.
create table if not exists oauth_clients (
  client_id text primary key,
  name text not null default '',
  redirect_uris jsonb not null,
  created_at timestamptz not null default now()
);

-- One-time codes from the "Allow" page. Only the hash is stored. Ten minutes.
create table if not exists oauth_codes (
  code_hash text primary key,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  redirect_uri text not null,
  challenge text not null,
  scope text not null default '',
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Access tokens (one hour) and refresh tokens (60 days, replaced on each use).
create table if not exists oauth_tokens (
  token_hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  client_id text not null references oauth_clients(client_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  scope text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists oauth_tokens_user on oauth_tokens (user_id);
create index if not exists oauth_tokens_expires on oauth_tokens (expires_at);

-- Every change an assistant made, so either parent can see what was done and by which app.
create table if not exists agent_log (
  id bigserial primary key,
  household_id uuid references households(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  client_name text not null default '',
  tool text not null,
  summary text not null default '',
  at timestamptz not null default now()
);
create index if not exists agent_log_household on agent_log (household_id, at);

do $$
begin
  if exists (select from pg_roles where rolname = 'coparents') then
    alter table oauth_clients owner to coparents;
    alter table oauth_codes owner to coparents;
    alter table oauth_tokens owner to coparents;
    alter table agent_log owner to coparents;
  end if;
end
$$;
