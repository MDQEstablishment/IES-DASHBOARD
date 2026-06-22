-- supabase/migrations/0040_doc_tracker_submittal_log.sql
-- IES Programme Control Platform v2 — Sprint 3 (Group 3A)
-- Reframe Doc Tracker as a CONTRACTOR-SIDE SUBMITTAL LOG reviewed by the CLIENT's
-- external technical team. Schema + status semantics + a progress view that
-- encodes per-doc-type cardinality.

-- 1) Extend project_documents ------------------------------------------------
alter table public.project_documents
  add column if not exists building_id uuid references public.buildings(id),
  add column if not exists delivery_id uuid references public.material_deliveries(id),
  add column if not exists revision text default 'A',
  add column if not exists client_reviewer_name text,
  add column if not exists client_response_date timestamptz,
  add column if not exists response_notes text;

-- material_deliveries needs an ESM link so MIR expected_count can be per-ESM
-- (the 3A MIR formula references "esm_id matches" on material_deliveries).
alter table public.material_deliveries
  add column if not exists esm_id uuid references public.esms(id);

-- 2) Status vocabulary -------------------------------------------------------
--    keep submitted/under_review/approved/rejected/superseded;
--    add draft / approved_with_comments / resubmitted.
alter table public.project_documents drop constraint if exists project_documents_status_check;
alter table public.project_documents add constraint project_documents_status_check
  check (status in ('draft','submitted','under_review','approved','approved_with_comments','rejected','resubmitted','superseded'));

-- 3) Backfill revision (default already fills existing rows; be explicit) -----
update public.project_documents set revision = 'A' where revision is null;
-- reviewed_by / reviewed_at are intentionally left as internal audit fields.

-- 4) Progress view: one row per (project, esm_code, doc_type) -----------------
--    expected_count encodes cardinality; submitted/approved/rejected counts live.
create or replace view public.v_project_doc_progress
  with (security_invoker = true) as
with esm_kinds as (
  select pe.project_id, e.id as esm_id, e.code as esm_code, k.doc_type
  from public.project_esms pe
  join public.esms e on e.id = pe.esm_id
  cross join (values ('material_submittal'),('method_statement'),('mir'),('wir'),('coc')) as k(doc_type)
  where pe.archived = false
)
select
  ek.project_id,
  ek.esm_code,
  ek.doc_type,
  case ek.doc_type
    when 'material_submittal' then 1
    when 'method_statement'   then 1
    when 'mir'  then greatest(1, (
      select count(distinct md.id) from public.material_deliveries md
      where md.project_id = ek.project_id and md.esm_id = ek.esm_id))
    when 'wir'  then (
      select count(*) from public.buildings b
      where b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status)
    when 'coc'  then (
      select count(*) from public.buildings b
      where b.project_id = ek.project_id and b.status_override is distinct from 'archived'::public.building_status)
  end as expected_count,
  (select count(*) from public.project_documents d
     where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type) as submitted_count,
  (select count(*) from public.project_documents d
     where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type
       and d.status in ('approved','approved_with_comments')) as approved_count,
  (select count(*) from public.project_documents d
     where d.project_id = ek.project_id and d.esm_id = ek.esm_id and d.doc_type = ek.doc_type
       and d.status = 'rejected') as rejected_count
from esm_kinds ek;

grant select on public.v_project_doc_progress to authenticated;
