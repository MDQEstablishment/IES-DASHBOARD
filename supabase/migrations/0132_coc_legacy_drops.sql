-- COC Builder, unit 5 of 5 — the dead objects go, and a card that could never
-- move starts moving.
--
-- Units 1-4 left a list of objects that the builder retired but did not remove,
-- because Constraint 5 said additive-only until the owner signed off. He has.
-- This is the destructive commit, and it is deliberately the last one: every
-- drop below is of something with zero readers, and the greps and dependency
-- checks that establish that are in this file rather than in a transcript.
--
-- WHAT GOES, AND WHY IT IS SAFE
--
--   coc_plan_preview(uuid)      the old plan. Replaced by coc_pool + the
--   coc_plan_row(uuid,...)      builder. Zero callers in src/ (verified by
--                               grep in the same commit) and zero database
--                               dependents.
--   default_coc_plan(uuid)      expanded projects.coc_layout x coc_bundle_key
--                               into a proposed certificate set. The builder
--                               composes rectangles by hand, so there is no
--                               "default plan" left to compute.
--   projects.coc_layout         the legacy layout driver. Its form control went
--                               in an earlier sprint; its last two readers go
--                               in this commit.
--   coc_buildings, coc_esms     the pre-0079 document model. 0 rows, no writer,
--                               FK to project_documents. Their ONLY reader was
--                               the view rewritten below.
--
-- WHAT STAYS, on the design's own instruction (§3.5): coc_project_settings.
-- layout_mode and project_esms.coc_bundle_key. Nothing reads them either, but
-- they hold data, dropping them frees nothing, and coc_bundle_key is still
-- WRITTEN by import_project_bundle from the template. Gratuitous drops are how
-- you lose something you turn out to need.
--
-- Also left standing: the `coc_layout` ENUM TYPE. The column goes; the type is
-- not on the owner's list and an unused enum costs nothing.
--
-- ---------------------------------------------------------------------------
-- ONE MORE REWRITE THAN PLANNED, AND THE PRE-CHECK IS WHY
--
-- The first attempt at this migration aborted on its own pre-check:
--
--     P0001: Still referenced by function(s): generate_cocs
--
-- 0131 left a legacy fallback in generate_cocs — `coalesce(p_rows,
-- coc_plan_preview(p_project_id))` — so the function nobody calls without rows
-- still CALLED the planner nobody calls at all. Nothing had been dropped: the
-- pre-check is the first statement in the file and the transaction rolled back
-- whole. That is the check earning its place; a plain DROP would have
-- succeeded, because Postgres does not record dependencies on function bodies
-- for sql/plpgsql functions, and generate_cocs would have started failing at
-- runtime the first time anyone called it with a null p_rows.
--
-- Section 2b below rewrites generate_cocs with that fallback replaced by an
-- explicit refusal. Everything else in the body is 0131's, unchanged.
--
-- ---------------------------------------------------------------------------
-- THE CARD THAT COULD NEVER MOVE (§8, promoted into this commit)
--
-- The Dashboard's "COCs Signed" ring reads v_project_doc_progress with
-- doc_type='coc' and divides SUM(approved_count) by SUM(expected_count) across
-- active projects. Both halves of that fraction were computed from the dead
-- model: expected from default_coc_plan, approved by joining project_documents
-- to coc_esms — a table with no writer since 0079. The card has therefore read
-- 0 of 0 for every day the platform has been live, no matter how many
-- certificates TARSHID approved. It was not stale; it was disconnected.
--
-- The COC branch now reads the pool and the claims. ONLY the COC branch
-- changes; the material_submittal / method_statement / mir / wir branches are
-- reproduced verbatim, and the view keeps its column names, types, order and
-- its security_invoker setting.
--
-- GRAIN, AND A DELIBERATE DEPARTURE FROM "COUNT LINEAGES BY STATUS".
-- The brief for this commit said to count non-superseded lineages by status.
-- The numerator can be counted that way; the DENOMINATOR cannot. Once
-- default_coc_plan is gone there is no lineage-grained notion of "expected" at
-- all — the builder lets one certificate cover every building or one cover
-- each, so the number of certificates a project *ought* to have is not a
-- quantity the data defines. That is precisely why the design retired the
-- default plan.
--
-- What the data does define, and what the card's own description already
-- claims to show ("building x ESM coverage"), is PAIRS. So both halves are
-- pair-grained:
--
--   expected_count   pairs in the pool for this ESM — every (building, ESM)
--                    with planned scope on an in-scope, non-archived building
--   submitted_count  those pairs whose claiming lineage has left draft
--   approved_count   those whose lineage head is approved or
--                    accepted_with_comments (the legacy branch counted
--                    'approved_with_comments' the same way)
--   rejected_count   those whose lineage head is rejected
--
-- A ratio whose numerator and denominator are different units is a broken
-- card; matching the grain is worth more than matching the brief's phrasing.
-- The behavioural proof at the bottom drives a real certificate through the
-- shipped RPCs and asserts the card moves from 0 of 1 to 1 of 1.
--
-- coc_pool is called once per project in a CTE rather than once per output row
-- — default_coc_plan was called per row, so this is strictly less work.

-- ---------------------------------------------------------------------------
-- 0. before anything is dropped: prove nothing in the database still reads it
-- ---------------------------------------------------------------------------
-- Function bodies are NOT tracked in pg_depend for sql/plpgsql functions, so a
-- DROP would succeed and leave a runtime break behind. This block reads the
-- bodies. It runs BEFORE the drops and again, implicitly, through the plain
-- (non-CASCADE) DROPs below: any dependency the catalogue does track aborts
-- the migration rather than being silently removed.
-- Line comments are stripped before matching: a comment that NAMES a dropped
-- object is documentation, not a dependency, and the rewritten bodies below
-- deliberately say what they no longer call.
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname not in ('default_coc_plan', 'coc_plan_preview', 'coc_plan_row',
                           'import_project_bundle', 'generate_cocs')
     and regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') ~*
         '\m(coc_plan_preview|coc_plan_row|default_coc_plan|coc_buildings|coc_esms|coc_layout)\M';
  if v_bad is not null then
    raise exception 'Still referenced by function(s): % — resolve before dropping', v_bad;
  end if;
  raise notice 'PRE-CHECK: no function outside the five being rewritten references the dropped objects';
end $$;

-- ---------------------------------------------------------------------------
-- 1. the view — COC branch rewritten, every other branch verbatim
-- ---------------------------------------------------------------------------
create or replace view public.v_project_doc_progress
with (security_invoker = true) as
 with esm_kinds as (
         select pe.project_id,
            e.id as esm_id,
            e.code as esm_code,
            k.doc_type
           from project_esms pe
             join esms e on e.id = pe.esm_id
             cross join ( values ('material_submittal'::text), ('method_statement'::text), ('mir'::text), ('wir'::text), ('coc'::text)) k(doc_type)
          where pe.archived = false
        ),
      coc_agg as (
         select pr.project_id,
            p.esm_code,
            count(*)::integer as expected_count,
            count(*) filter (where p.claim_coc is not null and p.claim_status <> 'draft'::text) as submitted_count,
            count(*) filter (where p.claim_status = any (array['approved'::text, 'accepted_with_comments'::text])) as approved_count,
            count(*) filter (where p.claim_status = 'rejected'::text) as rejected_count
           from ( select distinct esm_kinds.project_id from esm_kinds) pr
             cross join lateral public.coc_pool(pr.project_id) p
          group by pr.project_id, p.esm_code
        )
 select ek.project_id,
    ek.esm_code,
    ek.doc_type,
        case ek.doc_type
            when 'material_submittal'::text then 1
            when 'method_statement'::text then 1
            when 'mir'::text then null::integer
            when 'wir'::text then null::integer
            when 'coc'::text then coalesce(ca.expected_count, 0)
            else null::integer
        end as expected_count,
        case
            when ek.doc_type = 'coc'::text then coalesce(ca.submitted_count, 0::bigint)
            else ( select count(*) as count
               from project_documents d
              where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type)
        end as submitted_count,
        case
            when ek.doc_type = 'coc'::text then coalesce(ca.approved_count, 0::bigint)
            else ( select count(*) as count
               from project_documents d
              where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type and (d.status = any (array['approved'::text, 'approved_with_comments'::text])))
        end as approved_count,
        case
            when ek.doc_type = 'coc'::text then coalesce(ca.rejected_count, 0::bigint)
            else ( select count(*) as count
               from project_documents d
              where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type and d.status = 'rejected'::text)
        end as rejected_count
   from esm_kinds ek
     left join coc_agg ca on ca.project_id = ek.project_id and ca.esm_code = ek.esm_code;

comment on view public.v_project_doc_progress is
  'Per (project, ESM, doc_type) document progress. The coc branch is pair-grained and reads coc_pool + coc_claims (0130/0129); every other branch reads project_documents as before.';

-- ---------------------------------------------------------------------------
-- 2. import_project_bundle — stop writing coc_layout, keep accepting the key
-- ---------------------------------------------------------------------------
-- The template's coc_layout column is dropped from the generator in this same
-- commit, but templates already on people's laptops still carry it, and a
-- browser holding an older bundle of the app still sends it. The function
-- therefore ACCEPTS AND IGNORES the key rather than rejecting it: an import
-- that worked yesterday works today and simply stops setting a column that no
-- longer exists. coc_bundle_key is untouched — that column stays.
create or replace function public.import_project_bundle(p jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
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

  -- coc_layout deliberately absent: the column is gone and the key, if the
  -- caller still sends one, is ignored.
  insert into public.projects (code, name, client, region, status, start_date, end_date,
                               total_weeks, pm_id, engineer_id, pm_name, engineer_name, location_address,
                               location_lat, location_lng, contractor_name, contractor_phone, contractor_email,
                               project_reference_no, beneficiary_entity,
                               doc_rev, contract_sign_date, works_end_date, energy_services_company, subcontractor)
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
    nullif(v_proj->>'subcontractor','')
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
end $function$;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 2b. generate_cocs — the legacy plan fallback removed
-- ---------------------------------------------------------------------------
-- BYTE-IDENTICAL TO 0131 EXCEPT FOR ONE THING. 0131 opened with
--
--     v_rows := coalesce(p_rows, <the legacy planner>(p_project_id));
--
-- so a call with no rows fell back to the plan this migration deletes. No
-- caller has ever used that path: the shipped wizard passed explicit rows
-- (CocGenerateWizard.jsx:107 before unit 4) and the builder passes exactly one
-- composed rectangle (CocBuilder.jsx). The fallback is replaced by a named
-- refusal rather than a silent behaviour change, so a caller that did somehow
-- omit p_rows gets told why instead of generating something nobody composed.
--
-- The guard sits with the other validations, BEFORE the fence GUC is raised —
-- the two lines above it are the same shape, and raising a transaction-scoped
-- capability flag for a call that immediately returns would be sloppy even
-- though PostgREST gives every call its own transaction. Everything from
-- `perform set_config` onward is 0131's body unchanged.
create or replace function public.generate_cocs(p_project_id uuid, p_rows jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rows    jsonb;
  v_row     jsonb;
  v_i       int;
  v_proj    record;
  v_seq     int;
  v_try_seq int;
  v_id      uuid;
  v_code    text;
  v_esm     text[];
  v_bids    uuid[];
  v_created uuid[] := '{}';
  v_errors  jsonb  := '[]'::jsonb;
  v_pool    jsonb  := '{}'::jsonb;
  v_bad     jsonb;
  v_names   text[];
  v_claimed jsonb;
  v_con     text;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- Load-bearing for the coc_pool call below: see the header.
  if not public.can_read_project(p_project_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select id, code into v_proj from projects where id = p_project_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_project'); end if;
  -- There is no default plan any more. Composing the rectangle is the caller's
  -- job, so a call with no rows is a caller error, not an invitation to invent
  -- certificates.
  if p_rows is null then
    return jsonb_build_object('ok', false, 'error', 'rows_required');
  end if;

  perform set_config('app.coc_rpc', 'on', true);

  v_rows := p_rows;

  -- Eligibility, read once from the single source of truth (0130), indexed as
  -- '<building_id>|<esm_code>'. Claims do not affect readiness, so one read at
  -- the top stays correct for every row in the batch.
  select coalesce(jsonb_object_agg(p.building_id::text || '|' || p.esm_code,
           jsonb_build_object('ready', p.ready, 'planned', p.planned, 'installed', p.installed)),
         '{}'::jsonb)
    into v_pool
  from public.coc_pool(p_project_id) p;

  select coalesce(max(seq), 0) into v_seq from cocs where project_id = p_project_id;

  for v_row, v_i in
    select t.val, (t.ord - 1)::int
      from jsonb_array_elements(v_rows) with ordinality as t(val, ord)
  loop
    -- Unchanged from 0083/0114: a row the planner already matched to a live
    -- certificate is skipped, not failed. Not an error; not reported as one.
    if v_row->>'exists_coc_id' is not null then continue; end if;

    v_esm  := array(select jsonb_array_elements_text(v_row->'esm_codes'));
    v_bids := array(select (jsonb_array_elements_text(v_row->'building_ids'))::uuid);
    if coalesce(array_length(v_esm, 1), 0) = 0 or coalesce(array_length(v_bids, 1), 0) = 0 then
      continue;
    end if;

    -- (a) every pair must be in the pool AND ready
    select coalesce(jsonb_agg(jsonb_build_object(
             'building_id', x.bid,
             'esm_code',    x.ecode,
             'planned',     coalesce((v_pool -> (x.bid::text || '|' || x.ecode) ->> 'planned')::bigint, 0),
             'installed',   coalesce((v_pool -> (x.bid::text || '|' || x.ecode) ->> 'installed')::bigint, 0)
           ) order by x.bid, x.ecode), '[]'::jsonb)
      into v_bad
    from (
      select t1.bid, t2.ecode
        from unnest(v_bids) as t1(bid)
        cross join unnest(v_esm) as t2(ecode)
    ) x
    where coalesce((v_pool -> (x.bid::text || '|' || x.ecode) ->> 'ready')::boolean, false) is not true;

    if jsonb_array_length(v_bad) > 0 then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('row', v_i, 'error', 'not_ready', 'pairs', v_bad));
      continue;
    end if;

    -- (b) one certificate, one beneficiary
    select array_agg(distinct a.beneficiary_name) into v_names
      from coc_beneficiary_assignments a
     where a.project_id = p_project_id
       and a.building_id = any (v_bids)
       and a.beneficiary_name is not null;

    if coalesce(array_length(v_names, 1), 0) > 1 then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('row', v_i, 'error', 'mixed_beneficiary', 'names', to_jsonb(v_names)));
      continue;
    end if;

    -- (c) create it, claims and all, or none of it
    v_try_seq := v_seq + 1;
    v_id      := gen_random_uuid();
    v_code    := v_proj.code || '-COC-' || lpad(v_try_seq::text, 3, '0');
    begin
      insert into cocs (id, project_id, seq, code, reference_no, esm_bundle, esm_codes,
                        revision, root_coc_id, status, created_by)
      values (v_id, p_project_id, v_try_seq, v_code, v_code, array_to_string(v_esm, '+'), v_esm,
              1, v_id, 'draft', auth.uid());

      insert into coc_covered_buildings (coc_id, building_id)
      select distinct v_id, t.bid from unnest(v_bids) as t(bid);

      insert into coc_claims (project_id, building_id, esm_code, root_coc_id)
      select distinct p_project_id, t1.bid, t2.ecode, v_id
        from unnest(v_bids) as t1(bid)
        cross join unnest(v_esm) as t2(ecode);

      -- last: a variable assignment survives a subtransaction rollback, so a
      -- failed row must not have advanced the certificate number.
      v_seq     := v_try_seq;
      v_created := v_created || v_id;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con = 'coc_claims_pkey' then
        -- after the rollback, so these are the claims that were already there
        select coalesce(jsonb_agg(jsonb_build_object(
                 'building_id', cc.building_id,
                 'esm_code',    cc.esm_code,
                 'claim_root',  cc.root_coc_id) order by cc.building_id, cc.esm_code), '[]'::jsonb)
          into v_claimed
          from coc_claims cc
         where cc.building_id = any (v_bids)
           and cc.esm_code    = any (v_esm);
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('row', v_i, 'error', 'already_claimed', 'pairs', v_claimed));
      else
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('row', v_i, 'error', 'conflict', 'constraint', v_con));
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'created', coalesce(array_length(v_created, 1), 0),
    'coc_ids', to_jsonb(v_created),
    'errors', v_errors);
end $function$;

-- 3. the drops — plain, never CASCADE, so a missed dependency aborts loudly
-- ---------------------------------------------------------------------------
drop function if exists public.coc_plan_preview(uuid);
drop function if exists public.coc_plan_row(uuid, uuid[], text[], text[]);
drop function if exists public.default_coc_plan(uuid);

alter table public.projects drop column if exists coc_layout;

drop table if exists public.coc_esms;
drop table if exists public.coc_buildings;

-- ---------------------------------------------------------------------------
-- POST-CHECK — the objects are gone and nothing broke on the way out
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('coc_plan_preview', 'coc_plan_row', 'default_coc_plan');
  if n <> 0 then raise exception 'FAIL: % legacy function(s) survived', n; end if;

  select count(*) into n from information_schema.tables
   where table_schema = 'public' and table_name in ('coc_buildings', 'coc_esms');
  if n <> 0 then raise exception 'FAIL: % legacy table(s) survived', n; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'projects' and column_name = 'coc_layout';
  if n <> 0 then raise exception 'FAIL: projects.coc_layout survived'; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'coc_project_settings' and column_name = 'layout_mode';
  if n <> 1 then raise exception 'FAIL: coc_project_settings.layout_mode should have been KEPT'; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'project_esms' and column_name = 'coc_bundle_key';
  if n <> 1 then raise exception 'FAIL: project_esms.coc_bundle_key should have been KEPT'; end if;

  -- The pre-check ran with five functions excused because they were about to
  -- be rewritten. Now that they have been, run the same scan with NO exclusion
  -- list at all: nothing anywhere in public may still reference the dropped
  -- objects. This is the assertion that would have caught the generate_cocs
  -- fallback even if the pre-check had not.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') ~*
         '\m(coc_plan_preview|coc_plan_row|default_coc_plan|coc_buildings|coc_esms|coc_layout)\M';
  if n <> 0 then
    raise exception 'FAIL: % function(s) still reference a dropped object after the rewrites', n;
  end if;

  raise notice 'POST-CHECK: three functions, two tables and one column dropped; layout_mode and coc_bundle_key kept; zero remaining references anywhere in public';
end $$;

-- ---------------------------------------------------------------------------
-- PROOF — the "COCs Signed" card MOVES
-- ---------------------------------------------------------------------------
-- Behavioural, not textual: it drives one real certificate through the shipped
-- RPCs and reads the card's own arithmetic — SUM(approved_count) over
-- SUM(expected_count) from v_project_doc_progress where doc_type='coc',
-- restricted to ACTIVE projects, exactly as Dashboard.jsx:86-90 computes it —
-- at each step. Before this migration that fraction was 0/0 for any data set,
-- because both halves came from tables with no writer.
do $$
declare
  v_pmo uuid; v_mat text;
  v_proj uuid := gen_random_uuid();
  v_b uuid; v_pe uuid; v_s uuid; v_il uuid; v_coc uuid;
  v_ids uuid[] := '{}';
  v_res jsonb;
  x bigint; y bigint; n bigint;
  c_proj bigint; c_bld bigint; c_pe bigint; c_bis bigint; c_il bigint;
  c_coc bigint; c_claim bigint; c_ccb bigint; c_audit bigint;
begin
  select count(*) into c_proj  from public.projects;
  select count(*) into c_bld   from public.buildings;
  select count(*) into c_pe    from public.project_esms;
  select count(*) into c_bis   from public.building_item_scope;
  select count(*) into c_il    from public.install_log;
  select count(*) into c_coc   from public.cocs;
  select count(*) into c_claim from public.coc_claims;
  select count(*) into c_ccb   from public.coc_covered_buildings;
  select count(*) into c_audit from public.audit_log;

  select id into v_pmo from public.profiles where role = 'pmo' and not archived limit 1;
  select code into v_mat from public.materials order by code limit 1;
  if v_pmo is null or v_mat is null then
    raise notice 'SKIPPED — needs a pmo profile and a material';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pmo::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- the card before anything exists
  select coalesce(sum(v.approved_count), 0), coalesce(sum(v.expected_count), 0) into x, y
    from public.v_project_doc_progress v
    join public.projects pr on pr.id = v.project_id and pr.status = 'active'
   where v.doc_type = 'coc';
  raise notice 'CARD before seeding: % of %', x, y;

  -- an active project with one fully installed pair
  insert into public.projects (id, code, name, pm_id, status)
    values (v_proj, 'ZZ0132', 'card proof fixture', v_pmo, 'active'::public.project_status);
  v_ids := v_ids || v_proj;
  insert into public.buildings (project_id, code, name, scope_status)
    values (v_proj, 'ZZ0132-B1', 'B1', 'in_scope'::public.building_scope_status) returning id into v_b;
  v_ids := v_ids || v_b;
  insert into public.project_esms (project_id, esm_id, ordinal)
    select v_proj, e.id, 1 from public.esms e where e.code = 'ESM1' returning id into v_pe;
  v_ids := v_ids || v_pe;
  insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
    values (v_b, v_pe, 'M', v_mat, 4) returning id into v_s;
  v_ids := v_ids || v_s;
  insert into public.install_log (entry_date, building_id, scope_id, qty, qa_status, installed_by_id)
    values (current_date, v_b, v_s, 4, 'pending_qa'::public.install_qa_status, v_pmo) returning id into v_il;
  v_ids := v_ids || v_il;

  select coalesce(sum(v.approved_count), 0), coalesce(sum(v.expected_count), 0) into x, y
    from public.v_project_doc_progress v
    join public.projects pr on pr.id = v.project_id and pr.status = 'active'
   where v.doc_type = 'coc';
  if y <> 1 or x <> 0 then raise exception 'FAIL: one uncertified pair should read 0 of 1, got % of %', x, y; end if;
  raise notice 'CARD with one eligible pair, nothing issued: % of %', x, y;

  -- issue it through the shipped workflow
  v_res := public.generate_cocs(v_proj, jsonb_build_array(jsonb_build_object(
             'building_ids', jsonb_build_array(v_b), 'esm_codes', jsonb_build_array('ESM1'))));
  if (v_res->>'created')::int <> 1 then raise exception 'FAIL: generate_cocs %', v_res; end if;
  v_coc := (v_res->'coc_ids'->>0)::uuid;  v_ids := v_ids || v_coc;

  select coalesce(sum(v.submitted_count), 0) into n
    from public.v_project_doc_progress v where v.project_id = v_proj and v.doc_type = 'coc';
  if n <> 0 then raise exception 'FAIL: a draft should not count as submitted, got %', n; end if;

  perform public.mark_coc_generated(v_coc, 'proof/0132.pdf');
  perform public.mark_coc_sent(v_coc);
  select coalesce(sum(v.submitted_count), 0), coalesce(sum(v.approved_count), 0) into n, x
    from public.v_project_doc_progress v where v.project_id = v_proj and v.doc_type = 'coc';
  if n <> 1 or x <> 0 then raise exception 'FAIL: sent should read submitted 1 / approved 0, got % / %', n, x; end if;
  raise notice 'CARD after sending: submitted %, approved %', n, x;

  perform public.log_coc_feedback(v_coc, 'approved', 'proof fixture');

  select coalesce(sum(v.approved_count), 0), coalesce(sum(v.expected_count), 0) into x, y
    from public.v_project_doc_progress v
    join public.projects pr on pr.id = v.project_id and pr.status = 'active'
   where v.doc_type = 'coc';
  if x <> 1 or y <> 1 then raise exception 'FAIL: the card did not move — expected 1 of 1, got % of %', x, y; end if;
  raise notice 'CARD after TARSHID approval: % of % — THE CARD MOVED', x, y;

  -- ---- cleanup -----------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.coc_rpc', 'on', true);
  delete from public.cocs               where project_id = v_proj;
  delete from public.install_log        where building_id = v_b;
  delete from public.building_item_scope where building_id = v_b;
  delete from public.buildings          where project_id = v_proj;
  delete from public.project_esms       where project_id = v_proj;
  delete from public.projects           where id = v_proj;
  delete from public.audit_log          where record_id = any (v_ids);

  select count(*) into n from public.projects;
  if n <> c_proj then raise exception 'FAIL: projects % -> %', c_proj, n; end if;
  select count(*) into n from public.buildings;
  if n <> c_bld then raise exception 'FAIL: buildings % -> %', c_bld, n; end if;
  select count(*) into n from public.project_esms;
  if n <> c_pe then raise exception 'FAIL: project_esms % -> %', c_pe, n; end if;
  select count(*) into n from public.building_item_scope;
  if n <> c_bis then raise exception 'FAIL: building_item_scope % -> %', c_bis, n; end if;
  select count(*) into n from public.install_log;
  if n <> c_il then raise exception 'FAIL: install_log % -> %', c_il, n; end if;
  select count(*) into n from public.cocs;
  if n <> c_coc then raise exception 'FAIL: cocs % -> %', c_coc, n; end if;
  select count(*) into n from public.coc_claims;
  if n <> c_claim then raise exception 'FAIL: coc_claims % -> %', c_claim, n; end if;
  select count(*) into n from public.coc_covered_buildings;
  if n <> c_ccb then raise exception 'FAIL: coc_covered_buildings % -> %', c_ccb, n; end if;
  select count(*) into n from public.audit_log;
  if n <> c_audit then raise exception 'FAIL: audit_log % -> %', c_audit, n; end if;
  raise notice 'PASS: every table the proof seeded is back to its starting count';
end $$;
