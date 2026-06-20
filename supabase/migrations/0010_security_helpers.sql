-- supabase/migrations/0010_security_helpers.sql
-- IES Programme Control Platform v2 — Phase 2, migration 10 of 15
-- SECURITY DEFINER helpers shared by the audit trigger (0011) and all RLS (0017+).
-- They intentionally bypass RLS so RLS policies that call them do NOT recurse on
-- public.profiles (Flag A ruling). search_path is pinned to '' with every object
-- fully qualified — standard hardening against search_path hijacking for
-- SECURITY DEFINER functions.

-- Role of the current authenticated user.
create or replace function public.auth_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;
comment on function public.auth_role() is
  'Role of the current authenticated user. SECURITY DEFINER: bypasses RLS on profiles so RLS policies can call it without recursion (Flag A).';

-- Full profile row of the current authenticated user (name/role/manager).
create or replace function public.auth_profile()
returns public.profiles
language sql stable security definer set search_path = ''
as $$
  select p.* from public.profiles p where p.id = (select auth.uid());
$$;
comment on function public.auth_profile() is
  'Full profile row of the current authenticated user. Used by the audit trigger for actor denormalisation. SECURITY DEFINER by design.';

-- True if p_report sits below p_manager in the manager_id org tree.
create or replace function public.is_in_subtree(p_manager uuid, p_report uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive chain(id, manager_id) as (
    select id, manager_id from public.profiles where id = p_report
    union all
    select pr.id, pr.manager_id
    from public.profiles pr
    join chain c on pr.id = c.manager_id
  )
  select exists (select 1 from chain where id = p_manager)
     and p_manager is distinct from p_report;
$$;
comment on function public.is_in_subtree(uuid, uuid) is
  'True if p_report is below p_manager in the manager_id org tree (down-only assignment + team-scope checks). SECURITY DEFINER by design.';

grant execute on function public.auth_role()               to authenticated;
grant execute on function public.auth_profile()            to authenticated;
grant execute on function public.is_in_subtree(uuid, uuid) to authenticated;
