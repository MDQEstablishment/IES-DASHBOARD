-- Saving Sheet sprint, U1 (commit A of two) — the LIGHTING baseline registry.
--
-- Why this table exists at all: docs/Saving-Sheet-Murshid-Design.md §0.5
-- corrected an earlier claim. The design used to say "lighting has no registry
-- by design"; the artefact says otherwise. TARSHID's Lighting template carries
-- its own `Old_Model_Registry` sheet — 344 populated rows of BASELINE FITTINGS
-- (Conv-FTL-T8-1.5M-1X-56W and friends) — and the workbook's formulas look up
-- that embedded copy. Per §0.4 the embedded copy is AUTHORITATIVE and this
-- table is a MIRROR imported from it; nothing here is authored by us.
--
-- The AC registry's shape does not fit: old_model_registry (0093) is built
-- around tr / t1_btu / t3_btu / equivalent_seer, none of which a lamp has. So
-- this is a second, lighting-shaped table rather than columns bolted onto the
-- first.
--
-- SCOPE OF THIS MIGRATION: the table only. The rows arrive in 0134, generated
-- by scripts/import-tarshid-registries.mjs straight from the artefact. The
-- rest of the U2 schema (constants, survey columns, provenance, catalog_costs,
-- template versioning, the verify gate) is deliberately NOT here — the owner
-- fixed the build order as "registry import first, pure data, no design risk".
--
-- COLUMN NOTES, all from direct inspection of the artefact:
--
--  * surveyed_unit_description is the natural key and it is FORMULA-BUILT in
--    the sheet on 343 of the 344 rows — the description concatenates the
--    attribute columns. Per §0.4 the import reads the CACHED value, which is
--    what TARSHID's own lookups resolve against.
--
--  * lamps_per_fixture is numeric and comes from the sheet's numeric
--    "Lamp/Fix" column (K). The sheet ALSO carries a text "Lamp/Fixture"
--    column (H) holding the same fact as an "NX" token ("1X", "2X", ...) —
--    that token is not stored separately because it survives verbatim inside
--    surveyed_unit_description, warts included. Verified: H and K agree on all
--    344 rows.
--
--  * The wart, recorded so nobody "fixes" it: sheet row 315
--    (Sr. No. 314) reads `Conv-Candle-E14-1x-10W` — lower-case `1x` against
--    the file's own `NX` convention. It imports AS IS. TARSHID's data is
--    TARSHID's data; normalising it here would silently break the lookup
--    against TARSHID's own formulas.
--
--  * length_width_diameter is null on most rows (only tube-style fittings
--    carry "1.5M-" / "1.2M-"), and three rows carry a leading space in
--    shape_size_base (" E27"). Both are the artefact's, both stay.
--
-- RLS mirrors old_model_registry (0093) exactly: read = every authenticated
-- user; insert/update = pmo/admin; `retired` is the only removal.
--
-- ONE CORRECTION TO 0093'S OWN COMMENT, found while mirroring it. 0093:129
-- says "no delete grant anywhere". Queried against this database, that is not
-- what the grants say: Supabase's default privileges hand anon, authenticated,
-- postgres and service_role the full set — DELETE and TRUNCATE included — on
-- every new table in `public`, and the `grant select, insert, update` line
-- adds to that set rather than narrowing it. What actually stops a delete on
-- old_model_registry is RLS: there is no DELETE policy, so with row security
-- on, every delete matches zero rows. The protection is real; the stated
-- mechanism was wrong. This table is built the same way and the proof at the
-- bottom asserts the mechanism that is actually load-bearing — no DELETE (and
-- no FOR ALL) policy — instead of a grant that was never absent.

create table if not exists public.lighting_baseline_registry (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  surveyed_unit_description text not null unique,
  lamp_type text,
  conv_led text,                                -- "Conv" | "LED" (TARSHID's spelling)
  location_type text,                           -- Interior | Exterior
  shape_size_base text,                         -- T8 / E27 / Downlight / 12" ...
  length_width_diameter text,                   -- "1.5M-" style, mostly null
  lamps_per_fixture numeric,
  wattage_w numeric,
  lumens_lm numeric,
  retired boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create index if not exists idx_lightreg_lamp_type on public.lighting_baseline_registry(lamp_type);
create index if not exists idx_lightreg_conv_led on public.lighting_baseline_registry(conv_led);

comment on table public.lighting_baseline_registry is
  'Mirror of the Old_Model_Registry sheet embedded in TARSHID''s Lighting Saving Sheet template (344 populated rows). TARSHID''s embedded copy is authoritative (design §0.4); this table is imported from it and never authored here.';
comment on column public.lighting_baseline_registry.surveyed_unit_description is
  'Natural key. Formula-built in the artefact on 343/344 rows; the cached value is imported verbatim, including the lower-case "1x" on sheet row 315.';
comment on column public.lighting_baseline_registry.lamps_per_fixture is
  'From the sheet''s numeric "Lamp/Fix" column; the text "NX" form lives inside surveyed_unit_description.';

-- shared touch trigger fn from 0093 (sets updated_at, and updated_by when the
-- row has that column — this one does)
drop trigger if exists lighting_baseline_registry_touch on public.lighting_baseline_registry;
create trigger lighting_baseline_registry_touch before update on public.lighting_baseline_registry
  for each row execute function public.tarshid_ref_touch();

-- ---------------------------------------------------------------------------
-- RLS — mirrored from old_model_registry (0093:131-141), policy for policy.
-- ---------------------------------------------------------------------------
alter table public.lighting_baseline_registry enable row level security;
drop policy if exists lightreg_read on public.lighting_baseline_registry;
create policy lightreg_read on public.lighting_baseline_registry for select to authenticated using (true);
drop policy if exists lightreg_ins on public.lighting_baseline_registry;
create policy lightreg_ins on public.lighting_baseline_registry for insert to authenticated
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
drop policy if exists lightreg_upd on public.lighting_baseline_registry;
create policy lightreg_upd on public.lighting_baseline_registry for update to authenticated
  using (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role))
  with check (public.auth_role() in ('pmo'::public.user_role, 'admin'::public.user_role));
grant select, insert, update on public.lighting_baseline_registry to authenticated;

-- audit + realtime, consistent with 0093
drop trigger if exists audit_lighting_baseline_registry on public.lighting_baseline_registry;
create trigger audit_lighting_baseline_registry after insert or update or delete on public.lighting_baseline_registry
  for each row execute function public.audit_trigger_fn();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'lighting_baseline_registry') then
    alter publication supabase_realtime add table public.lighting_baseline_registry;
  end if;
end $$;
alter table public.lighting_baseline_registry replica identity full;

-- ---------------------------------------------------------------------------
-- Proof (0128/0131 idiom): the table exists with the expected shape, RLS is on,
-- the policy set matches the AC registry's command for command, and nothing
-- can delete a row.
-- ---------------------------------------------------------------------------
do $$
declare n int; missing text;
begin
  select string_agg(c, ', ') into missing from unnest(array[
    'id','sr_no','surveyed_unit_description','lamp_type','conv_led','location_type',
    'shape_size_base','length_width_diameter','lamps_per_fixture','wattage_w','lumens_lm',
    'retired','created_by','created_at','updated_at','updated_by']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='lighting_baseline_registry'
                        and column_name = c);
  if missing is not null then raise exception 'FAIL: lighting_baseline_registry missing column(s): %', missing; end if;

  if not (select relrowsecurity from pg_class where oid = 'public.lighting_baseline_registry'::regclass) then
    raise exception 'FAIL: RLS is not enabled on lighting_baseline_registry';
  end if;

  -- the policy set must be the same shape as the AC registry's, command for
  -- command — that comparison is the mirror, stated as a query rather than as
  -- a claim.
  if (select string_agg(cmd, ',' order by cmd) from pg_policies
       where schemaname='public' and tablename='lighting_baseline_registry')
     is distinct from
     (select string_agg(cmd, ',' order by cmd) from pg_policies
       where schemaname='public' and tablename='old_model_registry') then
    raise exception 'FAIL: policy commands do not mirror old_model_registry (% vs %)',
      (select string_agg(cmd, ',' order by cmd) from pg_policies
        where schemaname='public' and tablename='lighting_baseline_registry'),
      (select string_agg(cmd, ',' order by cmd) from pg_policies
        where schemaname='public' and tablename='old_model_registry');
  end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='lighting_baseline_registry';
  if n <> 3 then raise exception 'FAIL: expected 3 policies (read/ins/upd), found %', n; end if;

  -- what actually forbids deletion (see the header note): no DELETE policy and
  -- no catch-all FOR ALL policy, with row security on.
  select count(*) into n from pg_policies
   where schemaname='public' and tablename='lighting_baseline_registry' and cmd in ('DELETE','ALL');
  if n <> 0 then raise exception 'FAIL: % policy grants delete — retire is the only removal', n; end if;

  select count(*) into n from public.lighting_baseline_registry;
  if n <> 0 then raise exception 'FAIL: expected an empty table, found % row(s) — 0134 loads the data', n; end if;

  raise notice 'PASS: lighting_baseline_registry created empty, 16 columns, RLS on, 3 policies mirroring old_model_registry command for command, no policy permits delete';
end $$;
