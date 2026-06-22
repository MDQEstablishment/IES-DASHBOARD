-- supabase/migrations/0038_project_documents_esm.sql
-- IES Programme Control Platform v2 — Phase 5 hotfix
-- The "ESM Documentation Tracker" matrix read a separate seeded table
-- (esm_doc_status) while uploads went to project_documents — two sources of
-- truth, never wired together. Make project_documents the single source: add an
-- ESM dimension, switch doc_type to the tracker's kinds, and seed a few
-- ESM-tagged rows so the matrix shows real data.

-- 1) ESM dimension on documents ---------------------------------------------
alter table public.project_documents
  add column if not exists esm_id uuid references public.esms(id);

-- 2) Replace the doc_type check with the tracker vocabulary ------------------
alter table public.project_documents drop constraint if exists project_documents_doc_type_check;

update public.project_documents set doc_type = case
  when lower(doc_type) in ('coc')                                  then 'coc'
  when lower(doc_type) in ('ms','submittal','material_submittal')  then 'material_submittal'
  when lower(doc_type) in ('mos','method_statement')              then 'method_statement'
  when lower(doc_type) in ('mir')                                 then 'mir'
  when lower(doc_type) in ('wir')                                 then 'wir'
  else 'other' end;

alter table public.project_documents add constraint project_documents_doc_type_check
  check (doc_type in ('material_submittal','method_statement','mir','wir','coc','other'));

-- 3) Tag the existing untagged MOI-ASIR document to ESM1 so it shows --------
update public.project_documents d
   set esm_id = (select id from public.esms where code = 'ESM1')
  from public.projects p
 where d.project_id = p.id and p.code = 'MOI-ASIR' and d.esm_id is null;

-- 4) Seed a few ESM-tagged project-level docs for MOI-ASIR (proof) ----------
insert into public.project_documents (project_id, building_id, esm_id, doc_type, name, version, status, submitted_at)
select p.id, null, e.id, v.doc_type, v.name, v.version, v.status, now()
from (values
  ('ESM1','coc','COC — ESM1 Lighting','A','approved'),
  ('ESM2','material_submittal','Material Submittal — ESM2 Sensors','A','under_review'),
  ('ESM3','method_statement','Method Statement — ESM3 AC','A','approved')
) as v(esm_code, doc_type, name, version, status)
join public.projects p on p.code = 'MOI-ASIR'
join public.esms e on e.code = v.esm_code
where not exists (
  select 1 from public.project_documents d
  where d.project_id = p.id and d.name = v.name
);
