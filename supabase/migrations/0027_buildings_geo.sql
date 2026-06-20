-- supabase/migrations/0027_buildings_geo.sql
-- IES Programme Control Platform v2 — Phase 4, migration 27
-- Building geo + contractor contact, with backfilled KSA coordinates so the
-- Project Detail map renders markers immediately. Additive only.

alter table public.buildings
  add column if not exists location_lat numeric(10,7),
  add column if not exists location_lng numeric(10,7),
  add column if not exists contractor_name text,
  add column if not exists contractor_phone text;

-- carry the existing free-text contractor into the structured column
update public.buildings set contractor_name = contractor
where contractor_name is null and contractor is not null;

-- real city coordinates for the four seeded buildings
update public.buildings set location_lat = 24.6877, location_lng = 46.7219, contractor_phone = '+966 50 123 4567'
where code = 'MOH-001';
update public.buildings set location_lat = 18.2208, location_lng = 42.5053, contractor_phone = '+966 50 234 5678'
where code = 'MOI-001';
update public.buildings set location_lat = 18.3060, location_lng = 42.7297, contractor_phone = '+966 50 345 6789'
where code = 'MOI-002';
update public.buildings set location_lat = 19.9967, location_lng = 42.6009, contractor_phone = '+966 50 456 7890'
where code = 'MOI-003';
