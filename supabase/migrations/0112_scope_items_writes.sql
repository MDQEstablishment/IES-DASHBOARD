-- 9K(1a) — project-scope the item family (CRITICAL C1, part 1 of 5).
--
-- THE HOLE. Every write policy on the five item tables reads, in full:
--
--     auth_role() = ANY (ARRAY['admin','pmo','projm','proje'])
--
-- A role check and nothing else. `projm` is not "the project manager of THIS
-- project", it is "anyone whose profile row says projm" — so the programme's
-- one projm could delete another project manager's installed-item register, and
-- any project engineer could rewrite scope on a project they have never been
-- assigned a building in. The UI never offers that, which is exactly why it went
-- unnoticed: the fence was drawn in React, not in Postgres, and PostgREST is a
-- public API.
--
-- THE FIX, and why it is this shape. Every policy below keeps its role array
-- BYTE-FOR-BYTE and appends one conjunct:
--
--     and public.can_read_project(project_id)
--
-- can_read_project() already exists and already encodes the programme's
-- visibility rule: true unconditionally for the seven broad roles
-- (ceo, pmo, procm, proco, progm, plane, admin), true for a projm on a project
-- they are pm_id of, true for a proje on a project they hold a building
-- assignment in. So for admin and pmo — the only broad roles in these arrays —
-- the added conjunct is a constant true and the policy is unchanged. Nobody
-- gains a permission; nobody loses a role. Two roles gain a project fence, which
-- is the whole point.
--
-- Reads are scoped the same way (owner decision, flag 1 of the plan). Leaving
-- reads global while writes are fenced would be half a fix: the register would
-- still be readable programme-wide through the API by a projm with no claim to
-- it. The visible consequence is stated plainly: a projm or proje browsing a
-- project they have no claim to now sees an empty item register instead of a
-- populated one. That is the sanctioned "hiding other projects' rows" change —
-- no legitimate user loses sight of anything on a project that is theirs.
--
-- project_control_links is in this family and this migration closes the
-- "actor-check control_links" item of the triage: its insert trigger already
-- pins linked items to NEW.project_id, so scoping the policy to the actor's own
-- projects is the remaining half of that guard.
--
-- NOTE ON `to` CLAUSES: three of these policies are granted to `authenticated`
-- and two to `public`. That asymmetry is pre-existing and is reproduced exactly
-- — this migration changes qualifications, not grants.

-- ---------------------------------------------------------------------------
-- project_item_pairs  (to authenticated)
-- ---------------------------------------------------------------------------
drop policy if exists project_item_pairs_read on public.project_item_pairs;
create policy project_item_pairs_read on public.project_item_pairs
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists project_item_pairs_write on public.project_item_pairs;
create policy project_item_pairs_write on public.project_item_pairs
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- project_installed_items  (to authenticated)
-- ---------------------------------------------------------------------------
drop policy if exists project_installed_items_read on public.project_installed_items;
create policy project_installed_items_read on public.project_installed_items
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists project_installed_items_write on public.project_installed_items;
create policy project_installed_items_write on public.project_installed_items
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- project_removed_items  (to authenticated)
-- ---------------------------------------------------------------------------
drop policy if exists project_removed_items_read on public.project_removed_items;
create policy project_removed_items_read on public.project_removed_items
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists project_removed_items_write on public.project_removed_items;
create policy project_removed_items_write on public.project_removed_items
  for all to authenticated
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- project_other_installed_items  (to public — reproduced as found)
-- ---------------------------------------------------------------------------
drop policy if exists project_other_installed_items_read on public.project_other_installed_items;
create policy project_other_installed_items_read on public.project_other_installed_items
  for select to public
  using (public.can_read_project(project_id));

drop policy if exists project_other_installed_items_write on public.project_other_installed_items;
create policy project_other_installed_items_write on public.project_other_installed_items
  for all to public
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- project_control_links  (to public — reproduced as found)
-- ---------------------------------------------------------------------------
drop policy if exists project_control_links_read on public.project_control_links;
create policy project_control_links_read on public.project_control_links
  for select to public
  using (public.can_read_project(project_id));

drop policy if exists project_control_links_write on public.project_control_links;
create policy project_control_links_write on public.project_control_links
  for all to public
  using (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  )
  with check (
    auth_role() = ANY (ARRAY['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role])
    and public.can_read_project(project_id)
  );
