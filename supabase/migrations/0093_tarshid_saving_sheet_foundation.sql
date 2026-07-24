-- Sprint 9D-1: TARSHID SAVING-SHEET FOUNDATION (Phase 1 only).
-- Reference data for the future saving-sheet generator: the TARSHID Old Model
-- Registry (~2,505 rows) + Approved Baseline Units (~300 rows) arrive via a
-- client-side workbook import (UPSERT by equipment_type+model_no, never
-- deletes); tarshid_constants hold the decoded savings-math parameters; the
-- approved-equipment catalogs gain cost/reference columns; projects gain the
-- TARSHID POC fields so the sheet's Project_Info tab is 100% auto-fillable.
-- ZERO DOUBLE WORK: projects.location_lat/lng already exist (0026) and are NOT
-- duplicated; buildings count stays derived.

-- ---------------------------------------------------------------------------
-- old_model_registry — the surveyed OLD units reference (fuzzy-match target
-- for later phases). Natural key (equipment_type, model_no) — text NOT NULL
-- DEFAULT '' so supabase-js .upsert(onConflict) works without partial indexes;
-- the importer normalizes model strings (collapse whitespace/newlines).
-- ---------------------------------------------------------------------------
create table if not exists public.old_model_registry (
  id uuid primary key default gen_random_uuid(),
  equipment_type text not null default '',
  make text,
  model_no text not null default '',           -- may contain ID/OD pairs; normalized single-space
  compressor_type text,                         -- Inverter / Non-Inverter
  size_category text,
  tr numeric,
  t1_btu numeric, t1_w numeric, t1_eer numeric,
  t3_btu numeric, t3_w numeric, t3_eer numeric,
  equivalent_seer numeric,
  surveyed_unit_description text,
  equivalent_ac_model_description text,
  retired boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_type, model_no)
);
create index if not exists idx_oldreg_make on public.old_model_registry(make);

-- ---------------------------------------------------------------------------
-- approved_baseline_units — TARSHID-approved baseline (comparison) units.
-- ---------------------------------------------------------------------------
create table if not exists public.approved_baseline_units (
  id uuid primary key default gen_random_uuid(),
  description text,
  equipment_type text not null default '',
  make text,
  model_no text not null default '',
  t1_btu numeric, t1_w numeric, t1_eer numeric,
  t3_btu numeric, t3_w numeric, t3_eer numeric,
  equivalent_seer numeric,
  nameplate_ref text,                           -- Reference Nameplate Photo
  datasheet_ref text,                           -- Reference Datasheet
  retired boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_type, model_no)
);
create index if not exists idx_baseline_make on public.approved_baseline_units(make);

-- ---------------------------------------------------------------------------
-- tarshid_constants — decoded savings-math parameters, editable by pmo/admin.
-- Global for now; per-project overrides are a later phase.
-- ---------------------------------------------------------------------------
create table if not exists public.tarshid_constants (
  key text primary key,
  value numeric not null,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.tarshid_constants (key, value, description) values
  ('tariff_sar_kwh', 0.32, 'Electricity tariff (SAR per kWh) used in payback'),
  ('seasonal_factor', 0.9, 'Seasonal utilisation factor applied to AC savings'),
  ('capacity_tolerance_pct', 10, 'Allowed % capacity delta when matching a replacement'),
  ('min_savings_pct', 15, 'Minimum savings % for an acceptable replacement')
on conflict (key) do nothing;

-- shared touch trigger fn (updated_at/by) for the three new tables
create or replace function public.tarshid_ref_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then new.updated_by := (select auth.uid()); end if;
  return new;
end $$;
drop trigger if exists old_model_registry_touch on public.old_model_registry;
create trigger old_model_registry_touch before update on public.old_model_registry
  for each row execute function public.tarshid_ref_touch();
drop trigger if exists approved_baseline_units_touch on public.approved_baseline_units;
create trigger approved_baseline_units_touch before update on public.approved_baseline_units
  for each row execute function public.tarshid_ref_touch();
drop trigger if exists tarshid_constants_touch on public.tarshid_constants;
create trigger tarshid_constants_touch before update on public.tarshid_constants
  for each row execute function public.tarshid_ref_touch();

-- ---------------------------------------------------------------------------
-- Approved-equipment catalogs: cost + reference columns (nullable; filled by
-- the 'Aprvd Project Unit' / 'Light Selection' workbook sheets).
-- ---------------------------------------------------------------------------
alter table public.ac_catalog
  add column if not exists unit_cost numeric,
  add column if not exists labor_cost numeric,
  add column if not exists saso_cert_ref text,
  add column if not exists datasheet_ref text;
alter table public.lighting_catalog
  add column if not exists unit_cost numeric,
  add column if not exists labor_cost numeric,
  add column if not exists saso_cert_ref text,
  add column if not exists datasheet_ref text;

-- ---------------------------------------------------------------------------
-- projects: TARSHID Project_Info fields (all nullable; lat/lng NOT added —
-- location_lat/location_lng exist since 0026; buildings count stays derived).
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists entity_name_ar text,
  add column if not exists entity_poc_name text,
  add column if not exists entity_poc_position text,
  add column if not exists entity_poc_mobile text,
  add column if not exists entity_poc_email text,
  add column if not exists tarshid_poc_name text,
  add column if not exists tarshid_poc_position text,
  add column if not exists tarshid_poc_mobile text,
  add column if not exists tarshid_poc_email text;

-- ---------------------------------------------------------------------------
-- RLS: read = all authenticated; write = pmo/admin. Import UPSERTs (insert +
-- update); no delete grant anywhere — retire is the only removal.
-- ---------------------------------------------------------------------------
alter table public.old_model_registry enable row level security;
drop policy if exists oldreg_read on public.old_model_registry;
create policy oldreg_read on public.old_model_registry for select to authenticated using (true);
drop policy if exists oldreg_ins on public.old_model_registry;
create policy oldreg_ins on public.old_model_registry for insert to authenticated
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
drop policy if exists oldreg_upd on public.old_model_registry;
create policy oldreg_upd on public.old_model_registry for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.old_model_registry to authenticated;

alter table public.approved_baseline_units enable row level security;
drop policy if exists baseline_read on public.approved_baseline_units;
create policy baseline_read on public.approved_baseline_units for select to authenticated using (true);
drop policy if exists baseline_ins on public.approved_baseline_units;
create policy baseline_ins on public.approved_baseline_units for insert to authenticated
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
drop policy if exists baseline_upd on public.approved_baseline_units;
create policy baseline_upd on public.approved_baseline_units for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.approved_baseline_units to authenticated;

alter table public.tarshid_constants enable row level security;
drop policy if exists tconst_read on public.tarshid_constants;
create policy tconst_read on public.tarshid_constants for select to authenticated using (true);
drop policy if exists tconst_upd on public.tarshid_constants;
create policy tconst_upd on public.tarshid_constants for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, update on public.tarshid_constants to authenticated;

-- audit + realtime, consistent with 0090/0091/0092
drop trigger if exists audit_old_model_registry on public.old_model_registry;
create trigger audit_old_model_registry after insert or update or delete on public.old_model_registry
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_approved_baseline_units on public.approved_baseline_units;
create trigger audit_approved_baseline_units after insert or update or delete on public.approved_baseline_units
  for each row execute function public.audit_trigger_fn();
drop trigger if exists audit_tarshid_constants on public.tarshid_constants;
create trigger audit_tarshid_constants after insert or update or delete on public.tarshid_constants
  for each row execute function public.audit_trigger_fn();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'old_model_registry') then
    alter publication supabase_realtime add table public.old_model_registry;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'approved_baseline_units') then
    alter publication supabase_realtime add table public.approved_baseline_units;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'tarshid_constants') then
    alter publication supabase_realtime add table public.tarshid_constants;
  end if;
end $$;
alter table public.old_model_registry replica identity full;
alter table public.approved_baseline_units replica identity full;
alter table public.tarshid_constants replica identity full;

-- SEAMS (later phases, not built): operating-hours capture (Phase 2), the
-- saving-sheet generator page + Draft->Approved->Shared flow (Phase 3), and
-- the AI fuzzy-matching agent via Edge Function (Phase 4).
