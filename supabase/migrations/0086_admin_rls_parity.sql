-- 8U Issue 2: the System Admin role was never added to the broad-reader / project-writer
-- helpers, so admin could not read ANY building via RLS (buildings_read → can_read_building
-- → is_broad_reader). The COCs headline count comes from a SECURITY DEFINER RPC (bypasses
-- RLS), which is why the count showed 709 while the building detail page found nothing.
-- CREATE OR REPLACE keeps every dependent policy bound (same signature/definer/search_path).
create or replace function public.is_broad_reader()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select public.auth_role() in ('ceo','pmo','procm','proco','progm','plane','admin');
$function$;

create or replace function public.w_proj(p uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select public.auth_role() in ('pmo','admin')
      or (public.auth_role()='projm' and exists(
            select 1 from public.projects pr where pr.id=p and pr.pm_id=(select auth.uid())));
$function$;
