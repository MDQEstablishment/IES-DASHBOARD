-- supabase/migrations/0002_projects_buildings_rooms.sql
-- IES Programme Control Platform v2 — Phase 1, migration 2 of 7
-- Location hierarchy: projects → buildings → rooms.
-- Scope guard: NO RLS, NO audit trigger, NO seed.

-- 1. Enums --------------------------------------------------------------------
create type public.project_status            as enum ('active','draft','on_hold','closed');
create type public.building_status           as enum ('pending','in_progress','signed');
create type public.building_delivery_status  as enum ('delivered','scheduled','pending');
create type public.building_approval_status  as enum ('approved','awaiting','rejected');

-- 2. projects -----------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                     -- business code, e.g. 'AS-RT-01'
  name         text not null,
  client       text,
  region       text,
  status       public.project_status not null default 'draft',
  start_date   date,                                     -- programme start
  total_weeks  integer check (total_weeks is null or total_weeks > 0),
  pm_id        uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table  public.projects        is 'Retrofit programmes. Progress %, building counts and the ESM list are derived (project_esms / buildings), never stored here.';
comment on column public.projects.code   is 'Human-readable business code (AS-RT-01). uuid id is the internal key.';
comment on column public.projects.pm_id  is 'Project Manager (a system user). NULL for draft/unassigned.';

create index projects_status_idx on public.projects (status);
create index projects_pm_id_idx  on public.projects (pm_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- 3. buildings ----------------------------------------------------------------
create table public.buildings (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete restrict,
  code             text not null,                        -- e.g. 'BLD-01', unique within the project
  name             text not null,
  name_ar          text,
  region           text,                                 -- city granularity (Abha, Khamis Mushait, …)
  gps              text,                                  -- '18.2°N, 42.5°E' (display string per design)
  engineer_name    text,                                 -- site engineer; NOT a system user → free text
  contractor       text,
  status_override  public.building_status,               -- NULL = auto (derived from install %)
  delivery_date    date,
  delivery_status  public.building_delivery_status,
  approval_date    date,
  approval_status  public.building_approval_status,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, code)
);

comment on table  public.buildings                 is 'Sites within a project. Progress %, photo counts and status (when status_override is NULL) are derived, not stored.';
comment on column public.buildings.status_override is 'Manual status override; NULL means status is auto-derived from install progress.';
comment on column public.buildings.engineer_name   is 'Site engineer name (not necessarily a system user) — free text by design.';

create index buildings_project_id_idx on public.buildings (project_id);

create trigger buildings_set_updated_at
  before update on public.buildings
  for each row execute function public.set_updated_at();

-- 4. rooms --------------------------------------------------------------------
create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings (id) on delete restrict,
  name         text not null,                            -- 'Classroom 101'
  floor        text,                                     -- 'L0', 'L1', …
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.rooms is 'Rooms within a building. Room-to-sub-type contents (design room.items) arrive as room_items at #0004 alongside building_item_scope.';

create index rooms_building_id_idx on public.rooms (building_id);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();
