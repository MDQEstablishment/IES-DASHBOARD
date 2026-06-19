-- supabase/migrations/0009_building_engineers.sql
-- IES Programme Control Platform v2 — Phase 2, migration 9 of 15
-- PE-assignment join: which engineers are assigned to which buildings.
-- Backs the Project Engineer (proje) scope:'own' RLS predicate (0017).
-- Scope guard: table only — RLS enable/policies land in 0016–0018; audit
--   attachment lands in 0012.

create table public.building_engineers (
  building_id  uuid not null references public.buildings (id) on delete cascade,
  engineer_id  uuid not null references public.profiles  (id) on delete cascade,
  role         text        not null default 'engineer',   -- assignment role label (e.g. 'engineer','lead')
  assigned_at  timestamptz not null default now(),
  primary key (building_id, engineer_id)
);

comment on table  public.building_engineers      is 'Assignment join: engineers to buildings. Drives proje scope:''own'' — a Project Engineer reads only buildings (and their install_log/photos/tasks) where they appear here.';
comment on column public.building_engineers.role is 'Assignment-role label, not a system RBAC role. Default ''engineer''.';

-- engineer_id is NOT the leading PK column, so PE's RLS predicate
-- (exists ... where engineer_id = auth.uid()) needs its own index.
create index building_engineers_engineer_id_idx on public.building_engineers (engineer_id);
