-- supabase/migrations/0003_esms_materials.sql
-- IES Programme Control Platform v2 — Phase 1, migration 3 of 7
-- ESM catalogue, per-project ESM overrides, and material stock items.
-- Scope guard: NO RLS, NO audit trigger, NO seed (esms ships EMPTY by ruling).
-- No new enums: material state (Healthy/Reorder/Stockout) is COMPUTED, never stored.

-- 1. esms — global controlled vocabulary; names are editable (v1.1 change #3). ----
create table public.esms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- 'ESM1' | 'ESM2' | 'ESM3'
  name        text not null,                        -- default label, e.g. 'Lighting Replacement'
  unit        text,                                 -- nominal ESM unit ('fixtures','sensors','units')
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.esms      is 'Global ESM catalogue (controlled vocabulary). Seeded with the 3 ESMs at the start of Phase 2.';
comment on column public.esms.name is 'Editable default label; a project may override it via project_esms.custom_name.';

create trigger esms_set_updated_at
  before update on public.esms
  for each row execute function public.set_updated_at();

-- 2. project_esms — which ESMs a project runs, with per-project label + ordering. -
create table public.project_esms (
  project_id   uuid    not null references public.projects (id) on delete cascade,
  esm_id       uuid    not null references public.esms (id)     on delete restrict,
  custom_name  text,                                 -- overrides esms.name for THIS project when set
  ordinal      integer not null default 0,           -- display order within the project
  archived     boolean not null default false,       -- ESM removed from project = archived, not deleted
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (project_id, esm_id)
);

comment on table  public.project_esms             is 'Join: ESMs active on a project. Catalogue stays clean; per-project label + order live here.';
comment on column public.project_esms.custom_name is 'Per-project ESM label override; falls back to esms.name when NULL.';
comment on column public.project_esms.archived    is 'Soft-removal of an ESM from a project (no hard delete of history).';

create index project_esms_esm_id_idx on public.project_esms (esm_id);

create trigger project_esms_set_updated_at
  before update on public.project_esms
  for each row execute function public.set_updated_at();

-- 3. materials — stock items, scoped to the ESM CATALOGUE (not to a project_esm). -
--    installed / consumed / in_stock / shortage are COMPUTED from install_log
--    aggregates later — never stored here.
create table public.materials (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- material key, e.g. 'M-L01' (referenced by scope at #0004)
  name        text not null,                        -- 'LED Panel 40W'
  esm_id      uuid not null references public.esms (id) on delete restrict,
  brand_spec  text,                                 -- 'Philips', 'Zamil', spec text
  unit        text,                                 -- 'each' | 'm' | 'kg' | 'pcs' | 'units'
  planned     integer not null default 0 check (planned   >= 0),
  requested   integer not null default 0 check (requested >= 0),
  received    integer not null default 0 check (received  >= 0),
  threshold   integer not null default 0 check (threshold >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.materials           is 'Stock items per ESM. in_stock = received - consumed and shortage = greatest(0, planned - received) are COMPUTED at read, never stored.';
comment on column public.materials.code      is 'Material business key (M-L01). Install scope (#0004) links to materials by id; code is the human/seed handle.';
comment on column public.materials.requested is 'Running total; the Request/Receipt ledger arrives as material_movements (Materials phase).';

create index materials_esm_id_idx on public.materials (esm_id);

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();
