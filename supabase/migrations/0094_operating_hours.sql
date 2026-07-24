-- Sprint 9D-2: OPERATING HOURS (OH) CAPTURE — TARSHID Instr. Step 2, zero
-- double work. OH rows are NEVER typed by hand: sync_operating_hours derives
-- one row per distinct (building, space type) from survey_entries; ESCO fills
-- ONLY start/end/days/weeks + EFLH (TARSHID regional calculator value).
-- hours_per_year follows TARSHID's Excel formula exactly, incl. overnight
-- shifts: ROUNDUP(((end-start)+(end<start))*24, 1) * days * weeks.

create table if not exists public.operating_hours (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  space_type text not null,                              -- normalized initcap(btrim(room_type))
  start_time time,
  end_time time,
  days_per_week integer check (days_per_week between 1 and 7),
  weeks_per_year integer check (weeks_per_year between 1 and 52),
  eflh numeric check (eflh > 0),                          -- TARSHID regional calculator (manual)
  note text,
  -- TARSHID daily hours: ROUNDUP(((end-start)+(end<start))*24, 1).
  -- 16:00 -> 08:00 crosses midnight = 16 h/day (the Instr. example).
  daily_hours numeric generated always as (
    case when start_time is null or end_time is null then null
      else ceil(((extract(epoch from end_time) - extract(epoch from start_time)) / 3600.0
           + case when end_time < start_time then 24 else 0 end) * 10.0) / 10.0 end
  ) stored,
  hours_per_year numeric generated always as (
    case when start_time is null or end_time is null or days_per_week is null or weeks_per_year is null then null
      else (ceil(((extract(epoch from end_time) - extract(epoch from start_time)) / 3600.0
           + case when end_time < start_time then 24 else 0 end) * 10.0) / 10.0)
           * days_per_week * weeks_per_year end
  ) stored,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (building_id, space_type)
);
create index if not exists idx_oh_project on public.operating_hours(project_id);

-- touch trigger (updated_at/updated_by) — reuses the 0093 generic fn
drop trigger if exists operating_hours_touch on public.operating_hours;
create trigger operating_hours_touch before update on public.operating_hours
  for each row execute function public.tarshid_ref_touch();

-- audit + realtime, house pattern
drop trigger if exists audit_operating_hours on public.operating_hours;
create trigger audit_operating_hours after insert or update or delete on public.operating_hours
  for each row execute function public.audit_trigger_fn();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'operating_hours') then
    alter publication supabase_realtime add table public.operating_hours;
  end if;
end $$;
alter table public.operating_hours replica identity full;

-- RLS mirrors survey_entries' write surface: read = project readers; insert +
-- update = assigned engineers / PM / pmo-admin (w_bld). NO delete grant —
-- OH rows are never deleted, even when their survey entries disappear.
alter table public.operating_hours enable row level security;
drop policy if exists oh_read on public.operating_hours;
create policy oh_read on public.operating_hours for select to authenticated
  using (public.can_read_project(project_id));
drop policy if exists oh_ins on public.operating_hours;
create policy oh_ins on public.operating_hours for insert to authenticated
  with check (public.w_bld(building_id));
drop policy if exists oh_upd on public.operating_hours;
create policy oh_upd on public.operating_hours for update to authenticated
  using (public.w_bld(building_id))
  with check (public.w_bld(building_id));
grant select, insert, update on public.operating_hours to authenticated;

-- buildings: TARSHID excludes housing/residential from the savings scope
alter table public.buildings add column if not exists is_residential boolean not null default false;

-- ---------------------------------------------------------------------------
-- v_operating_hours — display view: building context, TARSHID ref string in
-- the sheet's exact format ('8.1 Hrs X 5D X 52W'; whole hours print without a
-- trailing .0), and has_entries (rows whose survey combo disappeared stay,
-- flagged). security_invoker so project RLS applies to readers.
-- ---------------------------------------------------------------------------
create or replace view public.v_operating_hours
with (security_invoker = on) as
select oh.*,
  b.code as building_code, b.name as building_name, b.is_residential,
  exists (
    select 1 from public.survey_entries se
    where se.building_id = oh.building_id
      and initcap(btrim(coalesce(se.room_type, ''))) = oh.space_type
  ) as has_entries,
  case when oh.daily_hours is null or oh.days_per_week is null or oh.weeks_per_year is null then null
    else trim(trailing '.' from trim(trailing '0' from to_char(oh.daily_hours, 'FM9999990.9')))
         || ' Hrs X ' || oh.days_per_week || 'D X ' || oh.weeks_per_year || 'W'
  end as ref_string
from public.operating_hours oh
join public.buildings b on b.id = oh.building_id;
grant select on public.v_operating_hours to authenticated;

-- ---------------------------------------------------------------------------
-- sync_operating_hours — deterministic derivation: insert missing
-- (building, space_type) combos from survey_entries as empty OH rows.
-- Normalized initcap(btrim(...)) so 'office'/'Office ' never spawn duplicates.
-- Scope: only buildings the CALLER may write (w_bld) — a field engineer syncs
-- their own buildings, PM/pmo sync everything. Never deletes.
-- ---------------------------------------------------------------------------
create or replace function public.sync_operating_hours(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ins int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_read_project(p_project_id) then
    raise exception 'Project not readable';
  end if;
  insert into public.operating_hours (project_id, building_id, space_type, created_by)
  select distinct se.project_id, se.building_id, initcap(btrim(se.room_type)), auth.uid()
    from public.survey_entries se
   where se.project_id = p_project_id
     and coalesce(btrim(se.room_type), '') <> ''
     and public.w_bld(se.building_id)
  on conflict (building_id, space_type) do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('ok', true, 'inserted', v_ins);
end $$;
grant execute on function public.sync_operating_hours(uuid) to authenticated;

-- SEAMS (9D-3/9D-4, not built): saving-sheet readiness gate over OH
-- completeness, the generator page, and AI-assisted EFLH suggestions.
