-- supabase/migrations/0035_seed_deliveries_example.sql
-- IES Programme Control Platform v2 — Phase 5 (Sprint 2 feedback)
-- Worked Materials-Delivery example seeded into MOI-Asir so the owner can see
-- the full lifecycle (pending -> in_transit -> delivered -> rejected) without
-- having to create rows himself (complaint 1.5). Idempotent.

insert into public.material_deliveries (project_id, building_id, material_name, scheduled_date, actual_date, status, notes, created_by)
select p.id, b.id, v.material_name, v.scheduled_date, v.actual_date, v.status, v.notes,
       (select id from public.profiles where role = 'projm' limit 1)
from (values
  ('MOI-001','LED 40W Ceiling Panel', date '2026-02-10', date '2026-02-12', 'delivered',  'Received on site, quantities verified against the submittal.'),
  ('MOI-002','Split WM 1.5 TR',       date '2026-03-05', null,             'in_transit', 'Dispatched from supplier warehouse; ETA on site this week.'),
  ('MOI-003','PIR Motion Sensor',     date '2026-03-20', null,             'pending',    'Purchase order confirmed by supplier; not yet shipped.'),
  ('MOI-001','AC Remote Controller',  date '2026-02-01', date '2026-02-03', 'rejected',  'Wrong model shipped — returned to supplier, replacement requested.')
) as v(bcode, material_name, scheduled_date, actual_date, status, notes)
join public.buildings b on b.code = v.bcode
join public.projects p on p.id = b.project_id and p.code = 'MOI-ASIR'
where not exists (
  select 1 from public.material_deliveries d
  where d.building_id = b.id and d.material_name = v.material_name
);
