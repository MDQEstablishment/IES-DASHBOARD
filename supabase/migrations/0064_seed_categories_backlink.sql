-- supabase/migrations/0064_seed_categories_backlink.sql
-- Sprint 8E (2/3) — seed the default category set per ESM, then back-link every
-- existing material (variant) to a category and stamp brand 'Generic v4'. Additive
-- and idempotent (on conflict do nothing; updates only fill nulls).

insert into public.material_categories (esm_id, code, name_en, default_unit) values
  ((select id from public.esms where code='ESM1'), 'LIGHT-LED-40W-CEIL',     'LED 40W Ceiling Panel', 'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-LED-20W-DOWN',     'LED 20W Downlight',     'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-LED-150W-HIGHBAY', 'LED 150W Highbay',      'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-LED-60W-FLOOD',    'LED 60W Floodlight',    'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-LED-80W-STREET',   'LED 80W Streetlight',   'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-ACC-WIRE-1.5MM',   'Wiring 1.5mm',          'm'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-ACC-JBOX',         'Junction Box',          'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-ACC-SWITCH',       'Switch',                'pcs'),
  ((select id from public.esms where code='ESM1'), 'LIGHT-OTHER',            'Other Lighting',        'pcs'),
  ((select id from public.esms where code='ESM2'), 'CTRL-OCC-CEIL',          'Occupancy Sensor (Ceiling)', 'pcs'),
  ((select id from public.esms where code='ESM2'), 'CTRL-DAYLIGHT',          'Daylight Sensor',       'pcs'),
  ((select id from public.esms where code='ESM2'), 'CTRL-TIMER-ASTRO',       'Astro Timer Controller','pcs'),
  ((select id from public.esms where code='ESM2'), 'CTRL-PANEL',             'Control Panel',         'pcs'),
  ((select id from public.esms where code='ESM2'), 'CTRL-ACC-SIGWIRE',       'Signal Wire',           'm'),
  ((select id from public.esms where code='ESM2'), 'CTRL-OTHER',             'Other Controls',        'pcs'),
  ((select id from public.esms where code='ESM3'), 'AC-SPLIT-1.5T-INV',      'Split AC 1.5T Inverter','units'),
  ((select id from public.esms where code='ESM3'), 'AC-SPLIT-2.0T-INV',      'Split AC 2.0T Inverter','units'),
  ((select id from public.esms where code='ESM3'), 'AC-SPLIT-2.5T-INV',      'Split AC 2.5T Inverter','units'),
  ((select id from public.esms where code='ESM3'), 'AC-CASSETTE-4.0T',       'Cassette AC 4.0T',      'units'),
  ((select id from public.esms where code='ESM3'), 'AC-PACKAGE-5.0T',        'Package AC 5.0T',       'units'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-COPPER-1/2',      'Copper Pipe 1/2"',      'm'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-COPPER-3/8',      'Copper Pipe 3/8"',      'm'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-INSUL',           'Pipe Insulation',       'm'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-DRAIN',           'Drain Pipe',            'm'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-PWRCABLE',        'Power Cable',           'm'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-MOUNT',           'Mounting Bracket',      'pcs'),
  ((select id from public.esms where code='ESM3'), 'AC-ACC-REFRIGERANT-R32', 'Refrigerant R32',       'kg'),
  ((select id from public.esms where code='ESM3'), 'AC-OTHER',               'Other HVAC',            'units')
on conflict (code) do nothing;

-- brand stamp for legacy variants
update public.materials set brand = 'Generic v4' where brand is null;

-- explicit back-links for the known legacy codes
update public.materials m set category_id = c.id
from public.material_categories c
where m.category_id is null and c.code = case m.code
  when 'LED-40W'  then 'LIGHT-LED-40W-CEIL'
  when 'LED-20W'  then 'LIGHT-LED-20W-DOWN'
  when 'LED-150W' then 'LIGHT-LED-150W-HIGHBAY'
  when 'LED-FL60' then 'LIGHT-LED-60W-FLOOD'
  when 'LED-ST80' then 'LIGHT-LED-80W-STREET'
  when 'CTRL-OCC' then 'CTRL-OCC-CEIL'
  when 'CTRL-DAY' then 'CTRL-DAYLIGHT'
  when 'CTRL-TIM' then 'CTRL-TIMER-ASTRO'
  when 'AC-S15'   then 'AC-SPLIT-1.5T-INV'
  when 'AC-S20'   then 'AC-SPLIT-2.0T-INV'
  when 'AC-S25'   then 'AC-SPLIT-2.5T-INV'
  when 'AC-C40'   then 'AC-CASSETTE-4.0T'
  when 'AC-PKG5'  then 'AC-PACKAGE-5.0T'
  else null end;

-- pattern-based mapping for the rest (downlights, highbay, flood, street, split…)
update public.materials m set category_id = c.id
from public.material_categories c
where m.category_id is null and c.code = case
  when m.code ilike 'LED-DL%' or m.code ilike '%DOWN%' then 'LIGHT-LED-20W-DOWN'
  when m.code ilike '%HIGHBAY%' or m.code ilike 'LED-150%' then 'LIGHT-LED-150W-HIGHBAY'
  when m.code ilike '%FLOOD%' or m.code ilike 'LED-FL%' then 'LIGHT-LED-60W-FLOOD'
  when m.code ilike '%STREET%' or m.code ilike 'LED-ST%' then 'LIGHT-LED-80W-STREET'
  when m.code ilike 'LED-T8%' or m.code ilike 'LED-T5%' then 'LIGHT-LED-40W-CEIL'
  when m.code ilike 'OCC%' or m.code ilike 'CTRL-OCC%' then 'CTRL-OCC-CEIL'
  when m.code ilike 'AC-CST%' or m.code ilike 'AC-C%' then 'AC-CASSETTE-4.0T'
  when m.code ilike 'AC-PKG%' or m.code ilike 'AC-PACKAGE%' then 'AC-PACKAGE-5.0T'
  when m.code ilike 'AC-SPL-12%' or m.code ilike 'AC-S12%' then 'AC-SPLIT-1.5T-INV'
  when m.code ilike 'AC-SPL-18%' or m.code ilike 'AC-S18%' then 'AC-SPLIT-2.0T-INV'
  when m.code ilike 'AC-SPL-24%' or m.code ilike 'AC-S24%' or m.code ilike 'AC-SPL-30%' then 'AC-SPLIT-2.5T-INV'
  else null end;

-- final fallback: any still-null variant goes to its ESM's "Other" bucket
update public.materials m set category_id = c.id
from public.material_categories c, public.esms e
where m.category_id is null and m.esm_id = e.id
  and c.code = case e.code when 'ESM1' then 'LIGHT-OTHER' when 'ESM2' then 'CTRL-OTHER' when 'ESM3' then 'AC-OTHER' end;
