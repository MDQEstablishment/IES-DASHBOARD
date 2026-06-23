-- supabase/migrations/0043_seed_coc_clusters_items.sql
-- IES Programme Control Platform v2 — Sprint 4 (4D seed)
-- Replace the Sprint-3 per-pair seed COCs with a realistic Sprint-4 mix
-- (clustered + per-building) and seed MONG-D-style installed/removed items.

do $$
declare v_proj uuid; v_esm1 uuid; v_esm3 uuid; v_pm uuid; v_b1 uuid; v_coc uuid;
begin
  select id into v_proj from public.projects where code = 'MOI-ASIR';
  if v_proj is null then return; end if;
  select id into v_esm1 from public.esms where code = 'ESM1';
  select id into v_esm3 from public.esms where code = 'ESM3';
  select id into v_pm from public.profiles where role = 'projm' limit 1;
  select id into v_b1 from public.buildings where project_id = v_proj and code = 'MOI-001';

  -- remove the 6 Sprint-3 per-pair seed COCs (junctions cascade)
  delete from public.project_documents where project_id = v_proj and doc_type = 'coc' and name like '%·%';

  -- 1) Clustered COC: all active buildings × AC (ESM3) — approved
  if not exists (select 1 from public.project_documents where project_id = v_proj and name = 'MOI-ASIR-COC-001') then
    insert into public.project_documents (project_id, esm_id, building_id, doc_type, name, revision, version, status, client_reviewer_name, client_response_date, submitted_at, submitted_by)
    values (v_proj, v_esm3, v_b1, 'coc', 'MOI-ASIR-COC-001', 'A','A','approved','Eng. Khalid Al-Mutairi', now()-interval '7 days', now()-interval '20 days', v_pm)
    returning id into v_coc;
    insert into public.coc_buildings select v_coc, b.id from public.buildings b where b.project_id = v_proj and b.status_override <> 'archived';
    insert into public.coc_esms values (v_coc, 'ESM3');
  end if;

  -- 2) Clustered COC: all active buildings × Lighting (ESM1) — submitted
  if not exists (select 1 from public.project_documents where project_id = v_proj and name = 'MOI-ASIR-COC-002') then
    insert into public.project_documents (project_id, esm_id, building_id, doc_type, name, revision, version, status, submitted_at, submitted_by)
    values (v_proj, v_esm1, v_b1, 'coc', 'MOI-ASIR-COC-002', 'A','A','submitted', now()-interval '6 days', v_pm)
    returning id into v_coc;
    insert into public.coc_buildings select v_coc, b.id from public.buildings b where b.project_id = v_proj and b.status_override <> 'archived';
    insert into public.coc_esms values (v_coc, 'ESM1');
  end if;

  -- 3) Per-building COC: MOI-001 × AC (ESM3) — approved (reissue example)
  if not exists (select 1 from public.project_documents where project_id = v_proj and name = 'MOI-ASIR-COC-003') then
    insert into public.project_documents (project_id, esm_id, building_id, doc_type, name, revision, version, status, client_reviewer_name, client_response_date, submitted_at, submitted_by)
    values (v_proj, v_esm3, v_b1, 'coc', 'MOI-ASIR-COC-003', 'A','A','approved','Eng. Sara Al-Ghamdi', now()-interval '5 days', now()-interval '15 days', v_pm)
    returning id into v_coc;
    insert into public.coc_buildings values (v_coc, v_b1);
    insert into public.coc_esms values (v_coc, 'ESM3');
  end if;

  -- 4) Installed items (AC / ESM3) — MONG-D-style
  if not exists (select 1 from public.project_installed_items where project_id = v_proj) then
    insert into public.project_installed_items (project_id, esm_code, item_description, model_code, capacity_value, capacity_unit, efficiency_value, efficiency_unit, total_quantity, notes) values
      (v_proj,'ESM3','Split AC unit','SPL-18K-A', 18000,'kBTU', 15.30,'SEER', 2434, null),
      (v_proj,'ESM3','Window AC unit','WIN-17K-A', 17200,'kBTU', 8.60,'SEER', 37, null),
      (v_proj,'ESM3','Split AC unit (high cap)','SPL-22K-A', 22000,'kBTU', 13.00,'SEER', 556, null),
      (v_proj,'ESM3','Window AC unit (eff)','WIN-18K-B', 18000,'kBTU', 10.00,'SEER', 50, null);
  end if;

  -- 5) Removed items (23 rows, returned to facility) — MONG-D-style
  if not exists (select 1 from public.project_removed_items where project_id = v_proj) then
    insert into public.project_removed_items (project_id, esm_code, item_description, capacity_value, capacity_unit, efficiency_value, efficiency_unit, total_quantity, returned_to_facility, notes)
    select v_proj, 'ESM3', 'Old AC unit type '||g,
           (16000 + g*250)::numeric, 'kBTU',
           round((6.5 + ((g % 5) * 0.9) + 0.45)::numeric, 2), 'SEER',
           (10 + g*3), true, null
    from generate_series(1,23) g;
  end if;
end $$;
