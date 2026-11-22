-- Receipt photos, one row per photo. Idempotent. Run after schema.sql.
-- The phone shrinks each photo before upload; the API refuses anything over 900 KB
-- and caps each plan's photos (see RECEIPT_* in server/api.py).
-- Deleted with the plan (cascade), so account deletion needs no extra step.
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  uploaded_by text not null check (uploaded_by in ('A', 'B')),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists receipts_household on receipts (household_id);
-- Set when a saved plan no longer points at the photo (removed while offline, a failed
-- delete, an upload whose expense was lost). Such photos are deleted after 7 days.
alter table receipts add column if not exists unreferenced_since timestamptz;

do $$
begin
  if exists (select from pg_roles where rolname = 'coparents') then
    alter table receipts owner to coparents;
  end if;
end
$$;
