-- supabase/migrations/0055_import_bundle_fk_order_fix.sql
-- Sprint 8 (Fix #10 — BLOCKER) — Excel import "Confirm" never committed.
--
-- Root cause: import_project_bundle inserted building_item_scope (scopes) BEFORE
-- the Materials loop, but building_item_scope.material_code is a FK to
-- materials.code. For a NEW project whose scopes cite codes not already in the
-- global catalog, the scope insert raised 23503 (FK violation) and the whole RPC
-- rejected. supabase-js surfaces that as { error } (no JS throw, hence no console
-- error), the modal stays open and nothing is created. The previous MOI-ASIR test
-- only worked because its material codes were already seeded.
--
-- Fix: (1) run the Materials loop FIRST so catalog rows exist before scopes
-- reference them; (2) inside the scopes loop, ensure the referenced material_code
-- exists (auto-provision a minimal stub when a scope cites a code that isn't in
-- the Materials sheet) so the FK can never fail again. Body is otherwise identical
-- to 0050 (project columns incl. reference_no / beneficiary_entity unchanged).

create or replace function public.import_project_bundle(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proj      jsonb := p->'project';
  v_pid       uuid;
  v_bid       uuid;
  v_peid      uuid;
  v_esm_id    uuid;
  v_mcode     text;
  v_n_bld     int := 0;
  v_n_scope   int := 0;
  v_n_mat     int := 0;
  v_next_ord  int;
  r           jsonb;
begin
  if v_proj is null or coalesce(v_proj->>'code','') = '' then
    raise exception 'A Project row with a code is required';
  end if;

  -- 1) Project ----------------------------------------------------------------
  insert into public.projects (code, name, client, region, status, start_date, end_date,
                               total_weeks, pm_id, engineer_id, location_address,
                               location_lat, location_lng, contractor_name, contractor_phone, contractor_email,
                               project_reference_no, beneficiary_entity)
  values (
    v_proj->>'code',
    coalesce(nullif(v_proj->>'name',''), v_proj->>'code'),
    nullif(v_proj->>'client',''),
    nullif(v_proj->>'region',''),
    coalesce(nullif(v_proj->>'status','')::public.project_status, 'draft'),
    nullif(v_proj->>'start_date','')::date,
    nullif(v_proj->>'end_date','')::date,
    nullif(v_proj->>'total_weeks','')::int,
    (select id from public.profiles where lower(email) = lower(nullif(v_proj->>'pm_email','')) limit 1),
    (select id from public.profiles where lower(email) = lower(nullif(v_proj->>'engineer_email','')) limit 1),
    nullif(v_proj->>'address',''),
    nullif(v_proj->>'lat','')::numeric,
    nullif(v_proj->>'lng','')::numeric,
    nullif(v_proj->>'contractor_name',''),
    nullif(v_proj->>'contractor_phone',''),
    nullif(v_proj->>'contractor_email',''),
    nullif(v_proj->>'project_reference_no',''),
    nullif(v_proj->>'beneficiary_entity','')
  )
  returning id into v_pid;

  -- 2) Buildings --------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p->'buildings','[]'::jsonb)) loop
    if coalesce(r->>'building_code','') = '' then continue; end if;
    insert into public.buildings (project_id, code, name, region, location_lat, location_lng,
                                  floors, area_sqm, contractor, contractor_name, contractor_phone,
                                  status_override, remarks, city)
    values (
      v_pid, r->>'building_code',
      coalesce(nullif(r->>'building_name',''), r->>'building_code'),
      nullif(r->>'city',''),
      nullif(r->>'lat','')::numeric, nullif(r->>'lng','')::numeric,
      nullif(r->>'floors','')::int, nullif(r->>'area_sqm','')::numeric,
      nullif(r->>'contractor_name',''), nullif(r->>'contractor_name',''), nullif(r->>'contractor_phone',''),
      coalesce(nullif(r->>'status','')::public.building_status, 'pending'),
      nullif(r->>'remarks',''), nullif(r->>'city','')
    );
    v_n_bld := v_n_bld + 1;
  end loop;

  -- 3) Materials (global catalog; skip existing codes) — MUST run before scopes
  --    so building_item_scope.material_code FK is satisfied.
  for r in select * from jsonb_array_elements(coalesce(p->'materials','[]'::jsonb)) loop
    if coalesce(r->>'material_code','') = '' or coalesce(r->>'esm','') = '' then continue; end if;
    select id into v_esm_id from public.esms where upper(code) = upper(r->>'esm') limit 1;
    if v_esm_id is null then raise exception 'Material references unknown ESM "%"', r->>'esm'; end if;
    if exists (select 1 from public.materials where code = r->>'material_code') then continue; end if;
    insert into public.materials (code, name, esm_id, unit, threshold, brand_spec, planned)
    values (
      r->>'material_code', coalesce(nullif(r->>'description',''), r->>'material_code'),
      v_esm_id, nullif(r->>'unit',''), coalesce(nullif(r->>'threshold','')::int, 0), nullif(r->>'supplier',''), 0
    );
    v_n_mat := v_n_mat + 1;
  end loop;

  -- 4) Building scopes (auto-provision project_esms + any missing material) -----
  for r in select * from jsonb_array_elements(coalesce(p->'scopes','[]'::jsonb)) loop
    if coalesce(r->>'building_code','') = '' or coalesce(r->>'esm','') = '' then continue; end if;
    select id into v_bid from public.buildings where project_id = v_pid and code = r->>'building_code' limit 1;
    if v_bid is null then raise exception 'Scope references unknown building_code "%"', r->>'building_code'; end if;
    select id into v_esm_id from public.esms where upper(code) = upper(r->>'esm') limit 1;
    if v_esm_id is null then raise exception 'Scope references unknown ESM "%"', r->>'esm'; end if;

    select id into v_peid from public.project_esms where project_id = v_pid and esm_id = v_esm_id limit 1;
    if v_peid is null then
      select coalesce(max(ordinal),0) + 1 into v_next_ord from public.project_esms where project_id = v_pid;
      insert into public.project_esms (project_id, esm_id, ordinal) values (v_pid, v_esm_id, v_next_ord) returning id into v_peid;
    end if;

    -- Ensure the referenced material exists so the FK can never fail. A scope may
    -- cite a code that isn't on the Materials sheet (or fall back to ESMn-ITEM);
    -- provision a minimal stub for it, linked to the scope's ESM.
    v_mcode := coalesce(nullif(r->>'material_code',''), upper(r->>'esm') || '-ITEM');
    insert into public.materials (code, name, esm_id, planned)
    values (v_mcode, v_mcode, v_esm_id, 0)
    on conflict (code) do nothing;

    insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty, sub_type_spec)
    values (
      v_bid, v_peid,
      coalesce(nullif(r->>'sub_type',''), 'general'),
      v_mcode,
      coalesce(nullif(r->>'planned_qty','')::int, 0),
      jsonb_strip_nulls(jsonb_build_object('unit', nullif(r->>'unit',''), 'notes', nullif(r->>'notes','')))
    );
    v_n_scope := v_n_scope + 1;
  end loop;

  return jsonb_build_object('project_id', v_pid, 'project_code', v_proj->>'code',
                            'buildings', v_n_bld, 'scopes', v_n_scope, 'materials', v_n_mat);
end $$;

grant execute on function public.import_project_bundle(jsonb) to authenticated;
