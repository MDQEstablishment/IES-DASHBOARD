-- Sprint 9A: TARSHID-approved equipment catalogs as first-class, cross-project
-- reference data. Sourced from the MOH-H DIP TDS workbook (Light / AC / PACU /
-- Misc sheets). These are GLOBAL catalogs managed in Settings by admin/pmo and
-- consumed later by the Saving Sheet (9C), which will reference rows by id.
--
-- Decision: AC_List + PACU_List are UNIFIED into one ac_catalog. They differ
-- only by efficiency metric (SEER vs IEER) and a PACU-only voltage_class; a
-- single table gives 9C one stable FK seam and one shared UI. PACU rows carry
-- size_category='Package Unit' with ieer/voltage_class set and seer NULL.
-- Costs are deliberately absent (they live in the saving-sheet workbooks, a 9C
-- decision), as are project quantities (those are per-project BOQ data).

create table if not exists public.lighting_catalog (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  lamp_type text not null,
  model text,
  brand text,
  shape_size_base text,
  dimensions text,                       -- Length/Width/Diameter, free text (mixed formats)
  wattage_w numeric,
  lumens_lm numeric,
  cct_k text,                            -- text: tunable fixtures list multiple CCTs
  life_hours integer,
  operating_v text,                      -- ranges like "220-240"
  mandatory boolean not null default false,
  local boolean not null default false,
  is_active boolean not null default true,
  source text not null default 'MOH-H DIP TDS V09Jun2026',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ac_catalog (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  description text not null,              -- TDS "Description/File Name" = saving-sheet naming convention, verbatim
  equipment_type text,
  model text,                            -- ID/OD
  make text,
  size_category text not null,           -- the 7 TDS block labels, or 'Package Unit' for PACU
  capacity_btu integer,                  -- T1 BTU
  capacity_tr numeric,                   -- in TR
  seer numeric,
  ieer numeric,                          -- PACU efficiency metric
  voltage_class text,                    -- PACU only
  ch_mode text check (ch_mode in ('cooling_only', 'cooling_heating')),
  mandatory boolean not null default false,
  local boolean not null default false,
  is_active boolean not null default true,
  source text not null default 'MOH-H DIP TDS V09Jun2026',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ac_catalog_efficiency_ck check (seer is not null or ieer is not null)
);

create table if not exists public.misc_catalog (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  item text not null,
  unit text not null,
  default_qty_rule text,                 -- e.g. "2% from each type"; actual qty is per-project BOQ data
  notes text,
  is_active boolean not null default true,
  source text not null default 'MOH-H DIP TDS V09Jun2026',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes: sub-1k-row tables, so the pk carries the 9C FK lookups. Partial
-- is_active plus the one facet the AC tab filters on server-agnostically.
create index if not exists idx_lighting_active on public.lighting_catalog(is_active);
create index if not exists idx_ac_active on public.ac_catalog(is_active);
create index if not exists idx_ac_size_category on public.ac_catalog(size_category);
create index if not exists idx_misc_active on public.misc_catalog(is_active);

-- RLS: everyone authenticated reads; only admin/pmo write. Audit + realtime for
-- all three, via the shared loop.
do $$ declare t text; begin
  foreach t in array array['lighting_catalog', 'ac_catalog', 'misc_catalog'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (public.auth_role() = any (array['admin','pmo']::public.user_role[]))
      with check (public.auth_role() = any (array['admin','pmo']::public.user_role[]))$f$, t||'_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists audit_%I on public.%I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_trigger_fn()', t, t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                   and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
