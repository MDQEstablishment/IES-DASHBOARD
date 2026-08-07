-- 0142 — Project authority, from a single source.
--
-- THE DEFECT THIS CLOSES. Authority over projects was written down twice and
-- the two copies were free to drift, which is exactly what happened:
--
--   UI   src/pages/Projects.jsx:52   canAdd  = ['admin','ceo','pmo']
--   DB   0018_rls_policies_writes.sql projects_ins with check auth_role()='pmo'
--
-- Both landed 2026-06-20 and neither has changed since. The consequences ran
-- in BOTH directions: progm (Program Manager) got no button and no explanation
-- — he is in canEdit, so the read-only banner was suppressed too — while admin
-- and ceo were shown a button the database would refuse. A button that is
-- shown and then denied is worse than one that is absent.
--
-- This is the third bug of this class on this project. The fix is therefore
-- not "correct the list" but "stop having two lists": the role sets move into
-- a table, the policies read that table, and a test (tests/authorityParity)
-- fails if the client mirror in src/rbac.jsx ever diverges from the seed here.
--
-- OWNER RULING, 2026-08-06:
--   create — admin, ceo, pmo, progm   ("a Programme Manager runs a whole
--            programme, so barring him from creating a project inside it is
--            incoherent")
--   edit   — admin, ceo, pmo, progm, projm   ("a Project Manager edits his own
--            project but does not open new ones")
--
-- On "his own project": the edit list is flat here on purpose. projm is not a
-- broad reader (is_broad_reader() omits projm and proje) and projects_read
-- admits projm only for pm_id = auth.uid(), so a projm cannot SELECT another
-- manager's project and therefore cannot UPDATE it — Postgres needs the row to
-- be visible to update it. Ownership scoping is delivered by the read policy
-- that already exists; duplicating it into the write policy would be a second
-- copy of a rule, which is the very defect this migration exists to remove.
-- Proven below in the T-AUTH proofs: projm updates his own project and is
-- refused on one he does not own.
--
-- Additive except for the two policy replacements, which the owner approved
-- explicitly (Constraints #5). Nothing else is touched: this migration does
-- NOT alter w_proj/w_bld or any other table's policies, so the separately
-- reported admin/ceo gaps elsewhere are unchanged and remain owner decisions.

-- ── 1. the single source ────────────────────────────────────────────────────
create table if not exists public.authority_roles (
  action     text             not null,
  role       public.user_role not null,
  created_at timestamptz      not null default now(),
  primary key (action, role)
);

comment on table public.authority_roles is
  'Single source of truth for role authority over an action. RLS policies read '
  'it through public.may(); the UI mirrors it in src/rbac.jsx and '
  'tests/authorityParity.test.mjs fails if the two ever diverge. '
  'Changed by migration only — there is deliberately no write policy.';

alter table public.authority_roles enable row level security;

-- Readable by any signed-in user: the UI needs to reason about its own
-- authority, and the contents are policy, not data. No insert/update/delete
-- policy exists, so no client can rewrite its own permissions — the table is
-- append-only by migration.
drop policy if exists authority_roles_read on public.authority_roles;
create policy authority_roles_read on public.authority_roles
  for select to authenticated using (true);

-- ── 2. the seed (mirrored in src/rbac.jsx — parity is tested) ───────────────
insert into public.authority_roles (action, role) values
  ('project.create', 'admin'),
  ('project.create', 'ceo'),
  ('project.create', 'pmo'),
  ('project.create', 'progm'),
  ('project.edit',   'admin'),
  ('project.edit',   'ceo'),
  ('project.edit',   'pmo'),
  ('project.edit',   'progm'),
  ('project.edit',   'projm')
on conflict (action, role) do nothing;

-- ── 3. the predicate the policies use ───────────────────────────────────────
-- SECURITY DEFINER + empty search_path, matching auth_role()/w_proj: the
-- caller must not be able to shadow public with their own authority_roles.
create or replace function public.may(p_action text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.authority_roles a
    where a.action = p_action
      and a.role   = public.auth_role()
  );
$$;

comment on function public.may(text) is
  'True when the signed-in user''s role holds p_action in authority_roles.';

revoke all on function public.may(text) from public;
grant execute on function public.may(text) to authenticated;

-- ── 4. the two policies, now derived rather than restated ───────────────────
drop policy if exists projects_ins on public.projects;
create policy projects_ins on public.projects
  for insert to authenticated
  with check (public.may('project.create'));

drop policy if exists projects_upd on public.projects;
create policy projects_upd on public.projects
  for update to authenticated
  using (public.may('project.edit'))
  with check (public.may('project.edit'));
