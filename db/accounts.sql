-- Accounts: users sign in with an emailed link, sessions live in a cookie.
-- Idempotent. Run after schema.sql and notes.sql.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- One-time sign-in links. Only the hash of the token is stored.
create table if not exists login_tokens (
  token_hash text primary key,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists login_tokens_expires on login_tokens (expires_at);
-- Set when the link was asked for from a phone holding a plan from before accounts.
-- Signing in with the link then moves that plan to the account, on any site address.
alter table login_tokens add column if not exists claim_token_hash text;

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user on sessions (user_id);

-- A member is now a user. token_hash stays only for plans made before accounts,
-- until that parent signs in and claims the plan.
alter table members add column if not exists user_id uuid references users(id) on delete set null;
alter table members alter column token_hash drop not null;
create unique index if not exists members_user on members (user_id) where user_id is not null;

do $$
begin
  if exists (select from pg_roles where rolname = 'coparents') then
    alter table users owner to coparents;
    alter table login_tokens owner to coparents;
    alter table sessions owner to coparents;
  end if;
end
$$;
