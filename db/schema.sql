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
