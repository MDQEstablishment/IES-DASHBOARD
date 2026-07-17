-- supabase/migrations/0083_coc_rpcs.sql
-- Sprint 8S Phase 3 — the COC write path. All state changes flow through these
-- security-definer RPCs (log_daily_progress pattern, 0068): plan preview,
-- generation from project settings, PDF-generated marker, sent marker,
-- external-feedback logging, and revision creation. PDFs themselves render
-- client-side (pdf-lib) and upload to the coc-pdfs bucket; mark_coc_generated
-- records the result.

-- ── updated_at maintenance ───────────────────────────────────────────────────
create or replace function public.touch_cocs_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end $$;
drop trigger if exists trg_cocs_touch on public.cocs;
create trigger trg_cocs_touch before update on public.cocs
  for each row execute function public.touch_cocs_updated_at();

-- ── plan preview: the exact COCs the settings imply ─────────────────────────
-- Returns a jsonb array of {building_ids, building_codes, esm_codes,
-- bundle_label, beneficiary_name, beneficiary_designation, mixed_beneficiary,
-- exists_coc_id}. Scattered = one row per building × group; concatenated = one
-- row per group covering all active buildings. Rows whose exact scope already
-- has a live (non-superseded) COC carry its id in exists_coc_id.
create or replace function public.coc_plan_preview(p_project_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_settings record;
  v_groups jsonb := '[]'::jsonb;
  v_result jsonb := '[]'::jsonb;
  v_group jsonb;
  v_codes text[];
  v_b record;
  v_all_b uuid[];
  v_all_codes text[];
begin
  select * into v_settings from coc_project_settings where project_id = p_project_id;
  if not found then
    -- defaults: concatenated, standalone groups
    v_settings.layout_mode := 'concatenated';
    v_settings.esm_groupings := '[]'::jsonb;
  end if;

  -- groups: configured groupings filtered to the project's ESMs; ungrouped ESMs standalone
  with pe as (
    select e.code from project_esms x join esms e on e.id = x.esm_id
    where x.project_id = p_project_id and x.archived = false
  ), cfg as (
    select jsonb_array_elements(coalesce(v_settings.esm_groupings, '[]'::jsonb)) as grp
  ), cfg_codes as (
    select grp, array(select jsonb_array_elements_text(grp) intersect select code from pe) as codes from cfg
  ), grouped as (
    select codes from cfg_codes where array_length(codes, 1) > 0
  ), leftover as (
    select array[code] as codes from pe
    where code not in (select unnest(codes) from grouped)
  )
  select coalesce(jsonb_agg(to_jsonb(codes)), '[]'::jsonb) into v_groups
  from (select codes from grouped union all select codes from leftover order by codes) g;

  select coalesce(array_agg(id order by code), '{}'), coalesce(array_agg(code order by code), '{}')
    into v_all_b, v_all_codes
  from buildings where project_id = p_project_id
    and status_override is distinct from 'archived'::public.building_status;

  for v_group in select * from jsonb_array_elements(v_groups) loop
    v_codes := array(select jsonb_array_elements_text(v_group) order by 1);
    if v_settings.layout_mode = 'scattered' then
      for v_b in select id, code from buildings where project_id = p_project_id
        and status_override is distinct from 'archived'::public.building_status order by code
      loop
        v_result := v_result || jsonb_build_array(coc_plan_row(p_project_id, array[v_b.id], array[v_b.code], v_codes));
      end loop;
    elsif array_length(v_all_b, 1) is not null then
      v_result := v_result || jsonb_build_array(coc_plan_row(p_project_id, v_all_b, v_all_codes, v_codes));
    end if;
  end loop;
  return v_result;
end $$;

-- helper: one preview row (beneficiary resolution + existing-COC detection)
create or replace function public.coc_plan_row(
  p_project_id uuid, p_building_ids uuid[], p_building_codes text[], p_esm_codes text[]
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_bene_names text[];
  v_bene_name text;
  v_bene_desig text;
  v_exists uuid;
begin
  select array_agg(distinct beneficiary_name) into v_bene_names
  from coc_beneficiary_assignments
  where project_id = p_project_id and building_id = any (p_building_ids) and beneficiary_name is not null;

  if coalesce(array_length(v_bene_names, 1), 0) = 1 then
    select beneficiary_name, beneficiary_designation into v_bene_name, v_bene_desig
    from coc_beneficiary_assignments
    where project_id = p_project_id and building_id = any (p_building_ids) and beneficiary_name = v_bene_names[1]
    limit 1;
  end if;

  select c.id into v_exists
  from cocs c
  where c.project_id = p_project_id and c.status <> 'superseded'
    and (select array_agg(x order by x) from unnest(c.esm_codes) x) = p_esm_codes
    and (select array_agg(cb.building_id order by cb.building_id) from coc_covered_buildings cb where cb.coc_id = c.id)
        = (select array_agg(x order by x) from unnest(p_building_ids) x)
  limit 1;

  return jsonb_build_object(
    'building_ids', to_jsonb(p_building_ids),
    'building_codes', to_jsonb(p_building_codes),
    'esm_codes', to_jsonb(p_esm_codes),
    'bundle_label', array_to_string(p_esm_codes, '+'),
    'beneficiary_name', v_bene_name,
    'beneficiary_designation', v_bene_desig,
    'mixed_beneficiary', coalesce(array_length(v_bene_names, 1), 0) > 1,
    'exists_coc_id', v_exists
  );
end $$;

-- ── generate: insert draft COCs for the plan (or a chosen subset) ────────────
create or replace function public.generate_cocs(p_project_id uuid, p_rows jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_row jsonb;
  v_proj record;
  v_seq int;
  v_id uuid;
  v_code text;
  v_esm text[];
  v_bids uuid[];
  v_created uuid[] := '{}';
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select id, code into v_proj from projects where id = p_project_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_project'); end if;

  v_rows := coalesce(p_rows, coc_plan_preview(p_project_id));
  select coalesce(max(seq), 0) into v_seq from cocs where project_id = p_project_id;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    if v_row->>'exists_coc_id' is not null then continue; end if;
    v_esm := array(select jsonb_array_elements_text(v_row->'esm_codes'));
    v_bids := array(select (jsonb_array_elements_text(v_row->'building_ids'))::uuid);
    if coalesce(array_length(v_esm, 1), 0) = 0 or coalesce(array_length(v_bids, 1), 0) = 0 then continue; end if;
    v_seq := v_seq + 1;
    v_id := gen_random_uuid();
    v_code := v_proj.code || '-COC-' || lpad(v_seq::text, 3, '0');
    insert into cocs (id, project_id, seq, code, reference_no, esm_bundle, esm_codes, revision, root_coc_id, status, created_by)
    values (v_id, p_project_id, v_seq, v_code, v_code, array_to_string(v_esm, '+'), v_esm, 1, v_id, 'draft', auth.uid());
    insert into coc_covered_buildings (coc_id, building_id) select v_id, unnest(v_bids);
    v_created := v_created || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'created', coalesce(array_length(v_created, 1), 0), 'coc_ids', to_jsonb(v_created));
end $$;

-- ── PDF generated (client rendered + uploaded to coc-pdfs) ───────────────────
create or replace function public.mark_coc_generated(p_coc_id uuid, p_pdf_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select status into v_status from cocs where id = p_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status not in ('draft', 'generated') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_status);
  end if;
  update cocs set status = 'generated', pdf_path = p_pdf_path, generated_at = now() where id = p_coc_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── sent externally ───────────────────────────────────────────────────────────
create or replace function public.mark_coc_sent(p_coc_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select status into v_status from cocs where id = p_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status <> 'generated' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_status);
  end if;
  update cocs set status = 'sent', sent_at = now() where id = p_coc_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── log external feedback (received outside the platform) ────────────────────
create or replace function public.log_coc_feedback(
  p_coc_id uuid, p_outcome text, p_comments text default null,
  p_doc_path text default null, p_feedback_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_outcome not in ('approved', 'accepted_with_comments', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_outcome');
  end if;
  if p_outcome = 'rejected' and coalesce(trim(p_comments), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'comments_required');
  end if;
  select status into v_status from cocs where id = p_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status not in ('generated', 'sent') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_status);
  end if;
  update cocs set
    status = p_outcome, feedback_outcome = p_outcome, feedback_at = coalesce(p_feedback_at, now()),
    feedback_comments = nullif(trim(coalesce(p_comments, '')), ''), feedback_doc_path = p_doc_path
  where id = p_coc_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── new revision after rejection / acceptance-with-comments ──────────────────
create or replace function public.create_coc_revision(p_source_coc_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_src record; v_id uuid;
begin
  if public.auth_role() <> all (array['admin','pmo','projm','progm','proje']::public.user_role[]) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_src from cocs where id = p_source_coc_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_src.status not in ('rejected', 'accepted_with_comments') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_src.status);
  end if;
  v_id := gen_random_uuid();
  insert into cocs (id, project_id, seq, code, reference_no, esm_bundle, esm_codes, revision, root_coc_id, status, created_by)
  values (v_id, v_src.project_id, v_src.seq, v_src.code, v_src.reference_no, v_src.esm_bundle,
          v_src.esm_codes, v_src.revision + 1, coalesce(v_src.root_coc_id, v_src.id), 'draft', auth.uid());
  insert into coc_covered_buildings (coc_id, building_id)
  select v_id, building_id from coc_covered_buildings where coc_id = p_source_coc_id;
  update cocs set status = 'superseded', superseded_by_coc_id = v_id where id = p_source_coc_id;
  return jsonb_build_object('ok', true, 'coc_id', v_id, 'revision', v_src.revision + 1);
end $$;

grant execute on function public.coc_plan_preview(uuid) to authenticated;
grant execute on function public.coc_plan_row(uuid, uuid[], text[], text[]) to authenticated;
grant execute on function public.generate_cocs(uuid, jsonb) to authenticated;
grant execute on function public.mark_coc_generated(uuid, text) to authenticated;
grant execute on function public.mark_coc_sent(uuid) to authenticated;
grant execute on function public.log_coc_feedback(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.create_coc_revision(uuid) to authenticated;
