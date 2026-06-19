-- supabase/migrations/0014_install_log_immutable_guard.sql
-- IES Programme Control Platform v2 — Phase 2, migration 14 of 15
-- Column-level immutability for the append-only install_log (Flag 4).
-- First adds the QA-approval columns (approved_by_id, approved_at) that the
-- spec marks mutable; then a BEFORE UPDATE guard that rejects changes to any
-- quantity/provenance column. Only qa_status, approved_by_id, approved_at,
-- updated_at may change post-insert.

alter table public.install_log
  add column approved_by_id uuid references public.profiles (id) on delete set null,
  add column approved_at    timestamptz;

comment on column public.install_log.approved_by_id is 'QA reviewer who set qa_status to approved/rejected. Mutable post-insert.';
comment on column public.install_log.approved_at    is 'When QA status was set. Mutable post-insert.';

create or replace function public.install_log_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.entry_date, new.building_id, new.room_id, new.scope_id,
      new.qty, new.source, new.photos, new.installed_by_id, new.note, new.created_at)
     is distinct from
     (old.id, old.entry_date, old.building_id, old.room_id, old.scope_id,
      old.qty, old.source, old.photos, old.installed_by_id, old.note, old.created_at)
  then
    raise exception
      'install_log is append-only: only qa_status/approved_by_id/approved_at may change (immutable column edit attempted on row %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.install_log_immutable_guard() is
  'BEFORE UPDATE guard: quantity/provenance columns are immutable. Note: a rejected update aborts the txn, so by design it produces no audit_log row — the clean exception is the record of the attempt.';

create trigger install_log_immutable_columns_guard
  before update on public.install_log
  for each row execute function public.install_log_immutable_guard();
