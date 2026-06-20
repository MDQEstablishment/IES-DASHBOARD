-- supabase/migrations/0024_business_seed.sql
-- IES Programme Control Platform v2 — Phase 3, migration 24
-- Realistic MOI-Asir + MoH-Riyadh demo data. Idempotent (ON CONFLICT / NOT EXISTS).
-- All actor/owner refs resolved by role (one profile per role) — no hardcoded UUIDs.

-- 1) PROJECTS ------------------------------------------------------------------
insert into public.projects (code, name, client, region, status, start_date, total_weeks, pm_id)
values
 ('MOI-ASIR','MOI — Asir Region','Ministry of Interior','Asir','active', date '2025-09-01', 64, (select id from public.profiles where role='projm')),
 ('MOH-RIYADH','MoH — Riyadh Region','Ministry of Health','Riyadh','active', date '2025-10-15', 52, (select id from public.profiles where role='projm'))
on conflict (code) do update set
  name=excluded.name, client=excluded.client, region=excluded.region,
  status=excluded.status, start_date=excluded.start_date, total_weeks=excluded.total_weeks, pm_id=excluded.pm_id;

-- 2) BUILDINGS -----------------------------------------------------------------
insert into public.buildings (project_id, code, name, region, engineer_name, contractor, status_override, delivery_status, approval_status, delivery_date, approval_date)
select p.id, v.code, v.name, v.region, v.eng, v.contractor,
       v.st::building_status, v.dst::building_delivery_status, v.ast::building_approval_status, v.ddate, v.adate
from (values
 ('MOI-ASIR','MOI-001','Police HQ — Abha','Abha','Yousef Al-Maliki','Al-Faisal HVAC','in_progress','scheduled','approved', date '2026-02-15', date '2025-11-20'),
 ('MOI-ASIR','MOI-002','Civil Defense — Khamis','Khamis Mushait','Yousef Al-Maliki','Najd Technical Co.','in_progress','pending','approved', null, date '2025-12-01'),
 ('MOI-ASIR','MOI-003','Traffic Dept — Bisha','Bisha','Yousef Al-Maliki','Tihama Cooling','pending','pending','awaiting', null, null),
 ('MOH-RIYADH','MOH-001','General Hospital — Riyadh','Riyadh','Yousef Al-Maliki','Al-Faisal HVAC','in_progress','scheduled','approved', date '2026-03-01', date '2026-01-10')
) as v(pcode,code,name,region,eng,contractor,st,dst,ast,ddate,adate)
join public.projects p on p.code=v.pcode
on conflict (project_id, code) do update set
  name=excluded.name, region=excluded.region, engineer_name=excluded.engineer_name, contractor=excluded.contractor,
  status_override=excluded.status_override, delivery_status=excluded.delivery_status, approval_status=excluded.approval_status,
  delivery_date=excluded.delivery_date, approval_date=excluded.approval_date;

-- 3) BUILDING ENGINEERS (Yousef on all) ---------------------------------------
insert into public.building_engineers (building_id, engineer_id, role)
select b.id, (select id from public.profiles where role='proje'), 'engineer'
from public.buildings b
on conflict (building_id, engineer_id) do nothing;

-- 4) ROOMS ---------------------------------------------------------------------
insert into public.rooms (building_id, name, floor)
select b.id, r.name, r.floor
from (values
 ('MOI-001','G.101 Reception','Ground'),
 ('MOI-001','G.102 Office','Ground'),
 ('MOI-001','G.103 Storage','Ground'),
 ('MOI-001','F.201 Office','First'),
 ('MOI-002','G.101 Lobby','Ground'),
 ('MOI-002','G.102 Control Room','Ground'),
 ('MOI-003','G.101 Office','Ground'),
 ('MOH-001','G.101 Ward A','Ground'),
 ('MOH-001','G.102 Ward B','Ground')
) as r(bcode,name,floor)
join public.buildings b on b.code=r.bcode
where not exists (select 1 from public.rooms x where x.building_id=b.id and x.name=r.name);

-- 5) PROJECT_ESMS --------------------------------------------------------------
insert into public.project_esms (project_id, esm_id, ordinal)
select p.id, e.id, v.ord
from (values
 ('MOI-ASIR','ESM1',1),('MOI-ASIR','ESM2',2),('MOI-ASIR','ESM3',3),
 ('MOH-RIYADH','ESM1',1),('MOH-RIYADH','ESM3',2)
) as v(pcode,ecode,ord)
join public.projects p on p.code=v.pcode
join public.esms e on e.code=v.ecode
on conflict (project_id, esm_id) do update set ordinal=excluded.ordinal;

-- 6) MATERIALS -----------------------------------------------------------------
insert into public.materials (code, name, esm_id, brand_spec, unit, planned, threshold)
select v.code, v.name, e.id, v.brand, v.unit, v.planned, v.threshold
from (values
 ('LED-40W','LED 40W Ceiling Panel','ESM1','Philips CoreLine','fixtures',17400,1000),
 ('LED-EMG','LED Emergency Fixture','ESM1','Philips ED','fixtures',3200,300),
 ('SENS-PIR','PIR Motion Sensor','ESM2','Schneider Argus','sensors',1200,100),
 ('AC-S15','Split WM 1.5 TR','ESM3','Trane 4MYW','units',2481,200),
 ('AC-S20','Split WM 2.0 TR','ESM3','Trane 4MYW','units',1513,150),
 ('AC-W15','Window 1.5 TR','ESM3','Trane WCH','units',745,60),
 ('BR-STEEL','Bracket Steel Pre-fab','ESM3','Hilti MQ','pcs',8800,500),
 ('RC-AC','AC Remote Controller','ESM3','Trane RC','pcs',5292,300)
) as v(code,name,ecode,brand,unit,planned,threshold)
join public.esms e on e.code=v.ecode
on conflict (code) do update set name=excluded.name, esm_id=excluded.esm_id, brand_spec=excluded.brand_spec,
  unit=excluded.unit, planned=excluded.planned, threshold=excluded.threshold;

-- 7) BUILDING_ITEM_SCOPE (MOI-001 = the 24 / 1 / 6 demo) -----------------------
insert into public.building_item_scope (building_id, project_esm_id, sub_type, material_code, planned_qty)
select b.id, pe.id, v.sub_type, v.material_code, v.planned_qty
from (values
 ('MOI-001','ESM1','LED 40W','LED-40W',24),
 ('MOI-001','ESM2','PIR Sensor','SENS-PIR',1),
 ('MOI-001','ESM3','Split WM 1.5 TR','AC-S15',6),
 ('MOI-002','ESM1','LED 40W','LED-40W',40),
 ('MOI-002','ESM3','Split WM 2.0 TR','AC-S20',10),
 ('MOI-003','ESM1','LED 40W','LED-40W',30),
 ('MOI-003','ESM3','Split WM 1.5 TR','AC-S15',8),
 ('MOH-001','ESM1','LED 40W','LED-40W',60),
 ('MOH-001','ESM3','Window 1.5 TR','AC-W15',12)
) as v(bcode,ecode,sub_type,material_code,planned_qty)
join public.buildings b on b.code=v.bcode
join public.esms e on e.code=v.ecode
join public.project_esms pe on pe.esm_id=e.id and pe.project_id=b.project_id
on conflict (building_id, project_esm_id, sub_type) do update set
  material_code=excluded.material_code, planned_qty=excluded.planned_qty;

-- 8) INSTALL_LOG (~25 rows, partial progress, mix of approved/pending) ---------
insert into public.install_log (entry_date, building_id, scope_id, qty, source, qa_status, installed_by_id, approved_by_id, approved_at, note)
select current_date - 14, s.building_id, s.id, greatest(1, floor(s.planned_qty*0.4)::int),
  'manual'::install_source, 'approved'::install_qa_status,
  (select id from public.profiles where role='proje'),
  (select id from public.profiles where role='projm'), now() - interval '12 days', '[seed-a] initial install batch'
from public.building_item_scope s
where not exists (select 1 from public.install_log il where il.scope_id=s.id and il.note like '[seed-a]%');

insert into public.install_log (entry_date, building_id, scope_id, qty, source, qa_status, installed_by_id, approved_by_id, approved_at, note)
select current_date - 5, s.building_id, s.id, greatest(1, floor(s.planned_qty*0.2)::int),
  'manual'::install_source, 'approved'::install_qa_status,
  (select id from public.profiles where role='proje'),
  (select id from public.profiles where role='projm'), now() - interval '4 days', '[seed-b] follow-up install'
from public.building_item_scope s
where s.planned_qty >= 3 and not exists (select 1 from public.install_log il where il.scope_id=s.id and il.note like '[seed-b]%');

insert into public.install_log (entry_date, building_id, scope_id, qty, source, qa_status, installed_by_id, note)
select current_date - 1, s.building_id, s.id, greatest(1, floor(s.planned_qty*0.1)::int),
  'quick_entry'::install_source, 'pending_qa'::install_qa_status,
  (select id from public.profiles where role='proje'), '[seed-c] awaiting QA'
from public.building_item_scope s
where s.planned_qty >= 4 and not exists (select 1 from public.install_log il where il.scope_id=s.id and il.note like '[seed-c]%');

-- 9) TASKS ---------------------------------------------------------------------
insert into public.tasks (title, description, created_by_id, assigned_to_id, project_id, building_id, due_date, priority, status)
select v.title, v.descr,
  (select id from public.profiles where role=v.creator::public.user_role),
  (select id from public.profiles where role=v.assignee::public.user_role),
  p.id, b.id, current_date + v.due, v.priority::task_priority, v.status::task_status
from (values
 ('Approve MIR — Floor 1 brackets (MOI-001)','Material inspection report for floor 1 bracket installation is awaiting PM approval.','proje','projm','MOI-ASIR','MOI-001',3,'high','open'),
 ('Submit Method Statement — MOI-002','Draft and submit the installation method statement for Civil Defense Khamis.','projm','proje','MOI-ASIR','MOI-002',5,'medium','in_progress'),
 ('Schedule mock-up inspection — MOI-001','Coordinate consultant mock-up sign-off visit for Police HQ Abha.','projm','proje','MOI-ASIR','MOI-001',2,'medium','open'),
 ('Resolve Window 1.5 TR shortfall','Expedite procurement of the 36-unit Window 1.5 TR shortfall for Riyadh hospital.','projm','procm','MOH-RIYADH','MOH-001',1,'high','blocked'),
 ('Client sign-off walk-through — MOI-001','Arrange final client walk-through and sign-off for completed floors.','projm','projm','MOI-ASIR','MOI-001',10,'low','open')
) as v(title,descr,creator,assignee,pcode,bcode,due,priority,status)
join public.projects p on p.code=v.pcode
left join public.buildings b on b.code=v.bcode and b.project_id=p.id
where not exists (select 1 from public.tasks t where t.title=v.title);

-- 10) ESCALATIONS (raised by Yousef -> trigger derives raised_to = Majed) ------
insert into public.escalations (title, description, raised_by_id, project_id, building_id, severity, status)
select v.title, v.descr, (select id from public.profiles where role='proje'),
  p.id, b.id, v.severity::escalation_severity, v.status::escalation_status
from (values
 ('Mock-up sign-off slipping beyond 7 days','Al-Faisal HVAC mock-up approval is overdue by more than seven days and is now blocking four downstream installation stages at Police HQ Abha.','MOI-ASIR','MOI-001','high','open'),
 ('Window 1.5 TR shortfall of 36 units','Vendor lead time of 21 days on a 36-unit shortfall of Window 1.5 TR now threatens the Riyadh hospital delivery milestone.','MOH-RIYADH','MOH-001','critical','acknowledged')
) as v(title,descr,pcode,bcode,severity,status)
join public.projects p on p.code=v.pcode
left join public.buildings b on b.code=v.bcode and b.project_id=p.id
where not exists (select 1 from public.escalations e where e.title=v.title);

-- 11) DOCUMENTS ----------------------------------------------------------------
insert into public.documents (building_id, kind, revision, title, status, submitted_by_id, approved_by_id, storage_path)
select b.id, v.kind::document_kind, v.rev, v.title, v.status,
  (select id from public.profiles where role='proje'),
  case when v.status='Approved' then (select id from public.profiles where role='projm') else null end,
  'documents/'||v.bcode||'/'||v.kind||'-'||v.rev||'.pdf'
from (values
 ('MOI-001','material_submittal','3','Material Submittal — AC equipment','Approved'),
 ('MOI-001','method_statement','2','Method Statement — Installation','Approved'),
 ('MOI-001','mir','1','MIR — Brackets & hangers','In Review'),
 ('MOI-001','wir','1','WIR — Floor 1 + 2 installation','In Review'),
 ('MOI-001','coc','A','Completion Certificate','Draft'),
 ('MOI-002','material_submittal','1','Material Submittal — LED fixtures','In Review'),
 ('MOH-001','material_submittal','1','Material Submittal — AC equipment','Approved')
) as v(bcode,kind,rev,title,status)
join public.buildings b on b.code=v.bcode
on conflict (building_id, kind, revision) do nothing;

-- 12) MATERIAL_MOVEMENTS (counters auto-update via trigger) --------------------
insert into public.material_movements (material_id, project_id, kind, qty, note, moved_by_id, occurred_at)
select m.id, p.id, v.kind::material_movement_kind, v.qty, '[seed] '||v.note,
  (select id from public.profiles where role='procm'), now() - (v.days || ' days')::interval
from (values
 ('AC-S15','MOI-ASIR','request',2481,'PO-2418 AC split 1.5TR programme order',30),
 ('AC-S15','MOI-ASIR','receipt',1490,'DN-1124 delivery from vendor',12),
 ('LED-40W','MOI-ASIR','request',17400,'Programme LED order',45),
 ('LED-40W','MOI-ASIR','receipt',13572,'Partial LED delivery',10),
 ('BR-STEEL','MOI-ASIR','receipt',6248,'Bracket delivery',8)
) as v(mcode,pcode,kind,qty,note,days)
join public.materials m on m.code=v.mcode
join public.projects p on p.code=v.pcode
where not exists (select 1 from public.material_movements mm where mm.note='[seed] '||v.note);
