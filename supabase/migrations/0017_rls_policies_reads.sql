-- supabase/migrations/0017_rls_policies_reads.sql
-- IES Programme Control Platform v2 — Phase 2, migration 17
-- Per-role SELECT policies. All TO authenticated (anon gets nothing).
-- Scope helpers keep the row predicates DRY + auditable.

create or replace function public.is_broad_reader()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.auth_role() in ('ceo','pmo','procm','proco','progm','plane');
$$;
comment on function public.is_broad_reader() is 'Roles with design scope:all — read all business rows.';

create or replace function public.can_read_project(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_broad_reader()
    or (public.auth_role()='projm' and exists(
          select 1 from public.projects pr where pr.id=p and pr.pm_id=(select auth.uid())))
    or (public.auth_role()='proje' and exists(
          select 1 from public.buildings b
          join public.building_engineers be on be.building_id=b.id
          where b.project_id=p and be.engineer_id=(select auth.uid())));
$$;

create or replace function public.can_read_building(b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_broad_reader()
    or (public.auth_role()='projm' and exists(
          select 1 from public.buildings bl join public.projects pr on pr.id=bl.project_id
          where bl.id=b and pr.pm_id=(select auth.uid())))
    or (public.auth_role()='proje' and exists(
          select 1 from public.building_engineers be
          where be.building_id=b and be.engineer_id=(select auth.uid())));
$$;

grant execute on function public.is_broad_reader()        to authenticated;
grant execute on function public.can_read_project(uuid)   to authenticated;
grant execute on function public.can_read_building(uuid)  to authenticated;

create policy profiles_read     on public.profiles     for select to authenticated using (true);
create policy esms_read         on public.esms         for select to authenticated using (true);
create policy project_esms_read on public.project_esms for select to authenticated using (true);
create policy materials_read    on public.materials    for select to authenticated using (true);

create policy projects_read on public.projects for select to authenticated
  using (public.can_read_project(id));
create policy buildings_read on public.buildings for select to authenticated
  using (public.can_read_building(id));
create policy rooms_read on public.rooms for select to authenticated
  using (public.can_read_building(building_id));
create policy building_item_scope_read on public.building_item_scope for select to authenticated
  using (public.can_read_building(building_id));
create policy room_items_read on public.room_items for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and public.can_read_building(r.building_id)));
create policy install_log_read on public.install_log for select to authenticated
  using (public.can_read_building(building_id));
create policy photos_read on public.photos for select to authenticated
  using (public.can_read_building(building_id));
create policy documents_read on public.documents for select to authenticated
  using (public.can_read_building(building_id));
create policy esm_doc_status_read on public.esm_doc_status for select to authenticated
  using (public.can_read_project(project_id));
create policy building_engineers_read on public.building_engineers for select to authenticated
  using (public.is_broad_reader() or engineer_id = (select auth.uid()));
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.auth_role() in ('ceo','pmo','procm','progm','plane')
    or assigned_to_id = (select auth.uid())
    or created_by_id  = (select auth.uid())
    or public.is_in_subtree((select auth.uid()), assigned_to_id)
    or public.is_in_subtree((select auth.uid()), created_by_id)
  );
create policy escalations_read on public.escalations for select to authenticated
  using (
    public.auth_role() in ('ceo','pmo','procm','progm','plane')
    or raised_by_id = (select auth.uid())
    or raised_to_id = (select auth.uid())
  );
create policy audit_log_read on public.audit_log for select to authenticated
  using (public.auth_role() in ('pmo','ceo'));
