-- 0148 — `user.admin`: the authority behind the Settings people screens.
--
-- 0147 gave ceo pmo's database reach and pmo's nav, including Settings. But
-- Settings self-gated its people section on two INLINE arrays
-- (`['pmo','admin']`), so a ceo would have seen the Settings tab with the user
-- administration hidden inside it — shown-then-denied, inverted. Adding ceo to
-- those arrays would have made them the eighteenth and nineteenth hand-written
-- role lists in the codebase, which is the defect this sprint exists to remove.
--
-- So the gate becomes an authority action instead. It is also the action the
-- admin-users edge function will check, so the Settings screen and the account
-- lifecycle ask the same question of the same source.
--
-- Scope is 'all': administering people is not per-project.

insert into public.authority_roles (action, role, scope) values
  ('user.admin', 'admin', 'all'),
  ('user.admin', 'ceo',   'all'),
  ('user.admin', 'pmo',   'all')
on conflict (action, role) do nothing;

comment on table public.authority_roles is
  'Single source of truth for role authority. `scope` = all (every project) or '
  'own (projects the person is a member of, via project_members). RLS policies '
  'read it through public.may(); src/authority.js mirrors it and '
  'tests/authorityParity.test.mjs fails if the two diverge. Migration-only: a '
  'PMO administers PEOPLE, never the PERMISSION MODEL.';
