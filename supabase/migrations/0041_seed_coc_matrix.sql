-- supabase/migrations/0041_seed_coc_matrix.sql
-- IES Programme Control Platform v2 — Sprint 3 (seed for the new COC UI)
-- Realistic per-(building, ESM) COCs on MOI-ASIR with client reviewer names and
-- mixed client-court states, so the COC Matrix, smart Doc Tracker and the
-- Dashboard COC card show meaningful data. Idempotent.

-- Tag the existing user-uploaded "COCs" document to a building (was building-less).
update public.project_documents d
   set building_id = (select b.id from public.buildings b join public.projects p on p.id=b.project_id
                      where p.code='MOI-ASIR' and b.code='MOI-001')
  from public.projects p
 where d.project_id = p.id and p.code='MOI-ASIR' and d.name='COCs' and d.building_id is null;

-- Example COCs across (building, ESM) pairs with mixed statuses + reviewers.
insert into public.project_documents
  (project_id, building_id, esm_id, doc_type, name, revision, version, status,
   client_reviewer_name, submitted_at, client_response_date, response_notes, submitted_by)
select p.id, b.id, e.id, 'coc', v.name, 'A', 'A', v.status,
       v.reviewer, now() - (v.sub_days || ' days')::interval,
       case when v.resp_days is null then null else now() - (v.resp_days || ' days')::interval end,
       v.notes,
       (select id from public.profiles where role='projm' limit 1)
from (values
  ('MOI-001','ESM1','COC — Police HQ · ESM1 Lighting','approved',               'Eng. Khalid Al-Mutairi', 20, 8,    null),
  ('MOI-001','ESM3','COC — Police HQ · ESM3 AC','approved_with_comments',        'Eng. Sara Al-Ghamdi',    18, 6,    'Minor labeling comments to update on the as-builts.'),
  ('MOI-002','ESM1','COC — Civil Defense · ESM1 Lighting','submitted',           'Eng. Khalid Al-Mutairi', 20, null, null),
  ('MOI-002','ESM3','COC — Civil Defense · ESM3 AC','under_review',              'Eng. Sara Al-Ghamdi',     5, null, null),
  ('MOI-003','ESM1','COC — Traffic Dept · ESM1 Lighting','rejected',             'Eng. Khalid Al-Mutairi', 15, 3,    'COC missing as-built drawings — resubmit with Rev B.'),
  ('MOI-003','ESM3','COC — Traffic Dept · ESM3 AC','approved',                   'Eng. Sara Al-Ghamdi',    25, 10,   null)
) as v(bcode, ecode, name, status, reviewer, sub_days, resp_days, notes)
join public.projects p on p.code='MOI-ASIR'
join public.buildings b on b.project_id=p.id and b.code=v.bcode
join public.esms e on e.code=v.ecode
where not exists (
  select 1 from public.project_documents d where d.project_id=p.id and d.name=v.name
);
