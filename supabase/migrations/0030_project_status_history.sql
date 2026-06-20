-- supabase/migrations/0030_project_status_history.sql
-- IES Programme Control Platform v2 — Phase 4, migration 30
-- Immutable history of project status transitions, captured by trigger. The app
-- sets status_changed_by / status_changed_at / status_change_reason in the same
-- UPDATE, so the trigger records an atomic, attributed transition.

alter table public.projects
  add column if not exists status_change_reason text;

create table if not exists public.project_status_history (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_by   uuid references public.profiles(id),
  changed_at   timestamptz not null default now(),
  reason       text
);

create index if not exists project_status_history_project_idx
  on public.project_status_history (project_id, changed_at desc);

alter table public.project_status_history enable row level security;
drop policy if exists project_status_history_select on public.project_status_history;
create policy project_status_history_select on public.project_status_history
  for select to authenticated using (true);
-- no insert/update/delete policy: only the SECURITY DEFINER trigger writes here.

create or replace function public.log_project_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.project_status_history (project_id, from_status, to_status, changed_by, changed_at, reason)
    values (
      new.id,
      old.status::text,
      new.status::text,
      coalesce(new.status_changed_by, auth.uid()),
      coalesce(new.status_changed_at, now()),
      new.status_change_reason
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_project_status_change on public.projects;
create trigger trg_log_project_status_change
  after update of status on public.projects
  for each row execute function public.log_project_status_change();
