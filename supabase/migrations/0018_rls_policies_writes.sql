-- supabase/migrations/0018_rls_policies_writes.sql
-- IES Programme Control Platform v2 — Phase 2, migration 18
-- Per-role write policies (INSERT/UPDATE/DELETE) with WITH CHECK ownership.
-- audit_log: NO write policy (trigger-only). No DELETE except building_engineers.

create or replace function public.w_proj(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.auth_role()='pmo'
      or (public.auth_role()='projm' and exists(
            select 1 from public.projects pr where pr.id=p and pr.pm_id=(select auth.uid())));
$$;
create or replace function public.w_bld(b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.w_proj((select project_id from public.buildings where id=b))
      or (public.auth_role()='proje' and exists(
            select 1 from public.building_engineers be
            where be.building_id=b and be.engineer_id=(select auth.uid())));
$$;
grant execute on function public.w_proj(uuid) to authenticated;
grant execute on function public.w_bld(uuid)  to authenticated;

create policy projects_ins on public.projects for insert to authenticated with check (public.auth_role()='pmo');
create policy projects_upd on public.projects for update to authenticated using (public.auth_role()='pmo') with check (public.auth_role()='pmo');

create policy buildings_ins on public.buildings for insert to authenticated with check (public.w_proj(project_id));
create policy buildings_upd on public.buildings for update to authenticated using (public.w_proj(project_id)) with check (public.w_proj(project_id));
create policy project_esms_ins on public.project_esms for insert to authenticated with check (public.w_proj(project_id));
create policy project_esms_upd on public.project_esms for update to authenticated using (public.w_proj(project_id)) with check (public.w_proj(project_id));
create policy esm_doc_status_ins on public.esm_doc_status for insert to authenticated with check (public.w_proj(project_id));
create policy esm_doc_status_upd on public.esm_doc_status for update to authenticated using (public.w_proj(project_id)) with check (public.w_proj(project_id));

create policy rooms_ins on public.rooms for insert to authenticated with check (public.w_bld(building_id));
create policy rooms_upd on public.rooms for update to authenticated using (public.w_bld(building_id)) with check (public.w_bld(building_id));
create policy scope_ins on public.building_item_scope for insert to authenticated with check (public.w_bld(building_id));
create policy scope_upd on public.building_item_scope for update to authenticated using (public.w_bld(building_id)) with check (public.w_bld(building_id));
create policy room_items_ins on public.room_items for insert to authenticated with check (public.w_bld((select building_id from public.rooms where id=room_id)));
create policy room_items_upd on public.room_items for update to authenticated using (public.w_bld((select building_id from public.rooms where id=room_id))) with check (public.w_bld((select building_id from public.rooms where id=room_id)));
create policy documents_ins on public.documents for insert to authenticated with check (public.w_bld(building_id));
create policy documents_upd on public.documents for update to authenticated using (public.w_bld(building_id)) with check (public.w_bld(building_id));

create policy install_log_ins on public.install_log for insert to authenticated
  with check (public.w_bld(building_id) and installed_by_id = (select auth.uid()));
create policy install_log_upd on public.install_log for update to authenticated
  using (public.w_proj((select project_id from public.buildings where id=building_id)) or public.auth_role()='progm')
  with check (public.w_proj((select project_id from public.buildings where id=building_id)) or public.auth_role()='progm');

create policy photos_ins on public.photos for insert to authenticated
  with check (public.w_bld(building_id) and uploaded_by_id = (select auth.uid()));
create policy photos_upd on public.photos for update to authenticated
  using (public.w_bld(building_id)) with check (public.w_bld(building_id));

create policy materials_ins on public.materials for insert to authenticated with check (public.auth_role()='pmo');
create policy materials_upd on public.materials for update to authenticated
  using (public.auth_role() in ('pmo','procm','proco')) with check (public.auth_role() in ('pmo','procm','proco'));

create policy esms_ins on public.esms for insert to authenticated with check (public.auth_role()='pmo');
create policy esms_upd on public.esms for update to authenticated using (public.auth_role()='pmo') with check (public.auth_role()='pmo');

create policy bldeng_ins on public.building_engineers for insert to authenticated
  with check (public.w_proj((select project_id from public.buildings where id=building_id)) or public.auth_role()='progm');
create policy bldeng_upd on public.building_engineers for update to authenticated
  using (public.w_proj((select project_id from public.buildings where id=building_id)) or public.auth_role()='progm')
  with check (public.w_proj((select project_id from public.buildings where id=building_id)) or public.auth_role()='progm');
create policy bldeng_del on public.building_engineers for delete to authenticated
  using (public.w_proj((select project_id from public.buildings where id=building_id)) or public.auth_role()='progm');

create policy tasks_ins on public.tasks for insert to authenticated
  with check (created_by_id=(select auth.uid())
              and (assigned_to_id=(select auth.uid()) or public.is_in_subtree((select auth.uid()), assigned_to_id)));
create policy tasks_upd on public.tasks for update to authenticated
  using (assigned_to_id=(select auth.uid()) or created_by_id=(select auth.uid()) or public.is_in_subtree((select auth.uid()), assigned_to_id))
  with check (assigned_to_id=(select auth.uid()) or created_by_id=(select auth.uid()) or public.is_in_subtree((select auth.uid()), assigned_to_id));

create policy escalations_ins on public.escalations for insert to authenticated
  with check (raised_by_id=(select auth.uid()));
create policy escalations_upd on public.escalations for update to authenticated
  using (raised_to_id=(select auth.uid()) or raised_by_id=(select auth.uid()))
  with check (raised_to_id=(select auth.uid()) or raised_by_id=(select auth.uid()));

create policy profiles_upd on public.profiles for update to authenticated
  using (public.auth_role() in ('pmo','admin')) with check (public.auth_role() in ('pmo','admin'));
