-- supabase/migrations/0067_collapse_categories.sql
-- Sprint 8H — catalog simplification. Collapse the 28 seeded categories (0064)
-- down to SIX: a Main + Accessories pair per ESM, so consumption reports
-- aggregate cleanly by material name (e.g. "meters of copper", "count of wires")
-- with brand kept as a per-variant drilldown. Re-link every material to the 6,
-- then deactivate the old 28 (is_active=false) so the catalog admin stops listing
-- them while their FKs stay valid. Additive only — no row deletions.

-- 1) is_active flag. Default true keeps the existing rows + the 6 new ones visible.
alter table public.material_categories add column if not exists is_active boolean not null default true;

-- 2) the SIX new categories (stable codes), scoped per ESM. Idempotent.
insert into public.material_categories (esm_id, code, name_en, default_unit) values
  ((select id from public.esms where code='ESM1'), 'LIGHT',     'Lighting',             'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-ACC', 'Lighting Accessories', 'pcs'),
  ((select id from public.esms where code='ESM2'), 'SENS',      'Sensors',              'pcs'),
  ((select id from public.esms where code='ESM2'), 'SENS-ACC',  'Sensors Accessories',  'pcs'),
  ((select id from public.esms where code='ESM3'), 'AC',        'AC',                   'units'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC',    'AC Accessories',       'm')
on conflict (code) do nothing;

-- 3) re-link every material to one of the 6, keyed off its current category code.
-- The -ACC seeded buckets map to the matching Accessories category; everything
-- else (mains + the per-ESM "Other" buckets) maps to the ESM's Main category.
-- The oc.code <> nc.code guard makes this safe to re-run.
update public.materials m set category_id = nc.id
from public.material_categories oc, public.material_categories nc
where m.category_id = oc.id
  and nc.code = case
    when oc.code like 'LIGHT-ACC%' then 'LIGHT-ACC'
    when oc.code like 'LIGHT%'     then 'LIGHT'
    when oc.code like 'CTRL-ACC%'  then 'SENS-ACC'
    when oc.code like 'CTRL%'      then 'SENS'
    when oc.code like 'SENS-ACC%'  then 'SENS-ACC'
    when oc.code like 'SENS%'      then 'SENS'
    when oc.code like 'AC-ACC%'    then 'AC-ACC'
    when oc.code like 'AC%'        then 'AC'
    else oc.code
  end
  and oc.code <> nc.code;

-- 4) deactivate the old 28 (now unreferenced). Keep the 6 active.
update public.material_categories
set is_active = false, updated_at = now()
where code not in ('LIGHT','LIGHT-ACC','SENS','SENS-ACC','AC','AC-ACC');

-- 5) verify: every material lands on one of the 6. Abort the migration otherwise.
do $$
declare n int;
begin
  select count(*) into n from public.materials m
  where m.category_id is null
     or m.category_id not in (
       select id from public.material_categories
       where code in ('LIGHT','LIGHT-ACC','SENS','SENS-ACC','AC','AC-ACC'));
  if n <> 0 then
    raise exception 'category collapse left % material(s) off the 6-category set', n;
  end if;
end $$;
