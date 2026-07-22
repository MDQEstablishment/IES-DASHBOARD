-- Sprint 9B: Survey Module — the field DAILY LOG for capturing OLD (existing)
-- equipment while walking buildings. Two field teams write directly to the same
-- project; every row is attributed and merges happen live. Feeds the Saving
-- Sheet (9C). All baseline/computed/proposed columns are 9C — this table holds
-- ONLY the manual-entry columns from the ESCO "Survey Working File", plus
-- attribution. Clean seams are left for import, baseline matching, and savings.

-- ---------------------------------------------------------------------------
-- Part A: project lifecycle phase (survey -> saving_sheet -> monitoring -> closeout)
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'project_phase') then
    create type public.project_phase as enum ('survey', 'saving_sheet', 'monitoring', 'closeout');
  end if;
end $$;

alter table public.projects add column if not exists phase public.project_phase not null default 'survey';
-- Existing projects are past survey — default them to monitoring (rec ii).
-- New rows keep the column default 'survey'. Guarded so re-runs don't reset.
update public.projects set phase = 'monitoring' where phase = 'survey' and created_at < now() - interval '1 second';

-- Manual phase transition (pmo/admin only). v1 is manual; 9C will gate the
-- saving_sheet -> monitoring hop on TARSHID approval. The UPDATE is auto-audited
-- by the existing audit_projects trigger.
create or replace function public.advance_project_phase(p_project_id uuid)
returns public.projects
language plpgsql security definer set search_path = ''
as $$
declare r public.projects; nextp public.project_phase;
begin
  -- reject NULL/other roles explicitly (is distinct from is NULL-safe; a plain
  -- `not (auth_role() = any(...))` evaluates to NULL and fails OPEN when the
  -- caller has no role).
  if public.auth_role() is distinct from 'pmo'::public.user_role
     and public.auth_role() is distinct from 'admin'::public.user_role then
    raise exception 'Only PMO or admin can change the project phase';
  end if;
  select * into r from public.projects where id = p_project_id;
  if not found then raise exception 'Project not found'; end if;
  nextp := case r.phase
    when 'survey' then 'saving_sheet'::public.project_phase
    when 'saving_sheet' then 'monitoring'::public.project_phase
    when 'monitoring' then 'closeout'::public.project_phase
    else null end;
  if nextp is null then raise exception 'Project is already at the final phase'; end if;
  update public.projects set phase = nextp, updated_at = now() where id = p_project_id returning * into r;
  return r;
end $$;
grant execute on function public.advance_project_phase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Part B: survey_entries — one row = one OLD equipment line in one room
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'survey_category') then
    create type public.survey_category as enum ('lighting', 'ac', 'sensor', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'survey_source') then
    create type public.survey_source as enum ('manual', 'import');
  end if;
end $$;

create table if not exists public.survey_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  -- location
  floor text,
  room_name text,
  room_type text,
  room_width numeric,
  room_height numeric,
  room_area numeric,                 -- client auto-fills w*h (editable); m2_per_ton is display-only (9C)
  -- old unit
  category public.survey_category not null,
  equipment_type text,
  make text,
  model text,
  size_category text,
  tr numeric,                        -- AC tonnage
  wattage numeric,                   -- lighting watts
  qty integer not null default 1 check (qty >= 0),
  inverter boolean,                  -- AC
  age_years numeric,
  remarks text,
  -- photos: storage keys in the daily-progress-photos bucket, prefix survey/<building_id>/
  photo_room_path text,
  photo_indoor_path text,
  photo_nameplate_path text,
  -- attribution
  source public.survey_source not null default 'manual',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_survey_project on public.survey_entries(project_id);
create index if not exists idx_survey_building on public.survey_entries(building_id);
create index if not exists idx_survey_project_created on public.survey_entries(project_id, created_at desc);
create index if not exists idx_survey_creator on public.survey_entries(created_by);

-- updated_by/updated_at maintenance
create or replace function public.survey_entries_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
drop trigger if exists survey_entries_touch on public.survey_entries;
create trigger survey_entries_touch before update on public.survey_entries
  for each row execute function public.survey_entries_touch();

-- audit
drop trigger if exists audit_survey_entries on public.survey_entries;
create trigger audit_survey_entries after insert or update or delete on public.survey_entries
  for each row execute function public.audit_trigger_fn();

-- RLS: read = project readers (whole project, so both field teams see each other
-- live); insert = assigned engineers + PM + pmo/admin; update/delete = author on
-- own rows OR pmo/admin/PM on all.
alter table public.survey_entries enable row level security;

drop policy if exists survey_entries_read on public.survey_entries;
create policy survey_entries_read on public.survey_entries for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists survey_entries_ins on public.survey_entries;
create policy survey_entries_ins on public.survey_entries for insert to authenticated
  with check (public.w_bld(building_id));

drop policy if exists survey_entries_upd on public.survey_entries;
create policy survey_entries_upd on public.survey_entries for update to authenticated
  using (created_by = (select auth.uid()) or public.w_proj(project_id))
  with check (created_by = (select auth.uid()) or public.w_proj(project_id));

drop policy if exists survey_entries_del on public.survey_entries;
create policy survey_entries_del on public.survey_entries for delete to authenticated
  using (created_by = (select auth.uid()) or public.w_proj(project_id));

grant select, insert, update, delete on public.survey_entries to authenticated;

-- realtime: both teams see each other's entries the moment they land
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                 and schemaname='public' and tablename='survey_entries') then
    alter publication supabase_realtime add table public.survey_entries;
  end if;
end $$;
alter table public.survey_entries replica identity full;

-- SEAMS (9C, not built): import of filled survey workbooks (source='import'),
-- Old-Model-Registry lookup + baseline matching, savings calculations, saving-
-- sheet generation/approval + TARSHID flow, and auto-gating the survey ->
-- saving_sheet -> monitoring transitions. Left intentionally out of this table.
