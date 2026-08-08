-- 0145 — Archiving a person actually revokes their access.
--
-- THE GAP. Settings tells the owner, in the archive confirmation: "They lose
-- access immediately." They did not. `profiles.archived` was read by NO access
-- function — not auth_role, is_broad_reader, can_read_project,
-- can_read_building, w_proj, w_bld or may. An archived person whose credentials
-- still worked kept their full role authority. The screen described a control
-- that did not exist, which is the worst kind of gap: the owner reads it and
-- believes it.
--
-- THE FIX AT ONE POINT. auth_role() returns null for an archived profile.
-- Every predicate in this system is built on auth_role(), so a null role fails
-- may(), w_proj(), is_broad_reader() and the read paths uniformly — deny
-- cascades from a single line. The alternative, adding `and not archived` in
-- eight places, is eight places that can drift apart, which is the defect this
-- sprint keeps removing.
--
-- WHAT THIS DELIBERATELY DOES NOT BREAK.
--   * profiles_read is `using (true)`, so an archived user can still read their
--     own profile row. That is intentional: the app needs to load far enough to
--     say "your account is deactivated" rather than hang on a null profile or
--     show an empty shell. The UI half of this change lives in src/App.jsx.
--   * profiles_archive_cascade is SECURITY DEFINER and clears the JWT claims
--     before its rewiring updates, so it is unaffected by the caller's role.
--   * Edge functions on the service role bypass RLS entirely and are unaffected.
--
-- A CONSEQUENCE WORTH NAMING, not fixed here. profiles_upd is
-- auth_role() in (pmo, admin), so a PMO who archives themselves immediately
-- loses the ability to un-archive themselves. The last-administrator guard
-- that prevents this is Commit 4 of the people-and-access plan, and it must
-- count ACCEPTED administrators, not invited ones. Until it lands, archiving
-- the only PMO strands the instance.

create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path to ''
as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
     and p.archived = false;
$$;

comment on function public.auth_role() is
  'The signed-in user''s role, or NULL when their profile is archived. Every '
  'access predicate is built on this, so archiving denies by cascade from one '
  'place rather than by a repeated `and not archived`. See 0145.';
