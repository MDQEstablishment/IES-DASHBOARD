-- supabase/migrations/0046_doc_progress_uncap_mir_wir_coc_rules.sql
-- Sprint 6 (Note #3): MIR/WIR are open-ended over a project's lifecycle, so they
-- carry NO expected denominator. COC's denominator must equal the COC-Matrix
-- rules engine output (default_coc_plan) — per ESM, the number of planned COCs
-- whose bundle covers that ESM. Counts are over COC *documents* covering the ESM
-- (consistent with the per-ESM denominator), not distinct buildings.

drop view if exists public.v_project_doc_progress;
create view public.v_project_doc_progress
  with (security_invoker = true) as
with esm_kinds as (
  select pe.project_id, e.id as esm_id, e.code as esm_code, k.doc_type
  from public.project_esms pe
  join public.esms e on e.id = pe.esm_id
  cross join (values ('material_submittal'),('method_statement'),('mir'),('wir'),('coc')) as k(doc_type)
  where pe.archived = false
)
select
  ek.project_id, ek.esm_code, ek.doc_type,
  case ek.doc_type
    when 'material_submittal' then 1
    when 'method_statement'   then 1
    when 'mir'  then null            -- open-ended: no denominator
    when 'wir'  then null            -- open-ended: no denominator
    when 'coc'  then (select count(*)::int from public.default_coc_plan(ek.project_id) p
                       where ek.esm_code = any(p.esm_codes))
  end as expected_count,
  case when ek.doc_type = 'coc' then (
    select count(distinct d.id)
    from public.project_documents d
    join public.coc_esms ce on ce.coc_id = d.id and ce.esm_code = ek.esm_code
    where d.project_id = ek.project_id and d.doc_type = 'coc')
  else (select count(*) from public.project_documents d
    where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type) end as submitted_count,
  case when ek.doc_type = 'coc' then (
    select count(distinct d.id)
    from public.project_documents d
    join public.coc_esms ce on ce.coc_id = d.id and ce.esm_code = ek.esm_code
    where d.project_id = ek.project_id and d.doc_type = 'coc' and d.status in ('approved','approved_with_comments'))
  else (select count(*) from public.project_documents d
    where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type
      and d.status in ('approved','approved_with_comments')) end as approved_count,
  case when ek.doc_type = 'coc' then (
    select count(distinct d.id)
    from public.project_documents d
    join public.coc_esms ce on ce.coc_id = d.id and ce.esm_code = ek.esm_code
    where d.project_id = ek.project_id and d.doc_type = 'coc' and d.status = 'rejected')
  else (select count(*) from public.project_documents d
    where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type
      and d.status = 'rejected') end as rejected_count
from esm_kinds ek;

grant select on public.v_project_doc_progress to authenticated;
