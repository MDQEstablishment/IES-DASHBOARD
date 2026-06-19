-- supabase/migrations/0004_install_scope_log.sql
-- IES Programme Control Platform v2 — Phase 1, migration 4 of 7
-- Install scope (per building × sub-type), the append-only daily progress log
-- (with source + QA status), and per-room expected contents.
-- Scope guard: NO RLS, NO audit trigger, NO seed.

-- 0. Enums for install provenance + QA lifecycle. -----------------------------
create type public.install_source    as enum ('quick_entry','batch','excel_import','manual');
create type public.install_qa_status as enum ('pending_qa','approved','rejected');

-- 1. Surrogate key on project_esms so child FKs are single-column. ------------
--    Composite PK (project_id, esm_id) stays the conceptual key; id is unique handle.
alter table public.project_esms
  add column id uuid not null default gen_random_uuid();
alter table public.project_esms
  add constraint project_esms_id_key unique (id);

-- 2. building_item_scope — planned per building, at SUB-TYPE grain. -----------
create table public.building_item_scope (
  id              uuid    primary key default gen_random_uuid(),
  building_id     uuid    not null references public.buildings (id)     on delete cascade,
  project_esm_id  uuid    not null references public.project_esms (id)  on delete restrict,
  sub_type        text    not null,                       -- 'Panel Light 36W', 'Exit Sign', …
  material_code   text    not null references public.materials (code) on delete restrict,  -- many sub-types → one material (non-unique link)
  sub_type_spec   jsonb   not null default '{}'::jsonb,    -- watts/colour/TR captured at scope-set time
  planned_qty     integer not null check (planned_qty >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (building_id, project_esm_id, sub_type)
);

comment on table  public.building_item_scope               is 'Planned install scope per building at sub-type grain (the Daily Progress picker reads this: Planned/Installed/Remaining). Installed/Remaining are derived from install_log.';
comment on column public.building_item_scope.material_code is 'FK to materials.code; non-unique here — many sub-types consume one material. Material decrement is a derived aggregate over this link.';

create index building_item_scope_building_id_idx    on public.building_item_scope (building_id);
create index building_item_scope_material_code_idx  on public.building_item_scope (material_code);
create index building_item_scope_project_esm_id_idx on public.building_item_scope (project_esm_id);

create trigger building_item_scope_set_updated_at
  before update on public.building_item_scope
  for each row execute function public.set_updated_at();

-- 3. install_log — append-only daily progress; one row per quantity logged. ---
--    Quantity facts are immutable; the only permitted update is the QA-status flip.
create table public.install_log (
  id               uuid    primary key default gen_random_uuid(),
  entry_date       date    not null default current_date,            -- work-date the engineer selected
  building_id      uuid    not null references public.buildings (id)            on delete restrict,
  room_id          uuid             references public.rooms (id)                on delete set null,
  scope_id         uuid    not null references public.building_item_scope (id)  on delete restrict,
  qty              integer not null check (qty > 0),
  source           public.install_source    not null default 'manual',
  qa_status        public.install_qa_status not null default 'pending_qa',
  photos           jsonb   not null default '[]'::jsonb,             -- Storage paths only, never bytes
  note             text,
  installed_by_id  uuid             references public.profiles (id)            on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  public.install_log           is 'Append-only daily progress. One row per quantity entered; quantity is immutable. Only QA-status transitions update a row.';
comment on column public.install_log.photos    is 'JSON array of Storage object paths only (no bytes in the DB).';
comment on column public.install_log.qa_status is 'pending_qa → approved | rejected. Reviewer-gated (role enforced in app + Phase 2 policy).';

create index install_log_building_id_idx on public.install_log (building_id);
create index install_log_scope_id_idx    on public.install_log (scope_id);
create index install_log_entry_date_idx  on public.install_log (entry_date desc);

create trigger install_log_set_updated_at
  before update on public.install_log
  for each row execute function public.set_updated_at();

-- 4. room_items — per-room expected sub-type contents (QA cross-check). -------
create table public.room_items (
  id            uuid    primary key default gen_random_uuid(),
  room_id       uuid    not null references public.rooms (id)               on delete cascade,
  scope_id      uuid    not null references public.building_item_scope (id) on delete restrict,
  expected_qty  integer check (expected_qty >= 0),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (room_id, scope_id)
);

comment on table public.room_items is 'Per-room expected sub-type contents (design room.items). One row per (room, scope).';

create index room_items_room_id_idx  on public.room_items (room_id);
create index room_items_scope_id_idx on public.room_items (scope_id);

create trigger room_items_set_updated_at
  before update on public.room_items
  for each row execute function public.set_updated_at();
