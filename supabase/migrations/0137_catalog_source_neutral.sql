-- supabase/migrations/0137_catalog_source_neutral.sql
-- ===========================================================================
-- CONFIDENTIALITY CLEANUP (Constraints #7) — the catalogue `source` string
-- ===========================================================================
-- 0090 created lighting_catalog, ac_catalog and misc_catalog with
--   source text not null default '<client DIP/TDS document name>'
-- and every row inserted since carries that string in its `source` column. So
-- this is not a comment to fix in a file: it is LIVE DATA plus three column
-- DEFAULTs, and a file edit alone would leave every deployed database holding
-- the client-identifying string while the repository looked clean. That is the
-- shape of mistake Constraints #7 exists to prevent, so it is fixed in the
-- database too.
--
-- The provenance that actually matters is preserved: these rows come from a
-- TARSHID-approved equipment catalogue. What is dropped is the client's own
-- document identity, which the catalogue's authority never depended on.
--
-- Additive and idempotent: no column is dropped, no row is deleted, and
-- re-running changes nothing after the first pass.

-- 1) The DEFAULTs, so nothing new is written with the old string -------------
alter table public.lighting_catalog alter column source set default 'TARSHID approved catalogue';
alter table public.ac_catalog       alter column source set default 'TARSHID approved catalogue';
alter table public.misc_catalog     alter column source set default 'TARSHID approved catalogue';

-- 2) The existing rows -------------------------------------------------------
update public.lighting_catalog set source = 'TARSHID approved catalogue' where source like '%DIP TDS%';
update public.ac_catalog        set source = 'TARSHID approved catalogue' where source like '%DIP TDS%';
update public.misc_catalog      set source = 'TARSHID approved catalogue' where source like '%DIP TDS%';

-- 3) PROOF — zero rows and zero defaults may retain the old string -----------
-- This block RAISES rather than reports, because "the update ran" and "no
-- client string remains" are different claims and only the second one is the
-- point of this migration.
do $$
declare
  bad_rows     bigint;
  bad_defaults int;
begin
  select
    (select count(*) from public.lighting_catalog where source like '%DIP TDS%')
  + (select count(*) from public.ac_catalog       where source like '%DIP TDS%')
  + (select count(*) from public.misc_catalog     where source like '%DIP TDS%')
  into bad_rows;

  select count(*) into bad_defaults
  from pg_attrdef ad
  join pg_class c on c.oid = ad.adrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = ad.adnum
  where n.nspname = 'public'
    and c.relname in ('lighting_catalog', 'ac_catalog', 'misc_catalog')
    and a.attname = 'source'
    and pg_get_expr(ad.adbin, ad.adrelid) like '%DIP TDS%';

  if bad_rows <> 0 then
    raise exception '0137 FAILED: % catalogue row(s) still carry the client source string', bad_rows;
  end if;
  if bad_defaults <> 0 then
    raise exception '0137 FAILED: % catalogue column default(s) still carry the client source string', bad_defaults;
  end if;

  raise notice '0137 OK — 0 rows and 0 column defaults retain the client source string across lighting_catalog, ac_catalog, misc_catalog.';
end $$;
