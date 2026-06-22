-- supabase/migrations/0034_buildings_floors_area.sql
-- IES Programme Control Platform v2 — Phase 5 (Sprint 2 feedback)
-- Optional building attributes surfaced by the Add/Edit Building modal
-- (complaint 1.2) and the redesigned Excel template's Buildings sheet (1.3).

alter table public.buildings
  add column if not exists floors integer,
  add column if not exists area_sqm numeric;
