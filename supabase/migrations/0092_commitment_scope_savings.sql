-- Sprint 9C-1: COMMITMENT ENGINE + SCOPE LIFECYCLE + SAVINGS METERS.
-- TARSHID contracts commit BASELINE SAVINGS (kWh/yr) per category — never unit
-- or building counts. The commitment is a versioned, append-only ledger
-- (effective value = latest revision) because TARSHID can move the target
-- mid-project. Buildings carry a scope lifecycle (candidate/in_scope/surplus);
-- "surveyed" is DERIVED (>=1 survey entry), never stored. Field teams survey in
-- ANY order — nothing here assumes sequence.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'commitment_change_type') then
    create type public.commitment_change_type as enum ('initial', 'increase', 'decrease');
  end if;
  if not exists (select 1 from pg_type where typname = 'building_scope_status') then
    create type public.building_scope_status as enum ('candidate', 'in_scope', 'surplus');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- commitment_revisions — append-only ledger; effective target = latest row
-- per (project, category). No update/delete grants: corrections are new rows.
-- ---------------------------------------------------------------------------
create table if not exists public.commitment_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category public.survey_category not null,
  value_kwh_yr numeric not null check (value_kwh_yr >= 0),
  change_type public.commitment_change_type not null default 'initial',
  reason text not null check (btrim(reason) <> ''),
  approved_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_commitrev_proj_cat on public.commitment_revisions(project_id, category, created_at desc);

alter table public.commitment_revisions enable row level security;
drop policy if exists commitment_revisions_read on public.commitment_revisions;
create policy commitment_revisions_read on public.commitment_revisions for select to authenticated using (true);
drop policy if exists commitment_revisions_ins on public.commitment_revisions;
create policy commitment_revisions_ins on public.commitment_revisions for insert to authenticated
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert on public.commitment_revisions to authenticated;

drop trigger if exists audit_commitment_revisions on public.commitment_revisions;
create trigger audit_commitment_revisions after insert or update or delete on public.commitment_revisions
  for each row execute function public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- buildings: scope lifecycle. Backfill: projects already past survey keep
-- behaving exactly as before (everything in_scope); survey-phase projects
-- start as candidates.
-- ---------------------------------------------------------------------------
alter table public.buildings
  add column if not exists scope_status public.building_scope_status not null default 'candidate',
  add column if not exists scope_reason text,
  add column if not exists scope_changed_by uuid references public.profiles(id),
  add column if not exists scope_changed_at timestamptz;
create index if not exists idx_buildings_scope on public.buildings(project_id, scope_status);

update public.buildings b set scope_status = 'in_scope'
from public.projects p
where p.id = b.project_id and p.phase <> 'survey' and b.scope_status = 'candidate';

-- ---------------------------------------------------------------------------
-- projects: freeze state + configurable freeze margin + phase-override reason
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists scope_frozen_at timestamptz,
  add column if not exists scope_frozen_by uuid references public.profiles(id),
  add column if not exists savings_margin_pct numeric not null default 110 check (savings_margin_pct >= 100),
  add column if not exists phase_change_reason text;

-- ---------------------------------------------------------------------------
-- survey_entries: link to the approved-equipment catalog (the REPLACEMENT
-- unit). One polymorphic id — lighting entries point at lighting_catalog, ac at
-- ac_catalog — with a trigger enforcing existence per category (a plain FK
-- cannot span two tables). sensor/other have no replacement catalog.
-- ---------------------------------------------------------------------------
alter table public.survey_entries add column if not exists catalog_item_id uuid;
create index if not exists idx_survey_catalog_item on public.survey_entries(catalog_item_id);

create or replace function public.survey_entry_catalog_check()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.catalog_item_id is null then return new; end if;
  if new.category = 'lighting'::public.survey_category then
    if not exists (select 1 from public.lighting_catalog where id = new.catalog_item_id) then
      raise exception 'catalog_item_id not found in lighting_catalog';
    end if;
  elsif new.category = 'ac'::public.survey_category then
    if not exists (select 1 from public.ac_catalog where id = new.catalog_item_id) then
      raise exception 'catalog_item_id not found in ac_catalog';
    end if;
  else
    raise exception 'Only lighting and ac entries can link a catalog item';
  end if;
  return new;
end $$;
drop trigger if exists survey_entry_catalog_check on public.survey_entries;
create trigger survey_entry_catalog_check before insert or update of catalog_item_id, category on public.survey_entries
  for each row execute function public.survey_entry_catalog_check();

-- ---------------------------------------------------------------------------
-- category_hours_factors — editable savings-engine assumptions.
-- hours_per_year default 3600 (12h x 300d); assumed_old_eff = EER assumed for
-- the OLD AC unit (8). Owner-configurable defaults, flagged in the 9C summary.
-- ---------------------------------------------------------------------------
create table if not exists public.category_hours_factors (
  category public.survey_category primary key,
  hours_per_year numeric not null check (hours_per_year > 0),
  assumed_old_eff numeric check (assumed_old_eff > 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.category_hours_factors (category, hours_per_year, assumed_old_eff) values
  ('lighting', 3600, null), ('ac', 3600, 8), ('sensor', 3600, null), ('other', 3600, null)
on conflict (category) do nothing;

create or replace function public.category_hours_factors_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
drop trigger if exists category_hours_factors_touch on public.category_hours_factors;
create trigger category_hours_factors_touch before update on public.category_hours_factors
  for each row execute function public.category_hours_factors_touch();

alter table public.category_hours_factors enable row level security;
drop policy if exists chf_read on public.category_hours_factors;
create policy chf_read on public.category_hours_factors for select to authenticated using (true);
drop policy if exists chf_write on public.category_hours_factors;
create policy chf_write on public.category_hours_factors for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, update on public.category_hours_factors to authenticated;

drop trigger if exists audit_category_hours_factors on public.category_hours_factors;
create trigger audit_category_hours_factors after insert or update or delete on public.category_hours_factors
  for each row execute function public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- v_project_savings — per (project, category):
--   committed            = latest commitment revision
--   surveyed_potential   = Σ over LINKED entries in non-surplus buildings:
--       lighting: (old W − new W)/1000 × qty × hours
--       ac:       (oldTR×12000/assumed_old_eff − newBTU/SEER|IEER)/1000 × qty × hours
--   unestimated_entries  = entries that cannot be estimated (no catalog link
--                          or missing old-load fields)
--   achieved_kwh_yr      = 0 SEAM: requires an install_log→catalog mapping that
--                          does not exist in the data model yet (9C-4/saving
--                          sheet). Truthful today: survey-phase projects have
--                          no installed units.
-- security_invoker so readers see only projects their RLS allows.
-- ---------------------------------------------------------------------------
create or replace view public.v_project_savings
with (security_invoker = on) as
with entry_calc as (
  select se.project_id, se.category,
    case
      when se.category = 'lighting'::public.survey_category and lc.id is not null
           and se.wattage is not null and lc.wattage_w is not null
        then greatest(0, se.wattage - lc.wattage_w) / 1000.0 * se.qty * f.hours_per_year
      when se.category = 'ac'::public.survey_category and ac.id is not null
           and se.tr is not null and ac.capacity_btu is not null and coalesce(ac.seer, ac.ieer) is not null
        then greatest(0, se.tr * 12000.0 / coalesce(f.assumed_old_eff, 8)
                         - ac.capacity_btu / coalesce(ac.seer, ac.ieer)) / 1000.0 * se.qty * f.hours_per_year
      else null
    end as kwh_yr
  from public.survey_entries se
  join public.buildings b on b.id = se.building_id and b.scope_status <> 'surplus'
  left join public.lighting_catalog lc on lc.id = se.catalog_item_id and se.category = 'lighting'::public.survey_category
  left join public.ac_catalog ac on ac.id = se.catalog_item_id and se.category = 'ac'::public.survey_category
  left join public.category_hours_factors f on f.category = se.category
),
agg as (
  select project_id, category,
    coalesce(sum(kwh_yr), 0) as surveyed,
    count(*) filter (where kwh_yr is null) as unest,
    count(*) as total
  from entry_calc group by 1, 2
),
eff as (
  select distinct on (project_id, category) project_id, category, value_kwh_yr
  from public.commitment_revisions
  order by project_id, category, created_at desc, id desc
),
spine as (
  select project_id, category from agg
  union
  select project_id, category from eff
)
select s.project_id, s.category,
  e.value_kwh_yr as committed_kwh_yr,
  coalesce(a.surveyed, 0) as surveyed_potential_kwh_yr,
  coalesce(a.unest, 0) as unestimated_entries,
  coalesce(a.total, 0) as total_entries,
  0::numeric as achieved_kwh_yr
from spine s
left join agg a on a.project_id = s.project_id and a.category = s.category
left join eff e on e.project_id = s.project_id and e.category = s.category;
grant select on public.v_project_savings to authenticated;

-- ---------------------------------------------------------------------------
-- freeze / unfreeze. NULL-safe role guards ("is distinct from"): a plain
-- `not (role = any(...))` is NULL for a role-less caller and fails OPEN —
-- the exact bug caught in 9B.
-- ---------------------------------------------------------------------------
create or replace function public.freeze_project_scope(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_in int; v_sur int;
begin
  if public.auth_role() is distinct from 'pmo'::public.user_role
     and public.auth_role() is distinct from 'admin'::public.user_role then
    raise exception 'Only PMO or admin can freeze the project scope';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found';
  end if;
  -- candidates that HAVE survey entries -> in_scope
  update public.buildings b
     set scope_status = 'in_scope', scope_changed_by = auth.uid(), scope_changed_at = now(),
         scope_reason = 'In scope at freeze'
   where b.project_id = p_project_id and b.scope_status = 'candidate'
     and exists (select 1 from public.survey_entries se where se.building_id = b.id);
  get diagnostics v_in = row_count;
  -- remaining candidates -> surplus (auto reason; manual excludes untouched)
  update public.buildings b
     set scope_status = 'surplus', scope_changed_by = auth.uid(), scope_changed_at = now(),
         scope_reason = 'commitment coverage reached'
   where b.project_id = p_project_id and b.scope_status = 'candidate';
  get diagnostics v_sur = row_count;
  update public.projects set scope_frozen_at = now(), scope_frozen_by = auth.uid(), updated_at = now()
   where id = p_project_id;
  return jsonb_build_object('ok', true, 'in_scope', v_in, 'surplus', v_sur);
end $$;
grant execute on function public.freeze_project_scope(uuid) to authenticated;

-- Unfreeze reopens ONLY auto-surplus rows (reason = 'commitment coverage
-- reached'). Manually excluded buildings keep their status + reason — least
-- destructive; flagged in the 9C summary.
create or replace function public.unfreeze_project_scope(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_re int;
begin
  if public.auth_role() is distinct from 'pmo'::public.user_role
     and public.auth_role() is distinct from 'admin'::public.user_role then
    raise exception 'Only PMO or admin can unfreeze the project scope';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found';
  end if;
  update public.buildings b
     set scope_status = 'candidate', scope_changed_by = auth.uid(), scope_changed_at = now(),
         scope_reason = 'Scope unfrozen'
   where b.project_id = p_project_id and b.scope_status = 'surplus'
     and b.scope_reason = 'commitment coverage reached';
  get diagnostics v_re = row_count;
  update public.projects set scope_frozen_at = null, scope_frozen_by = null, updated_at = now()
   where id = p_project_id;
  return jsonb_build_object('ok', true, 'reopened', v_re);
end $$;
grant execute on function public.unfreeze_project_scope(uuid) to authenticated;

-- A revision that RAISES the effective target while scope is frozen must
-- auto-unfreeze (TARSHID said "do more" — the surplus pool reopens). Runs as
-- definer so the row-writer (pmo/admin per RLS) doesn't need buildings-wide
-- update rights.
create or replace function public.commitment_rev_auto_unfreeze()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare prev numeric; frozen timestamptz;
begin
  select value_kwh_yr into prev from public.commitment_revisions
   where project_id = new.project_id and category = new.category and id <> new.id
   order by created_at desc, id desc limit 1;
  select scope_frozen_at into frozen from public.projects where id = new.project_id;
  if frozen is not null and (prev is null or new.value_kwh_yr > prev) then
    update public.buildings b
       set scope_status = 'candidate', scope_changed_by = coalesce(auth.uid(), new.approved_by), scope_changed_at = now(),
           scope_reason = 'Auto-unfrozen: commitment raised'
     where b.project_id = new.project_id and b.scope_status = 'surplus'
       and b.scope_reason = 'commitment coverage reached';
    update public.projects set scope_frozen_at = null, scope_frozen_by = null, updated_at = now()
     where id = new.project_id;
  end if;
  return null;
end $$;
drop trigger if exists commitment_rev_auto_unfreeze on public.commitment_revisions;
create trigger commitment_rev_auto_unfreeze after insert on public.commitment_revisions
  for each row execute function public.commitment_rev_auto_unfreeze();

-- ---------------------------------------------------------------------------
-- Phase guard: survey -> saving_sheet requires a frozen scope; pmo/admin can
-- override with a reason (stored on the project + audit-logged). The (uuid)
-- overload is dropped first so PostgREST resolves a single function.
-- ---------------------------------------------------------------------------
drop function if exists public.advance_project_phase(uuid);
create or replace function public.advance_project_phase(p_project_id uuid, p_override_reason text default null)
returns public.projects
language plpgsql security definer set search_path = ''
as $$
declare r public.projects; nextp public.project_phase;
begin
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
  if r.phase = 'survey'::public.project_phase and r.scope_frozen_at is null
     and (p_override_reason is null or btrim(p_override_reason) = '') then
    raise exception 'Freeze the project scope before moving to Saving Sheet (or provide an override reason)';
  end if;
  update public.projects
     set phase = nextp,
         phase_change_reason = nullif(btrim(coalesce(p_override_reason, '')), ''),
         updated_at = now()
   where id = p_project_id returning * into r;
  return r;
end $$;
grant execute on function public.advance_project_phase(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'commitment_revisions') then
    alter publication supabase_realtime add table public.commitment_revisions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'category_hours_factors') then
    alter publication supabase_realtime add table public.category_hours_factors;
  end if;
end $$;
alter table public.commitment_revisions replica identity full;
alter table public.category_hours_factors replica identity full;

-- SEAMS (9C-4, not built): TARSHID saving-sheet document generation from the
-- frozen snapshot; install_log -> catalog mapping to make achieved_kwh_yr live.
