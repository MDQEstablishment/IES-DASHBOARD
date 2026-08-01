-- 9K(1b) — project-scope the COC family (CRITICAL C1, part 2 of 5).
--
-- Same hole as 0112, same fix, one extra wrinkle: three of the six tables have
-- no project_id of their own. coc_esms, coc_buildings and coc_covered_buildings
-- hang off a coc_id, so the fence resolves the project through the parent:
--
--     exists (select 1 from public.cocs c
--              where c.id = coc_id and public.can_read_project(c.project_id))
--
-- That subquery reads public.cocs from INSIDE a policy on another table, which
-- is evaluated with the caller's own privileges — and cocs' own read policy is
-- being scoped in this same migration. The two agree by construction: a caller
-- who cannot read the parent COC cannot resolve the parent COC, and is denied.
-- No recursion is possible (cocs' policies never reference the child tables).
--
-- The role arrays are again preserved byte-for-byte. Two distinct arrays exist
-- in this family and both survive intact:
--   {admin,pmo,projm,progm,proje} on cocs, coc_covered_buildings,
--                                  coc_project_settings, coc_beneficiary_assignments
--   {admin,pmo,projm,proje}       on coc_esms, coc_buildings
-- Of those, admin/pmo/progm are broad readers, so can_read_project() is a
-- constant true for them and their permissions do not move. projm and proje are
-- fenced to their own projects.
--
-- THE ONE VISIBLE CHANGE, flagged in the plan and sanctioned in triage: the
-- Dashboard's COC KPI counts (issued / accepted) are a straight count over
-- cocs, so for a projm or proje they now count their own projects instead of
-- the programme. Every broad-reader dashboard is unchanged to the pixel. This
-- is the "hiding other projects' rows" category, not a loss of function.
--
-- What this migration deliberately does NOT do: fence the COC state machine.
-- Scoping tells you WHICH cocs a person may touch; it does not stop them
-- setting status='sent' by hand through the API on a COC that is legitimately
-- theirs. That is 0114.

-- ---------------------------------------------------------------------------
-- cocs — the parent
-- ---------------------------------------------------------------------------
drop policy if exists cocs_read on public.cocs;
create policy cocs_read on public.cocs
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists cocs_write on public.cocs;
create policy cocs_write on public.cocs
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- coc_project_settings / coc_beneficiary_assignments — own project_id
-- ---------------------------------------------------------------------------
drop policy if exists coc_project_settings_read on public.coc_project_settings;
create policy coc_project_settings_read on public.coc_project_settings
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists coc_project_settings_write on public.coc_project_settings;
create policy coc_project_settings_write on public.coc_project_settings
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

drop policy if exists coc_beneficiary_assignments_read on public.coc_beneficiary_assignments;
create policy coc_beneficiary_assignments_read on public.coc_beneficiary_assignments
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists coc_beneficiary_assignments_write on public.coc_beneficiary_assignments;
create policy coc_beneficiary_assignments_write on public.coc_beneficiary_assignments
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- coc_covered_buildings — project resolved through coc_id
-- ---------------------------------------------------------------------------
drop policy if exists coc_covered_buildings_read on public.coc_covered_buildings;
create policy coc_covered_buildings_read on public.coc_covered_buildings
  for select to authenticated
  using (exists (
    select 1 from public.cocs c
     where c.id = coc_covered_buildings.coc_id
       and public.can_read_project(c.project_id)
  ));

drop policy if exists coc_covered_buildings_write on public.coc_covered_buildings;
create policy coc_covered_buildings_write on public.coc_covered_buildings
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.cocs c
                 where c.id = coc_covered_buildings.coc_id
                   and public.can_read_project(c.project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'progm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.cocs c
                 where c.id = coc_covered_buildings.coc_id
                   and public.can_read_project(c.project_id))
  );

-- ---------------------------------------------------------------------------
-- coc_esms / coc_buildings — project resolved through coc_id, narrower array
-- ---------------------------------------------------------------------------
drop policy if exists coc_esms_read on public.coc_esms;
create policy coc_esms_read on public.coc_esms
  for select to authenticated
  using (exists (
    select 1 from public.cocs c
     where c.id = coc_esms.coc_id
       and public.can_read_project(c.project_id)
  ));

drop policy if exists coc_esms_write on public.coc_esms;
create policy coc_esms_write on public.coc_esms
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.cocs c
                 where c.id = coc_esms.coc_id
                   and public.can_read_project(c.project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.cocs c
                 where c.id = coc_esms.coc_id
                   and public.can_read_project(c.project_id))
  );

drop policy if exists coc_buildings_read on public.coc_buildings;
create policy coc_buildings_read on public.coc_buildings
  for select to authenticated
  using (exists (
    select 1 from public.cocs c
     where c.id = coc_buildings.coc_id
       and public.can_read_project(c.project_id)
  ));

drop policy if exists coc_buildings_write on public.coc_buildings;
create policy coc_buildings_write on public.coc_buildings
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.cocs c
                 where c.id = coc_buildings.coc_id
                   and public.can_read_project(c.project_id))
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and exists (select 1 from public.cocs c
                 where c.id = coc_buildings.coc_id
                   and public.can_read_project(c.project_id))
  );
