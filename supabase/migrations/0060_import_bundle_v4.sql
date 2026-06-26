-- supabase/migrations/0060_import_bundle_v4.sql
-- Sprint 8C — import_project_bundle v4. Extends v3 (0058) with:
--   #2  buildings.building_type
--   #3  buildings.elec_meter_no / elec_subscription_no / elec_account_no,
--       responsible_person_name / responsible_person_phone
--   #5  buildings.operating_hours
--   #6  projects.pm_name / engineer_name (display overrides; *_email stays the
--       identity/permission source of truth)
--   #1  optional project-level coc_bundle_key — when provided, ESM1 + ESM2 are
--       grouped under it (the rare "lighting pair" case); blank → each ESM
--       standalone (the new default).
-- Everything else is identical to v3 (FK-ordered materials→scopes, stub-ensure,
-- engineer resolution, name_ar passthrough, Items pairing).

create or replace function public.import_project_bundle(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proj       jsonb := p->'project';
  v_pid        uuid;
  v_bid        uuid;
  v_peid       uuid;
  v_esm_id     uuid;
  v_esm_code   text;
  v_mcode      text;
  v_pm_id      uuid;
  v_eng_proj   uuid;
  v_eng_id     uuid;
  v_eng_name   text;
  v_inst_id    uuid;
  v_rem_id     uuid;
  v_bundle     text := nullif(v_proj->>'coc_bundle_key','');
  v_n_bld      int := 0;
  v_n_scope    int := 0;
  v_n_mat      int := 0;
  v_n_pair     int := 0;
  v_next_ord   int;
  r            jsonb;
begin
  if v_proj is null or coalesce(v_proj->>'code','') = '' then
    raise exception 'A Project row with a code is required';
  end if;

  v_pm_id    := (select id from public.profiles where lower(email) = lower(nullif(v_proj->>'pm_email','')) limit 1);
  v_eng_proj := (select id from public.profiles where lower(email) = lower(nullif(v_proj->>'engineer_email','')) limit 1);

  insert into public.projects (code, name, client, region, status, start_date, end_date,
                               total_weeks, pm_id, engineer_id, pm_name, engineer_name, location_address,
                               location_lat, location_lng, contractor_name, contractor_phone, contractor_email,
                               project_reference_no, beneficiary_entity,
                               doc_rev, contract_sign_date, works_end_date, energy_services_company, subcontractor, coc_layout)
  values (
    v_proj->>'code',
    coalesce(nullif(v_proj->>'name',''), v_proj->>'code'),
    nullif(v_proj->>'client',''),
    nullif(v_proj->>'region',''),
    coalesce(nullif(v_proj->>'status','')::public.project_status, 'draft'),
    nullif(v_proj->>'start_date','')::date,
    nullif(v_proj->>'end_date','')::date,
    nullif(v_proj->>'total_weeks','')::int,
    v_pm_id, v_eng_proj,
    nullif(v_proj->>'pm_name',''), nullif(v_proj->>'engineer_name',''),
    nullif(v_proj->>'address',''),
    nullif(v_proj->>'lat','')::numeric,
    nullif(v_proj->>'lng','')::numeric,
    nullif(v_proj->>'contractor_name',''),
    nullif(v_proj->>'contractor_phone',''),
    nullif(v_proj->>'contractor_email',''),
    nullif(v_proj->>'project_reference_no',''),
    nullif(v_proj->>'beneficiary_entity',''),
    coalesce(nullif(v_proj->>'doc_rev',''), '00'),
    nullif(v_proj->>'contract_sign_date','')::date,
    nullif(v_proj->>'works_end_date','')::date,
    coalesce(nullif(v_proj->>'energy_services_company',''), 'Tarshid'),
    nullif(v_proj->>'subcontractor',''),
    coalesce(nullif(v_proj->>'coc_layout','')::public.coc_layout, 'concatenated')
  )
  returning id into v_pid;

  for r in select * from jsonb_array_elements(coalesce(p->'buildings','[]'::jsonb)) loop
    if coalesce(r->>'building_code','') = '' then continue; end if;
    v_eng_id := (select id from public.profiles where lower(email) = lower(nullif(r->>'assigned_engineer_email','')) limit 1);
    if v_eng_id is null then v_eng_id := v_eng_proj; end if;
    v_eng_name := (select full_name from public.profiles where id = v_eng_id);

    insert into public.buildings (project_id, code, name, name_ar, region, location_lat, location_lng,
                                  floors, area_sqm, contractor, contractor_name, contractor_phone,
                                  assigned_engineer_id, engineer_name, status_override, remarks, city,
                                  building_type, elec_meter_no, elec_subscription_no, elec_account_no,
                                  responsible_person_name, responsible_person_phone, operating_hours)
    values (
      v_pid, r->>'building_code',
      coalesce(nullif(r->>'building_name',''), r->>'building_code'),
      nullif(r->>'arabic_name',''),
      nullif(r->>'city',''),
      nullif(r->>'lat','')::numeric, nullif(r->>'lng','')::numeric,
      nullif(r->>'floors','')::int, nullif(r->>'area_sqm','')::numeric,
      coalesce(nullif(r->>'contractor_name',''), nullif(v_proj->>'contractor_name','')),
      coalesce(nullif(r->>'contractor_name',''), nullif(v_proj->>'contractor_name','')),
      coalesce(nullif(r->>'contractor_phone',''), nullif(v_proj->>'contractor_phone','')),
      v_eng_id, v_eng_name,
      coalesce(nullif(r->>'status','')::public.building_status, 'pending'),
      nullif(r->>'remarks',''), nullif(r->>'city',''),
      nullif(r->>'building_type',''), nullif(r->>'elec_meter_no',''), nullif(r->>'elec_subscription_no',''),
      nullif(r->>'elec_account_no',''), nullif(r->>'responsible_person_name',''),
      nullif(r->>'responsible_person_phone',''), nullif(r->>'operating_hours','')::int
    );
    v_n_bld := v_n_bld + 1;
  end loop;

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

  for r in select * from jsonb_array_elements(coalesce(p->'scopes','[]'::jsonb)) loop
    if coalesce(r->>'building_code','') = '' or coalesce(r->>'esm','') = '' then continue; end if;
    select id into v_bid from public.buildings where project_id = v_pid and code = r->>'building_code' limit 1;
    if v_bid is null then raise exception 'Scope references unknown building_code "%"', r->>'building_code'; end if;
    v_esm_code := upper(r->>'esm');
    select id into v_esm_id from public.esms where upper(code) = v_esm_code limit 1;
    if v_esm_id is null then raise exception 'Scope references unknown ESM "%"', r->>'esm'; end if;

    select id into v_peid from public.project_esms where project_id = v_pid and esm_id = v_esm_id limit 1;
    if v_peid is null then
      select coalesce(max(ordinal),0) + 1 into v_next_ord from public.project_esms where project_id = v_pid;
      insert into public.project_esms (project_id, esm_id, ordinal, coc_bundle_key)
      values (v_pid, v_esm_id, v_next_ord,
              case when v_bundle is not null and v_esm_code in ('ESM1','ESM2') then v_bundle else null end)
      returning id into v_peid;
    end if;

    v_mcode := coalesce(nullif(r->>'material_code',''), v_esm_code || '-ITEM');
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

  for r in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    if coalesce(r->>'esm','') = '' then continue; end if;
    if coalesce(nullif(r->>'old_description',''), nullif(r->>'new_description',''),
               nullif(r->>'old_code',''), nullif(r->>'new_code','')) is null then continue; end if;

    insert into public.project_removed_items (project_id, esm_code, item_description, total_quantity, returned_to_facility, notes)
    values (
      v_pid, upper(r->>'esm'),
      coalesce(nullif(r->>'old_description',''), nullif(r->>'old_code',''), 'Old item'),
      coalesce(nullif(r->>'old_qty','')::int, 1), true,
      nullif(r->>'notes','')
    ) returning id into v_rem_id;

    insert into public.project_installed_items (project_id, esm_code, item_description, model_code, total_quantity, capacity_unit, notes)
    values (
      v_pid, upper(r->>'esm'),
      coalesce(nullif(r->>'new_description',''), nullif(r->>'new_code',''), 'New item'),
      nullif(r->>'new_code',''),
      coalesce(nullif(r->>'new_qty','')::int, 1),
      coalesce(nullif(r->>'unit',''), 'kBTU'),
      nullif(r->>'notes','')
    ) returning id into v_inst_id;

    insert into public.project_item_pairs (project_id, esm_code, installed_item_id, removed_item_id, notes)
    values (v_pid, upper(r->>'esm'), v_inst_id, v_rem_id,
            nullif(concat_ws(' · ', nullif(r->>'building_code',''), nullif(r->>'notes','')), ''));
    v_n_pair := v_n_pair + 1;
  end loop;

  return jsonb_build_object('project_id', v_pid, 'project_code', v_proj->>'code',
                            'buildings', v_n_bld, 'scopes', v_n_scope, 'materials', v_n_mat, 'pairs', v_n_pair);
end $$;

grant execute on function public.import_project_bundle(jsonb) to authenticated;
