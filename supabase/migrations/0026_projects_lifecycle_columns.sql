-- supabase/migrations/0026_projects_lifecycle_columns.sql
-- IES Programme Control Platform v2 — Phase 4, migration 26
-- Project lifecycle, geo + contractor metadata. Additive only.

-- soft-delete state for projects (status='deleted' hides from the default list)
alter type public.project_status add value if not exists 'deleted';

alter table public.projects
  add column if not exists end_date date,
  add column if not exists location_address text,
  add column if not exists location_lat numeric(10,7),
  add column if not exists location_lng numeric(10,7),
  add column if not exists contractor_name text,
  add column if not exists contractor_phone text,
  add column if not exists contractor_email text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles(id);

-- Backfill end_date from start_date + total_weeks (fallback created_at + 26 weeks).
update public.projects
set end_date = coalesce(start_date, created_at::date) + ((coalesce(total_weeks, 26)) * 7)
where end_date is null;

-- Plausible centroids for the two demo programmes so the Map renders immediately.
update public.projects
set location_lat = 18.2164, location_lng = 42.5053, location_address = 'Asir Region, Saudi Arabia'
where code = 'MOI-ASIR' and location_lat is null;
update public.projects
set location_lat = 24.7136, location_lng = 46.6753, location_address = 'Riyadh, Saudi Arabia'
where code = 'MOH-RIYADH' and location_lat is null;
