-- 0146 — "Where" becomes membership. The role says WHAT, the PMO says WHERE.
--
-- THE STRUCTURAL DEFECT. One project could not hold many people. There was one
-- pm_id slot and one engineer_id slot per project and nothing at all for procm
-- or proco, so a survey crew of three was inexpressible and the owner's "own
-- project" scope had nothing to resolve against. (The mirror case — one person
-- on many projects — already worked: pm_id has no unique constraint.)
--
-- OWNER RULINGS APPLIED HERE:
--   all projects : admin, ceo, pmo, progm, plane
--   own projects : projm, proje, procm, proco
-- plane is Programme-Manager equivalent (all). ceo writes. The ceo = PMO
-- equivalence is broader than this migration — it also reaches ~20 legacy
-- `auth_role() in (pmo, admin)` policies and the Settings nav — and is handled
-- in its own commit rather than smuggled in here.
--
-- building_engineers IS RETIRED, NOT LEFT LYING AROUND. It had the right shape
-- (PK (building_id, engineer_id)) at the wrong level, held ZERO rows, was
-- written by nothing, and was consulted only for the proje branch of
-- can_read_project / can_read_building / w_bld / building_photos_write. Those
-- four are repointed at project_members and the table is DROPPED. Leaving it
-- in place unused would be a fourth half-built relation — the exact thing this
-- sprint keeps removing. If sub-project scoping is ever needed it returns
-- deliberately, as project_members rows carrying a building_id.

-- ── 1. scope: the second half of an authority row ───────────────────────────
alter table public.authority_roles
  add column if not exists scope text not null default 'all'
    check (scope in ('all', 'own'));

comment on column public.authority_roles.scope is
  'all = the role holds this action on every project; own = only on projects '
  'the person is a member of (project_members).';

-- ── 2. membership ───────────────────────────────────────────────────────────
create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('pm','engineer','surveyor','procurement')),
  added_by    uuid references public.profiles(id),
  added_at    timestamptz not null default now(),
  removed_by  uuid references public.profiles(id),
  removed_at  timestamptz,
  primary key (project_id, user_id, member_role)
);

comment on table public.project_members is
  'Which people are opened to which project. Membership is SOFT-ENDED '
  '(removed_at), never deleted, so "who had access in March" stays answerable.';

create index if not exists project_members_user_live
  on public.project_members (user_id, project_id) where removed_at is null;

alter table public.project_members enable row level security;

-- Everyone signed in may see membership (it is org structure, not data);
-- writing it is administration and comes with the Settings commit.
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members
  for select to authenticated using (true);

-- ── 3. seed membership from the single-slot columns, so nobody loses access ──
insert into public.project_members (project_id, user_id, member_role)
select p.id, p.pm_id, 'pm' from public.projects p
 where p.pm_id is not null
on conflict do nothing;

insert into public.project_members (project_id, user_id, member_role)
select p.id, p.engineer_id, 'engineer' from public.projects p
 where p.engineer_id is not null
on conflict do nothing;

-- ── 4. the authority rows ───────────────────────────────────────────────────
-- plane joins create/edit as a Programme-Manager equivalent.
insert into public.authority_roles (action, role, scope) values
  ('project.create', 'plane', 'all'),
  ('project.edit',   'plane', 'all')
on conflict (action, role) do nothing;

-- projm edits only projects opened to him.
update public.authority_roles set scope = 'own'
 where action = 'project.edit' and role = 'projm';

-- project.write is the DATA-level action: buildings, rooms, survey entries,
-- photos, operating hours, scope lines — everything w_proj/w_bld governed.
insert into public.authority_roles (action, role, scope) values
  ('project.write', 'admin', 'all'),
  ('project.write', 'ceo',   'all'),
  ('project.write', 'pmo',   'all'),
  ('project.write', 'progm', 'all'),
  ('project.write', 'plane', 'all'),
  ('project.write', 'projm', 'own'),
  ('project.write', 'proje', 'own'),
  ('project.write', 'procm', 'own'),
  ('project.write', 'proco', 'own')
on conflict (action, role) do nothing;

-- ── 5. may(): one predicate, both halves ────────────────────────────────────
-- may(action)              -> the role holds it on ALL projects
-- may(action, project_id)  -> ALL, or OWN with a live membership row
create or replace function public.may(p_action text)
returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.authority_roles a
     where a.action = p_action and a.role = public.auth_role() and a.scope = 'all'
  );
$$;

create or replace function public.may(p_action text, p_project uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.authority_roles a
     where a.action = p_action
       and a.role = public.auth_role()
       and ( a.scope = 'all'
             or ( a.scope = 'own'
                  and p_project is not null
                  and exists (
                    select 1 from public.project_members m
                     where m.project_id = p_project
                       and m.user_id = (select auth.uid())
                       and m.removed_at is null)))
  );
$$;

revoke all on function public.may(text) from public, anon;
revoke all on function public.may(text, uuid) from public, anon;
grant execute on function public.may(text) to authenticated;
grant execute on function public.may(text, uuid) to authenticated;

-- ── 6. the access predicates, repointed at membership ───────────────────────
create or replace function public.can_read_project(p uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select public.is_broad_reader()
      or exists (select 1 from public.project_members m
                  where m.project_id = p
                    and m.user_id = (select auth.uid())
                    and m.removed_at is null);
$$;

create or replace function public.can_read_building(b uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select public.can_read_project((select project_id from public.buildings where id = b));
$$;

create or replace function public.w_proj(p uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select public.may('project.write', p);
$$;

create or replace function public.w_bld(b uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select public.w_proj((select project_id from public.buildings where id = b));
$$;

-- ── 7. projects_upd asks about THIS project, not just the role ──────────────
drop policy if exists projects_upd on public.projects;
create policy projects_upd on public.projects
  for update to authenticated
  using (public.may('project.edit', id))
  with check (public.may('project.edit', id));

-- ── 8. the last consumer of building_engineers, repointed ───────────────────
drop policy if exists building_photos_write on public.building_photos;
create policy building_photos_write on public.building_photos
  for all to authenticated
  using (public.w_bld(building_id))
  with check (public.w_bld(building_id));

-- ── 9. retire building_engineers ────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from public.building_engineers;
  if n <> 0 then
    raise exception 'building_engineers holds % row(s) — retirement assumed zero; migrate them first', n;
  end if;
end $$;

drop table public.building_engineers;
