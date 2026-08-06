-- 0139 — three facts stop living in JavaScript.
--
-- A3 audit, commit B. Everything here is additive: one column, one table, one
-- view. Nothing is dropped and no existing row is rewritten.
--
--   1. esms.ordinal          — the sort order that was copied into five files
--   2. public.space_types    — the fifteen survey space types that were a
--                              literal array inside a form component, while
--                              being the JOIN KEY for operating hours and EFLH
--   3. public.v_form_options — the status and ESM dropdown lists that the app
--                              and the template generator each held their own
--                              copy of
--
-- ---------------------------------------------------------------------------
-- 1. esms.ordinal
-- ---------------------------------------------------------------------------
-- `const ESM_ORDER = (c) => ({ ESM1: 1, ESM2: 2, ESM3: 3 }[c] || 9)` appeared
-- VERBATIM in five components (DailyProgress, BuildingMaterialsPlan,
-- ProjectWarehouse, MainWarehouse, InspectionFormModal). One fact, five
-- literals, and a fourth ESM would sort into a tie at 9 in all five at once.
-- project_esms already carries an `ordinal`; the catalogue itself did not.
alter table public.esms add column if not exists ordinal integer;

-- Backfill from the existing codes. The three rows are ESM1/ESM2/ESM3, so the
-- numeric tail IS the order that the five literals encoded — this migration
-- preserves the behaviour it centralises rather than re-deciding it.
update public.esms
   set ordinal = coalesce(nullif(regexp_replace(code, '\D', '', 'g'), '')::int, 999)
 where ordinal is null;

alter table public.esms alter column ordinal set default 999;
alter table public.esms alter column ordinal set not null;
create index if not exists idx_esms_ordinal on public.esms(ordinal);

-- ---------------------------------------------------------------------------
-- 2. space_types
-- ---------------------------------------------------------------------------
-- ROOM_TYPES was a fifteen-element array at src/components/survey/EntryForm.jsx:19.
-- It reads like presentation and is not: survey_entries.room_type is the join
-- key that operating hours and EFLH resolve on (savingSheet.js:340,
-- lightingSavings.js:274, savingSheetGen.js:91, the sync_operating_hours path),
-- and a missing space type is a BLOCKING readiness item on the saving sheet.
-- A datalist option is therefore a reference row, and it belongs here where it
-- can be extended, relabelled or retired without a deploy.
create table if not exists public.space_types (
  code       text primary key,
  label      text not null,
  ordinal    integer not null default 999,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create index if not exists idx_space_types_ordinal on public.space_types(ordinal) where active;

-- Seeded with exactly the fifteen that were in the component, in the order
-- they were in, and with `code` = `label`. That equality is deliberate: the
-- historical survey_entries.room_type values ARE those display strings, so a
-- code that differed would orphan every row already captured. A later
-- migration may introduce stable codes; it must carry the data with it.
insert into public.space_types (code, label, ordinal) values
  ('Office', 'Office', 1),
  ('Corridor', 'Corridor', 2),
  ('Toilet', 'Toilet', 3),
  ('Meeting Room', 'Meeting Room', 4),
  ('Lobby', 'Lobby', 5),
  ('Reception', 'Reception', 6),
  ('Ward', 'Ward', 7),
  ('Clinic', 'Clinic', 8),
  ('Laboratory', 'Laboratory', 9),
  ('Warehouse', 'Warehouse', 10),
  ('Kitchen', 'Kitchen', 11),
  ('Electrical Room', 'Electrical Room', 12),
  ('Staircase', 'Staircase', 13),
  ('Parking', 'Parking', 14),
  ('Outdoor', 'Outdoor', 15)
on conflict (code) do nothing;

drop trigger if exists space_types_touch on public.space_types;
create trigger space_types_touch before update on public.space_types
  for each row execute function public.tarshid_ref_touch();

alter table public.space_types enable row level security;
drop policy if exists space_types_read on public.space_types;
create policy space_types_read on public.space_types for select to authenticated using (true);
drop policy if exists space_types_ins on public.space_types;
create policy space_types_ins on public.space_types for insert to authenticated
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
drop policy if exists space_types_upd on public.space_types;
create policy space_types_upd on public.space_types for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.space_types to authenticated;

drop trigger if exists audit_space_types on public.space_types;
create trigger audit_space_types after insert or update or delete on public.space_types
  for each row execute function public.audit_trigger_fn();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'space_types') then
    alter publication supabase_realtime add table public.space_types;
  end if;
end $$;
alter table public.space_types replica identity full;

-- ---------------------------------------------------------------------------
-- 3. v_form_options — the dropdown lists, once
-- ---------------------------------------------------------------------------
-- ProjectModals.jsx held STATUSES, BSTATUSES and ESMS; the Excel template
-- generator held its own copies of the same three at five call sites. The app
-- validated an imported ESM against three string literals, so a fourth ESM
-- could not be imported without a deploy.
--
-- WHY THIS IS A VIEW OVER pg_enum AND NOT A NEW TABLE. The enum IS the source
-- of truth — the column type refuses anything else — so a table would be a
-- second copy with the same drift risk in a different place.
--
-- WHY TWO LABELS ARE EXCLUDED, and why that exclusion belongs in the database.
-- `project_status.deleted` and `building_status.archived` are lifecycle states
-- reached only through their own controls (soft delete, archive). They are
-- legal column values and must never be offered as a free choice in a form —
-- picking "deleted" from a dropdown would soft-delete a project through a
-- path with no confirmation and no reason captured. That is a real rule, it
-- was previously enforced by the app happening to omit them from two arrays,
-- and it is now stated once, here.
create or replace view public.v_form_options as
  select 'project_status'::text as domain,
         e.enumlabel::text      as value,
         initcap(replace(e.enumlabel::text, '_', ' ')) as label,
         e.enumsortorder::int   as ordinal
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'project_status'
     and e.enumlabel <> 'deleted'
  union all
  select 'building_status',
         e.enumlabel::text,
         initcap(replace(e.enumlabel::text, '_', ' ')),
         e.enumsortorder::int
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'building_status'
     and e.enumlabel <> 'archived'
  union all
  select 'esm', s.code, s.name, s.ordinal
    from public.esms s;

grant select on public.v_form_options to authenticated;

-- ---------------------------------------------------------------------------
-- proof
-- ---------------------------------------------------------------------------
do $$
declare n int; txt text;
begin
  -- ---- 1. esms.ordinal ----------------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='esms' and column_name='ordinal'
     and is_nullable='NO' and data_type='integer';
  if n <> 1 then raise exception 'FAIL: esms.ordinal is not a NOT NULL integer'; end if;
  select count(*) into n from public.esms where ordinal is null;
  if n <> 0 then raise exception 'FAIL: % esms rows still have a null ordinal', n; end if;
  -- the backfill must reproduce EXACTLY the order the five JS literals encoded
  select string_agg(code, ',' order by ordinal, code) into txt from public.esms;
  if txt <> 'ESM1,ESM2,ESM3' then
    raise exception 'FAIL: ordinal does not reproduce the ESM1,ESM2,ESM3 order the five literals held — got %', txt;
  end if;
  select count(*) into n from public.esms where (code,ordinal) in (('ESM1',1),('ESM2',2),('ESM3',3));
  if n <> 3 then raise exception 'FAIL: expected ordinals 1,2,3 on ESM1,ESM2,ESM3 — found % matching', n; end if;
  raise notice 'PASS 0139/1: esms.ordinal present, backfilled, and ordering ESM1,ESM2,ESM3';

  -- ---- 2. space_types -----------------------------------------------------
  select count(*) into n from public.space_types;
  if n <> 15 then raise exception 'FAIL: space_types should hold the 15 seeded types, found %', n; end if;
  select count(*) into n from public.space_types where active;
  if n <> 15 then raise exception 'FAIL: all 15 space types should be active, found %', n; end if;
  -- exactly the fifteen strings from EntryForm.jsx:19, in the same order
  select string_agg(label, '|' order by ordinal) into txt from public.space_types;
  if txt <> 'Office|Corridor|Toilet|Meeting Room|Lobby|Reception|Ward|Clinic|Laboratory|Warehouse|Kitchen|Electrical Room|Staircase|Parking|Outdoor' then
    raise exception 'FAIL: space_types is not the fifteen from the component, in order — got %', txt;
  end if;
  -- code = label, so no survey_entries.room_type value is orphaned
  select count(*) into n from public.space_types where code <> label;
  if n <> 0 then raise exception 'FAIL: % space_types rows have code <> label, which would orphan captured survey rows', n; end if;
  select count(*) into n from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relname='space_types';
  if n <> 3 then raise exception 'FAIL: space_types should carry 3 policies (read/ins/upd), found %', n; end if;
  raise notice 'PASS 0139/2: space_types holds the 15 types in order, code=label, RLS on with 3 policies';

  -- ---- 3. v_form_options --------------------------------------------------
  select count(*) into n from public.v_form_options where domain='project_status';
  if n <> 4 then raise exception 'FAIL: expected 4 selectable project statuses, found %', n; end if;
  select count(*) into n from public.v_form_options where domain='project_status' and value='deleted';
  if n <> 0 then raise exception 'FAIL: "deleted" is offerable as a project status — the soft-delete path would be reachable from a dropdown'; end if;
  select string_agg(value, ',' order by ordinal) into txt from public.v_form_options where domain='project_status';
  if txt <> 'active,draft,on_hold,closed' then
    raise exception 'FAIL: project statuses do not match the array ProjectModals held — got %', txt;
  end if;

  select count(*) into n from public.v_form_options where domain='building_status';
  if n <> 5 then raise exception 'FAIL: expected 5 selectable building statuses, found %', n; end if;
  select count(*) into n from public.v_form_options where domain='building_status' and value='archived';
  if n <> 0 then raise exception 'FAIL: "archived" is offerable as a building status'; end if;
  select string_agg(value, ',' order by ordinal) into txt from public.v_form_options where domain='building_status';
  if txt <> 'pending,in_progress,signed,on_hold,blocked' then
    raise exception 'FAIL: building statuses do not match the array ProjectModals held — got %', txt;
  end if;

  select string_agg(value, ',' order by ordinal) into txt from public.v_form_options where domain='esm';
  if txt <> 'ESM1,ESM2,ESM3' then raise exception 'FAIL: esm options are not ESM1,ESM2,ESM3 — got %', txt; end if;
  raise notice 'PASS 0139/3: v_form_options reproduces all three arrays exactly, with deleted/archived withheld';
end $$;
