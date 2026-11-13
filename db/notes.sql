-- Append-only notes. No update or delete is exposed by the API.
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
alter table notes owner to coparents;
