-- CoParents household store. Postgres on the Oracle VM, localhost only.
create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  role text not null check (role in ('A', 'B')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  unique (household_id, role)
);

create table if not exists plans (
  household_id uuid primary key references households(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  author text not null check (author in ('A', 'B')),
  channel text not null,
  fact text not null,
  ask text not null default '',
  by_when text not null default '',
  urgent boolean not null default false,
  sent_at timestamptz not null default now(),
  deliver_at timestamptz not null default now()
);

create index if not exists notes_household_channel on notes (household_id, channel, sent_at);

