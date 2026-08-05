-- Saving Sheet sprint, U2 (commit B of two) — the rest of the foundation.
--
-- Commit A landed the registry mirrors (0133 + 0134) because the owner fixed
-- the build order as "registry import first, pure data, no design risk". This
-- migration is everything else U2 owes: the four missing constants, the three
-- lighting survey columns, provenance on operating hours and EFLH, the
-- catalog_costs split that 9L pre-assigned to this sprint, template versioning
-- per design §0.3, and the release gate per §0.1(4).
--
-- Additive throughout. No column is dropped, no data is rewritten. The only
-- removals are the three 0121 objects, and 9L authorises those by name.

-- ===========================================================================
-- 1. THE FOUR MISSING CONSTANTS (design §2)
-- ===========================================================================
-- tarshid_constants held exactly four rows (tariff, seasonal_factor,
-- capacity_tolerance_pct, min_savings_pct). The lighting math needs four more.
--
-- ⚠ TRAP FOR U3 — READ BEFORE ASSUMING THESE ROWS DO ANYTHING. Seeding them
-- here changes NOTHING on its own. src/lib/savingSheet.js loadConstants() is:
--
--     data.forEach((r) => { if (r.key in out) out[r.key] = Number(r.value) })
--
-- where `out` starts as a copy of CONST_DEFAULTS. That `if (r.key in out)` is
-- an ALLOW-LIST: any DB key not already a property of CONST_DEFAULTS is read
-- and silently discarded. So U3 MUST extend CONST_DEFAULTS with these four
-- keys, and must add the round-trip test (T-K1) that every seeded key survives
-- loadConstants — otherwise the engine keeps using the hardcoded 12000 at
-- savingSheet.js:71/:82 and no lighting derating at all, while this table
-- looks correct to anyone reading it.
--
-- seasonal_factor is NOT touched here. Its fate is C2's and an approved
-- TARSHID AC workbook's fixtures decide it (design §1.2); a migration is not
-- the place to guess.
insert into public.tarshid_constants (key, value, description) values
  ('lighting_derating',        0.9,   'Lighting savings derating factor (TARSHID lighting workbook). Distinct from seasonal_factor: different constant, different meaning, applied to lighting only.'),
  ('control_derating',         0.9,   'Derating applied to the lighting-control baseline before the savings fraction.'),
  ('control_savings_fraction', 0.3,   'Fraction of the derated control baseline counted as control savings.'),
  ('btu_per_ton',              12000, 'BTU/h per refrigeration ton. Replaces the literal 12000 at savingSheet.js:71 and :82 (U3).')
on conflict (key) do nothing;

-- ===========================================================================
-- 2. THE THREE LIGHTING SURVEY COLUMNS (design §4)
-- ===========================================================================
-- Lighting survey capture is `wattage` only today — no lamps-per-fixture, no
-- lamp load, no control flag — so the lighting engine has nothing to compute
-- from. All three are NULLABLE: every existing lighting survey row predates
-- them and must stay valid. The checks reject nonsense without demanding a
-- value, so a row is either silent or sane, never wrong.
--
-- has_control is per survey row on purpose. The workbook's control formula is
-- IF(control = yes, baseline - savings, 0), which binds control savings to the
-- spaces that actually received control; a building-level shortcut would
-- invent savings for rooms that got none (design §9).
alter table public.survey_entries
  add column if not exists lamps_per_fixture integer,
  add column if not exists lamp_load_w numeric,
  add column if not exists has_control boolean;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'survey_entries_lamps_per_fixture_pos') then
    alter table public.survey_entries
      add constraint survey_entries_lamps_per_fixture_pos check (lamps_per_fixture is null or lamps_per_fixture > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'survey_entries_lamp_load_w_pos') then
    alter table public.survey_entries
      add constraint survey_entries_lamp_load_w_pos check (lamp_load_w is null or lamp_load_w > 0);
  end if;
end $$;

comment on column public.survey_entries.lamps_per_fixture is
  'Lamps in the surveyed fitting. Nullable — AC rows and pre-U2 lighting rows have none.';
comment on column public.survey_entries.lamp_load_w is
  'Per-lamp load in watts, as surveyed. Nullable.';
comment on column public.survey_entries.has_control is
  'Did this space receive lighting control? Per row, never inferred building-wide (design §9).';

-- ===========================================================================
-- 3. PROVENANCE ON OPERATING HOURS AND EFLH (design §7.4)
-- ===========================================================================
-- "A well-formatted document gets rubber-stamped; provenance is what makes the
-- review real." Two independent facts live on one operating_hours row —
-- hours_per_year (which IES computes) and eflh (which the ESCO supplies from
-- TARSHID's regional calculator, §3) — so each gets its own provenance and its
-- own source reference. Recording one for both would let a measured hours
-- figure lend its credibility to an assumed EFLH.
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'input_provenance') then
    create type public.input_provenance as enum ('measured', 'supplied', 'assumed');
  end if;
end $$;

alter table public.operating_hours
  add column if not exists hours_provenance public.input_provenance,
  add column if not exists hours_source_ref text,
  add column if not exists eflh_provenance  public.input_provenance,
  add column if not exists eflh_source_ref  text;

comment on column public.operating_hours.eflh_provenance is
  'measured / supplied / assumed. EFLH is an ESCO-supplied input — IES holds no regional calculator (design §3) — so in practice this is "supplied" and eflh_source_ref names the calculator output or entity letter.';
comment on column public.operating_hours.hours_source_ref is
  'Free text: the entity letter, the site collection, whatever the hours came from.';

-- ===========================================================================
-- 4. THE catalog_costs SPLIT — 9L's deferred work, unparked here
-- ===========================================================================
-- Quoting docs/9L-decisions.md:99-119 as the pre-authorisation for the three
-- drops below, because dropping another migration's objects should never rest
-- on the judgement of the person doing it:
--
--   "### ⚠ This is temporary, and the Saving Sheet sprint removes it
--    The trigger is scaffolding, not the design. The permanent design is the
--    structural split: a separate catalog_costs table with pmo/admin RLS ...
--    That work is deferred, not cancelled. It lands in whichever sprint
--    unparks the Saving Sheet feature (FEATURES.savingSheet) ...
--    Backlog item — do not re-litigate:
--    > Drop trg_lighting_cost_closed, trg_ac_cost_closed and
--    > public.catalog_cost_closed(); create catalog_costs (pmo/admin RLS);
--    > migrate unit_cost/labor_cost off lighting_catalog and ac_catalog ..."
--
-- This is that sprint. What changes and what does not:
--   * catalog_costs is created, pmo/admin for EVERY command including SELECT.
--     That is the whole point — 9L proved a column-level REVOKE is a no-op
--     while the table grant stands, and that Supabase runs every signed-in
--     user as one `authenticated` role so grants cannot tell a pmo from a
--     projm. A separate table CAN, because RLS is row-level and every row here
--     is a cost.
--   * "migrate unit_cost/labor_cost" is a no-op by construction: 0121's write
--     ban has kept both columns empty since it shipped. The guard below
--     re-verifies that rather than trusting it, and ABORTS if a cost appeared.
--   * The deprecated columns STAY, with all 33 code references, and stay NULL
--     forever — enforced by a narrow trigger that fires only on a non-null
--     write. Dropping them would break eight files this migration does not
--     touch; U3 carries that rewire.
do $$
declare n_light int; n_ac int;
begin
  select count(*) into n_light from public.lighting_catalog
   where unit_cost is not null or labor_cost is not null;
  select count(*) into n_ac from public.ac_catalog
   where unit_cost is not null or labor_cost is not null;
  if n_light <> 0 or n_ac <> 0 then
    raise exception
      'ABORT: the deprecated catalog cost columns are not empty (lighting=%, ac=%). 0121''s ban was supposed to guarantee this. Move those costs into catalog_costs by hand first, then re-apply — this migration will not strand them.',
      n_light, n_ac;
  end if;
  raise notice 'PASS: both deprecated cost columns are empty (lighting=0, ac=0) — the split migrates nothing, as 9L predicted';
end $$;

create table if not exists public.catalog_costs (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one target. Two nullable FKs rather than a (catalog, item_id) pair
  -- so the database keeps referential integrity and cascades a delete; a text
  -- discriminator would have neither.
  ac_item_id       uuid references public.ac_catalog(id) on delete cascade,
  lighting_item_id uuid references public.lighting_catalog(id) on delete cascade,
  unit_cost  numeric check (unit_cost  is null or unit_cost  >= 0),
  labor_cost numeric check (labor_cost is null or labor_cost >= 0),
  currency text not null default 'SAR',
  note text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint catalog_costs_one_target check (num_nonnulls(ac_item_id, lighting_item_id) = 1),
  unique (ac_item_id),
  unique (lighting_item_id)
);

comment on table public.catalog_costs is
  '9L''s permanent design, delivered: equipment costs live in their own pmo/admin-only table instead of on the catalogues, because Supabase runs every signed-in user as one `authenticated` role and grants therefore cannot hide a column from a projm without hiding it from the PMO too. RLS on a cost-only table can.';

drop trigger if exists catalog_costs_touch on public.catalog_costs;
create trigger catalog_costs_touch before update on public.catalog_costs
  for each row execute function public.tarshid_ref_touch();

alter table public.catalog_costs enable row level security;
-- No public read policy anywhere: a role that is not pmo/admin sees zero rows.
drop policy if exists catcost_rw on public.catalog_costs;
create policy catcost_rw on public.catalog_costs for all to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update, delete on public.catalog_costs to authenticated;

drop trigger if exists audit_catalog_costs on public.catalog_costs;
create trigger audit_catalog_costs after insert or update or delete on public.catalog_costs
  for each row execute function public.audit_trigger_fn();

-- --- the three 0121 objects, dropped per 9L ---------------------------------
drop trigger if exists trg_lighting_cost_closed on public.lighting_catalog;
drop trigger if exists trg_ac_cost_closed on public.ac_catalog;
drop function if exists public.catalog_cost_closed();

-- --- and the narrow replacement: the deprecated columns stay NULL forever ---
-- 0121's trigger said "this restriction is temporary". This one is permanent
-- and says so, because the real home now exists.
create or replace function public.catalog_cost_column_deprecated()
returns trigger
language plpgsql
as $$
begin
  if new.unit_cost is not null or new.labor_cost is not null then
    raise exception
      'The unit_cost and labor_cost columns on the % catalogue are deprecated and stay empty. Equipment costs live in the separate "catalog_costs" table, which only the PMO and administrators can see. Write the cost there and leave these blank. Offending item: %.',
      tg_table_name,
      coalesce(nullif(btrim(new.model), ''), 'row id ' || coalesce(new.id::text, '(new)'))
      using errcode = 'check_violation',
            hint = 'This is permanent, not scaffolding — the catalog_costs split shipped.';
  end if;
  return new;
end $$;

comment on function public.catalog_cost_column_deprecated() is
  'Keeps the deprecated catalogue cost columns NULL now that catalog_costs exists. Replaces 0121''s temporary catalog_cost_closed(), which was dropped in this migration under the 9L:99-119 pre-authorisation.';

drop trigger if exists trg_lighting_cost_deprecated on public.lighting_catalog;
create trigger trg_lighting_cost_deprecated
  before insert or update of unit_cost, labor_cost on public.lighting_catalog
  for each row execute function public.catalog_cost_column_deprecated();

drop trigger if exists trg_ac_cost_deprecated on public.ac_catalog;
create trigger trg_ac_cost_deprecated
  before insert or update of unit_cost, labor_cost on public.ac_catalog
  for each row execute function public.catalog_cost_column_deprecated();

-- ===========================================================================
-- 5. TEMPLATE VERSIONING (design §0.3) + THE TWO REPO ARTEFACTS
-- ===========================================================================
-- AC and Lighting are different TARSHID workbooks, so "the active template" is
-- ambiguous until `kind` exists and uniqueness becomes one active per kind.
alter table public.saving_sheet_templates
  add column if not exists kind text,
  add column if not exists tarshid_label text,
  add column if not exists sha256 text;

-- Backfill before constraining: the single existing row is TARSHID's AC blank.
update public.saving_sheet_templates set kind = 'ac' where kind is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'saving_sheet_templates_kind_chk') then
    alter table public.saving_sheet_templates
      add constraint saving_sheet_templates_kind_chk check (kind in ('ac', 'lighting'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saving_sheet_templates_sha256_chk') then
    alter table public.saving_sheet_templates
      add constraint saving_sheet_templates_sha256_chk check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;
alter table public.saving_sheet_templates alter column kind set not null;

-- One ACTIVE template per kind. Partial, so the version history stays.
drop index if exists saving_sheet_templates_one_active_per_kind;
create unique index saving_sheet_templates_one_active_per_kind
  on public.saving_sheet_templates (kind) where active;

comment on column public.saving_sheet_templates.tarshid_label is
  'TARSHID''s own version string, kept separate from our storage `version`: our v3 may be TARSHID''s v2 revised 2026-09 (design §0.3).';
comment on column public.saving_sheet_templates.sha256 is
  'Hash of the exact artefact bytes. The fixture pin (T-FIX) and the §0.4 reference-sheet diff both bind to this, not to the filename.';

-- The two repo artefacts, registered INACTIVE and hash-pinned.
--
-- INACTIVE is deliberate and is not a placeholder. Design §0.5: the bytes are
-- in the repo, not in the bucket — this environment cannot write storage
-- objects — so storage_path points at the committed file. Activating either
-- row before the upload happens would make the generator fetch an object that
-- is not there, and activating the AC one would additionally displace the
-- template that is live today. Activation is U5's, through the existing
-- Settings upload path, and §0.3 makes it a gate: T-FIX must run green
-- against the artefact first.
--
-- The hashes are the real files', taken with sha256sum and re-asserted by the
-- proof at the bottom against the design doc's §0.5 table.
insert into public.saving_sheet_templates (version, kind, storage_path, file_name, tarshid_label, sha256, active) values
  (2, 'ac', 'templates/tarshid/TARSHID-TEMPLATE-AC-SavingSheet.xlsx',
   'TARSHID-TEMPLATE-AC-SavingSheet.xlsx', 'TARSHID AC Saving Sheet (blank)',
   '2ccf89b2788a85814ec71c999670e41ac892e54fef06c4a48a2a32a0ef70915f', false),
  (3, 'lighting', 'templates/tarshid/TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx',
   'TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx', 'TARSHID Lighting + Lighting Control Saving Sheet (blank)',
   '9b681bd70897133c6e755d797517c6ac155cb9d4be2c8f2ecc3d18c45b533916', false)
on conflict (version) do nothing;

-- ===========================================================================
-- 6. THE RELEASE GATE (design §0.1(4), §0.2)
-- ===========================================================================
-- The workbook recomputes TARSHID's own formulas over the values we wrote. If
-- the engine and the workbook disagree, the sheet is wrong and must not leave
-- draft. That is a wall, not a warning.
--
-- The gate binds to the FILE HASH, not the filename or the row id, because
-- §9's self-review found the way it would otherwise degrade: verify one set of
-- bytes, regenerate, and release the different bytes that replaced them.
alter table public.saving_sheets
  add column if not exists verify_status text not null default 'unverified',
  add column if not exists verify_hash text,
  add column if not exists verified_at timestamptz,
  add column if not exists file_sha256 text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'saving_sheets_verify_status_chk') then
    alter table public.saving_sheets
      add constraint saving_sheets_verify_status_chk check (verify_status in ('unverified', 'match', 'mismatch'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saving_sheets_verify_hash_chk') then
    alter table public.saving_sheets
      add constraint saving_sheets_verify_hash_chk check (verify_hash is null or verify_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saving_sheets_file_sha256_chk') then
    alter table public.saving_sheets
      add constraint saving_sheets_file_sha256_chk check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;

comment on column public.saving_sheets.verify_status is
  'unverified | match | mismatch — the result of headlessly recalculating the exact stored bytes and comparing cell-for-cell with the engine snapshot (design §0.2 layer 2).';
comment on column public.saving_sheets.verify_hash is
  'sha256 of the bytes that were verified. The gate compares this with file_sha256, so a regeneration invalidates the verification instead of inheriting it.';

-- --- the fence --------------------------------------------------------------
-- HOW STATUS IS WRITTEN TODAY, checked before fencing it (SavingSheetTab.jsx):
--   * generate inserts a new row at the default 'draft';
--   * immediately before that insert it sets EVERY prior non-superseded row to
--     'superseded' (line 116) — including drafts;
--   * setStatus() drives draft -> approved -> shared from the buttons.
-- So a blanket "cannot leave draft" would break generation on the second
-- revision, in a loop, with no way out. The fence therefore blocks RELEASE
-- (approved, shared) and leaves RETIREMENT (superseded) alone: superseding a
-- draft publishes nothing, it withdraws it.
create or replace function public.saving_sheet_release_gate()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft'::public.saving_sheet_status
     and new.status in ('approved'::public.saving_sheet_status, 'shared'::public.saving_sheet_status) then

    if new.verify_status is distinct from 'match' then
      raise exception
        'This saving sheet cannot be approved or shared: its cross-check against TARSHID''s own formulas is "%". The workbook must be recalculated and its numbers must agree with the engine before the sheet leaves draft.',
        coalesce(new.verify_status, 'unverified')
        using errcode = 'check_violation',
              hint = 'Run the verification step; it writes verify_status, verify_hash and verified_at.';
    end if;

    if new.verify_hash is null or new.file_sha256 is null or new.verify_hash <> new.file_sha256 then
      raise exception
        'This saving sheet cannot be approved or shared: the verification was recorded for different bytes than the ones stored (verified %, stored %). Regenerating a sheet invalidates its verification.',
        coalesce(new.verify_hash, '(none)'), coalesce(new.file_sha256, '(none)')
        using errcode = 'check_violation',
              hint = 'Re-run the verification against the current file.';
    end if;
  end if;

  -- Any change to the stored bytes drops the verification on the floor.
  if new.file_sha256 is distinct from old.file_sha256 then
    new.verify_status := 'unverified';
    new.verify_hash := null;
    new.verified_at := null;
  end if;

  return new;
end $$;

comment on function public.saving_sheet_release_gate() is
  'Design §0.1(4): a sheet cannot leave draft for approved/shared unless verify_status = match AND verify_hash equals the stored file''s hash. draft -> superseded stays open — that is withdrawal, not release, and the generator depends on it.';

drop trigger if exists saving_sheets_release_gate on public.saving_sheets;
create trigger saving_sheets_release_gate before update on public.saving_sheets
  for each row execute function public.saving_sheet_release_gate();

-- ===========================================================================
-- PROOF (0128/0131 idiom) — every claim above, exercised, then cleaned up to
-- the exact counts it started from.
-- ===========================================================================
do $$
declare
  n int; s text; blocked boolean;
  c_sheets int; c_tmpl int; c_costs int; c_audit int;
  v_proj uuid; v_sheet uuid; v_ac uuid; v_light uuid;
  h_a constant text := repeat('a', 64);
  h_b constant text := repeat('b', 64);
begin
  select count(*) into c_sheets from public.saving_sheets;
  select count(*) into c_tmpl   from public.saving_sheet_templates;
  select count(*) into c_costs  from public.catalog_costs;
  select count(*) into c_audit  from public.audit_log;

  -- ---- 1. constants -------------------------------------------------------
  select count(*) into n from public.tarshid_constants
   where key in ('lighting_derating','control_derating','control_savings_fraction','btu_per_ton');
  if n <> 4 then raise exception 'FAIL: expected the 4 new constants, found %', n; end if;
  select count(*) into n from public.tarshid_constants where key = 'btu_per_ton' and value = 12000;
  if n <> 1 then raise exception 'FAIL: btu_per_ton is not 12000'; end if;
  select count(*) into n from public.tarshid_constants;
  if n <> 8 then raise exception 'FAIL: tarshid_constants should hold 8 rows (4 original + 4 new), found %', n; end if;
  select count(*) into n from public.tarshid_constants where key = 'seasonal_factor' and value = 0.9;
  if n <> 1 then raise exception 'FAIL: seasonal_factor was disturbed — its fate belongs to the fixtures (C2), not to this migration'; end if;
  raise notice 'PASS: 8 constants, the 4 new ones seeded, seasonal_factor untouched pending T-C2';

  -- ---- 2. survey columns --------------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='survey_entries'
     and column_name in ('lamps_per_fixture','lamp_load_w','has_control') and is_nullable='YES';
  if n <> 3 then raise exception 'FAIL: expected 3 nullable lighting columns on survey_entries, found %', n; end if;
  raise notice 'PASS: survey_entries gained lamps_per_fixture, lamp_load_w, has_control — all nullable';

  -- ---- 3. provenance ------------------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='operating_hours'
     and column_name in ('hours_provenance','hours_source_ref','eflh_provenance','eflh_source_ref');
  if n <> 4 then raise exception 'FAIL: expected 4 provenance columns on operating_hours, found %', n; end if;
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into s
    from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = 'input_provenance';
  if s <> 'measured,supplied,assumed' then raise exception 'FAIL: input_provenance is (%), expected measured,supplied,assumed', s; end if;
  raise notice 'PASS: operating_hours carries provenance + source_ref for hours AND for eflh, enum = %', s;

  -- ---- 4. the catalog_costs split -----------------------------------------
  select count(*) into n from pg_trigger
   where tgname in ('trg_lighting_cost_closed','trg_ac_cost_closed') and not tgisinternal;
  if n <> 0 then raise exception 'FAIL: % of 0121''s triggers survive', n; end if;
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='catalog_cost_closed';
  if n <> 0 then raise exception 'FAIL: 0121''s catalog_cost_closed() function survives'; end if;
  raise notice 'PASS: all three 0121 objects are gone (9L:99-119)';

  select count(*) into n from pg_policies where schemaname='public' and tablename='catalog_costs';
  if n <> 1 then raise exception 'FAIL: catalog_costs should have exactly 1 pmo/admin ALL policy, found %', n; end if;
  select count(*) into n from pg_policies
   where schemaname='public' and tablename='catalog_costs' and cmd = 'ALL' and qual like '%auth_role%';
  if n <> 1 then raise exception 'FAIL: the catalog_costs policy is not the pmo/admin auth_role() one'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.catalog_costs'::regclass) then
    raise exception 'FAIL: RLS is off on catalog_costs — every row in it is a cost';
  end if;
  raise notice 'PASS: catalog_costs exists, RLS on, single pmo/admin policy covering SELECT too';

  -- the null-forever trigger actually fires
  select id into v_ac from public.ac_catalog limit 1;
  if v_ac is not null then
    blocked := false;
    begin
      update public.ac_catalog set unit_cost = 1 where id = v_ac;
    exception when check_violation then blocked := true;
    end;
    if not blocked then
      update public.ac_catalog set unit_cost = null where id = v_ac;
      raise exception 'FAIL: a cost was written to ac_catalog.unit_cost — the deprecated-column trigger did not fire';
    end if;
  end if;
  select id into v_light from public.lighting_catalog limit 1;
  if v_light is not null then
    blocked := false;
    begin
      update public.lighting_catalog set labor_cost = 1 where id = v_light;
    exception when check_violation then blocked := true;
    end;
    if not blocked then
      update public.lighting_catalog set labor_cost = null where id = v_light;
      raise exception 'FAIL: a cost was written to lighting_catalog.labor_cost — the deprecated-column trigger did not fire';
    end if;
  end if;
  raise notice 'PASS: the deprecated cost columns reject a non-null write on both catalogues';

  -- one-target-only is enforced
  if v_ac is not null and v_light is not null then
    blocked := false;
    begin
      insert into public.catalog_costs (ac_item_id, lighting_item_id, unit_cost) values (v_ac, v_light, 5);
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'FAIL: catalog_costs accepted a row pointing at both catalogues'; end if;
  end if;
  blocked := false;
  begin
    insert into public.catalog_costs (unit_cost) values (5);
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: catalog_costs accepted a row pointing at neither catalogue'; end if;
  raise notice 'PASS: catalog_costs demands exactly one catalogue target';

  -- ---- 5. template versioning ---------------------------------------------
  select count(*) into n from public.saving_sheet_templates where kind = 'ac' and active;
  if n <> 1 then raise exception 'FAIL: expected exactly 1 active ac template, found %', n; end if;
  select count(*) into n from public.saving_sheet_templates where kind = 'lighting' and active;
  if n <> 0 then raise exception 'FAIL: a lighting template is already active — nothing has been uploaded yet'; end if;

  select sha256 into s from public.saving_sheet_templates where version = 2;
  if s <> '2ccf89b2788a85814ec71c999670e41ac892e54fef06c4a48a2a32a0ef70915f' then
    raise exception 'FAIL: the AC artefact hash is % — design §0.5 says it starts 2ccf89b2788a8581', s;
  end if;
  if left(s, 16) <> '2ccf89b2788a8581' then raise exception 'FAIL: AC hash prefix does not match §0.5'; end if;
  select sha256 into s from public.saving_sheet_templates where version = 3;
  if s <> '9b681bd70897133c6e755d797517c6ac155cb9d4be2c8f2ecc3d18c45b533916' then
    raise exception 'FAIL: the Lighting artefact hash is %', s;
  end if;
  -- §0.5's table printed the lighting prefix as ...971336; the file says
  -- ...97133c. The file wins; the doc is corrected in this sprint's commit A.
  if left(s, 16) <> '9b681bd70897133c' then raise exception 'FAIL: Lighting hash prefix does not match the artefact'; end if;

  select count(*) into n from public.saving_sheet_templates where version in (2,3) and not active;
  if n <> 2 then raise exception 'FAIL: both repo artefacts should be registered INACTIVE, found % inactive', n; end if;
  raise notice 'PASS: both artefacts registered inactive and hash-pinned; one active template per kind (ac=1, lighting=0)';

  -- the partial unique index is real
  blocked := false;
  begin
    update public.saving_sheet_templates set active = true where version = 2;
  exception when unique_violation then blocked := true;
  end;
  if not blocked then
    update public.saving_sheet_templates set active = false where version = 2;
    raise exception 'FAIL: two ac templates were allowed to be active at once';
  end if;
  raise notice 'PASS: activating a second ac template is refused by the partial unique index';

  -- ---- 6. the release gate ------------------------------------------------
  select id into v_proj from public.projects limit 1;
  if v_proj is null then
    raise notice 'SKIP: no project exists, so the release gate could not be exercised against a real row';
  else
    insert into public.saving_sheets (project_id, revision, template_version, storage_path, file_sha256)
      values (v_proj, 999999, 1, 'proof/u2-gate.xlsx', h_a)
      returning id into v_sheet;

    select verify_status into s from public.saving_sheets where id = v_sheet;
    if s <> 'unverified' then raise exception 'FAIL: a new sheet is "%" not "unverified"', s; end if;

    -- unverified -> approved must be refused
    blocked := false;
    begin
      update public.saving_sheets set status = 'approved' where id = v_sheet;
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'FAIL: an unverified draft was approved'; end if;

    -- mismatch -> shared must be refused
    update public.saving_sheets set verify_status = 'mismatch', verify_hash = h_a, verified_at = now() where id = v_sheet;
    blocked := false;
    begin
      update public.saving_sheets set status = 'shared' where id = v_sheet;
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'FAIL: a MISMATCHED sheet was shared — the gate is a warning, not a wall'; end if;

    -- match, but recorded for different bytes, must be refused
    update public.saving_sheets set verify_status = 'match', verify_hash = h_b where id = v_sheet;
    blocked := false;
    begin
      update public.saving_sheets set status = 'approved' where id = v_sheet;
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'FAIL: a verification recorded for OTHER bytes let the sheet out of draft'; end if;

    -- match on the right bytes: released
    update public.saving_sheets set verify_status = 'match', verify_hash = h_a where id = v_sheet;
    update public.saving_sheets set status = 'approved' where id = v_sheet;
    select status::text into s from public.saving_sheets where id = v_sheet;
    if s <> 'approved' then raise exception 'FAIL: a properly verified sheet was still refused (status %)', s; end if;
    raise notice 'PASS: the gate closes on unverified, on mismatch, and on a hash recorded for other bytes — and opens on a real match';

    -- the generator's own path must still work: draft -> superseded, always
    update public.saving_sheets set status = 'draft', verify_status = 'unverified', verify_hash = null where id = v_sheet;
    update public.saving_sheets set status = 'superseded' where id = v_sheet;
    select status::text into s from public.saving_sheets where id = v_sheet;
    if s <> 'superseded' then raise exception 'FAIL: an unverified draft could not be superseded — this breaks generation on every revision after the first'; end if;
    raise notice 'PASS: draft -> superseded is untouched, so the shipped generate flow still works';

    -- regenerating (new bytes) drops the verification
    update public.saving_sheets set status = 'draft', verify_status = 'match', verify_hash = h_a, verified_at = now() where id = v_sheet;
    update public.saving_sheets set file_sha256 = h_b where id = v_sheet;
    select verify_status into s from public.saving_sheets where id = v_sheet;
    if s <> 'unverified' then raise exception 'FAIL: replacing the file left verify_status at "%" — a stale verification would travel with new bytes', s; end if;
    raise notice 'PASS: changing the stored bytes resets the verification to unverified';

    delete from public.saving_sheets where id = v_sheet;
    delete from public.audit_log where entity_type = 'saving_sheets' and record_id = v_sheet;
  end if;

  -- ---- cleanup to the exact starting counts -------------------------------
  select count(*) into n from public.saving_sheets;
  if n <> c_sheets then raise exception 'FAIL: saving_sheets % -> %', c_sheets, n; end if;
  select count(*) into n from public.catalog_costs;
  if n <> c_costs then raise exception 'FAIL: catalog_costs % -> %', c_costs, n; end if;
  -- c_tmpl was snapshotted after this migration's two artefact inserts, so the
  -- proof must leave it exactly where it found it, and the absolute count must
  -- be 3: the one live AC template plus the two registered repo artefacts.
  select count(*) into n from public.saving_sheet_templates;
  if n <> c_tmpl then raise exception 'FAIL: saving_sheet_templates % -> %', c_tmpl, n; end if;
  if n <> 3 then raise exception 'FAIL: expected 3 templates (1 live ac + 2 registered artefacts), found %', n; end if;
  select count(*) into n from public.audit_log;
  if n <> c_audit then raise exception 'FAIL: audit_log % -> % — the proof left rows behind', c_audit, n; end if;
  raise notice 'PASS: every table the proof touched is back to its starting count (templates +2 by design)';
end $$;
