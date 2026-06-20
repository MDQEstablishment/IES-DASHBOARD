-- supabase/migrations/0025_esm_doc_status_seed.sql
-- IES Programme Control Platform v2 — Phase 3, migration 25
-- Auto-seed esm_doc_status: one row per project_esm x canonical document kind,
-- defaulting to 'Missing'. Idempotent via the (project_id,esm_id,kind) unique key.

insert into public.esm_doc_status (project_id, esm_id, kind, status)
select pe.project_id, pe.esm_id, k.kind::document_kind, 'Missing'
from public.project_esms pe
cross join (values ('material_submittal'),('method_statement'),('mir'),('wir'),('coc')) as k(kind)
on conflict (project_id, esm_id, kind) do nothing;

-- Showcase: mark a few MOI-Asir statuses as progressed (realistic mixed state).
update public.esm_doc_status d
set status = m.status, updated_by_id = (select id from public.profiles where role='projm')
from (values
 ('MOI-ASIR','ESM3','material_submittal','Approved'),
 ('MOI-ASIR','ESM3','method_statement','Approved'),
 ('MOI-ASIR','ESM3','mir','In Review'),
 ('MOI-ASIR','ESM1','material_submittal','Approved'),
 ('MOI-ASIR','ESM1','method_statement','In Review')
) as m(pcode,ecode,kind,status)
where d.project_id = (select id from public.projects where code=m.pcode)
  and d.esm_id     = (select id from public.esms where code=m.ecode)
  and d.kind       = m.kind::document_kind;
