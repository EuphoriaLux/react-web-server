-- Private beta: people who asked to join, and who may create a new plan.
-- Idempotent. Run after accounts.sql.
create table if not exists beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (email = lower(email)),
  first_name text not null default '',
  lang text not null default 'en',
  children smallint,
  care text not null default '',
  other_parent text not null default '',
  -- When they ticked "you may contact me about the beta". Null for people
  -- invited directly, who never filled in the form.
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  invited_at timestamptz
);
create index if not exists beta_signups_waiting on beta_signups (created_at) where approved_at is null;

do $$
begin
  if exists (select from pg_roles where rolname = 'coparents') then
    alter table beta_signups owner to coparents;
  end if;
end
$$;
