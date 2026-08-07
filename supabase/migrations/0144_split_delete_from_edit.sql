-- 0144 — Soft-delete stops travelling inside "edit".
--
-- THE DEFECT. Soft-delete is an UPDATE of projects.deleted_at, so when 0142
-- widened projects_upd from pmo to five roles, it silently handed project
-- deletion to admin, ceo, progm and projm as well. The owner's ruling covered
-- EDITING. Removing a project from everyone's view is a materially larger act
-- than correcting a field, and DeleteProjectModal's own error text still reads
-- "you may not have permission (PMO only)" — evidence of the original intent,
-- left behind by a policy change that did not notice what it was granting.
--
-- An UPDATE column must not silently carry a destructive power.
--
-- OWNER RULING 2026-08-07: delete = admin, ceo, pmo. It does not travel with
-- edit. That narrows today's effective set from five roles to three.
--
-- WHY A TRIGGER AND NOT A POLICY. RLS grants per command, not per column, so
-- projects_upd cannot distinguish "set name" from "set deleted_at". A BEFORE
-- UPDATE trigger can, and it fences the transition in both directions —
-- deleting AND restoring — because an un-delete is equally consequential.
-- The check runs on the transition, not the value, so an ordinary edit that
-- happens to touch an already-deleted row is unaffected.
--
-- NOT IN THIS MIGRATION, DELIBERATELY: the `plane` role addition. The owner
-- instructed it, but Settings' own Roles & Permissions screen describes the
-- Planning Engineer as schedule, progress and delay analysis — not a Programme
-- Manager equivalent — and that contradiction is with him, unresolved. Same
-- for ceo: that screen says portfolio-wide READ with no write actions, and the
-- database agrees, so ceo's write grants are contested too. ceo is carried
-- here only because it already holds project.edit from 0142; this migration
-- does not widen ceo, it narrows everyone. If ceo is ruled read-only, it drops
-- from project.edit and project.delete in one change.

-- ── 1. the new action, from the same single source ──────────────────────────
insert into public.authority_roles (action, role) values
  ('project.delete', 'admin'),
  ('project.delete', 'ceo'),
  ('project.delete', 'pmo')
on conflict (action, role) do nothing;

-- ── 2. the fence ────────────────────────────────────────────────────────────
create or replace function public.projects_guard_soft_delete()
returns trigger
language plpgsql
security invoker           -- must see the CALLER's role, not the owner's
set search_path to ''
as $$
begin
  -- only the deleted_at transition is policed; every other column is edit.
  if new.deleted_at is distinct from old.deleted_at then
    if not public.may('project.delete') then
      raise exception
        'Deleting or restoring a project requires project.delete authority'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.projects_guard_soft_delete() is
  'Separates soft-delete from edit: projects_upd governs the row, this governs '
  'the deleted_at transition in both directions. See 0144.';

drop trigger if exists projects_guard_soft_delete on public.projects;
create trigger projects_guard_soft_delete
  before update on public.projects
  for each row execute function public.projects_guard_soft_delete();
