-- 0138 — the three UI thresholds that were business policy held in JSX.
--
-- A4/A3 audit, commit A. Three numbers were deciding what the owner reads on
-- screen while living in component source:
--
--   Dashboard.jsx:149   stock < threshold * 1.5  -> 'LOW'      (unsourced)
--   Reports.jsx:44      ontime >= 90 -> green, >= 70 -> amber  (HR-adjacent)
--
-- They belong in tarshid_constants with every other decoded parameter, so the
-- owner can change a band without a deploy and can see what the band IS.
-- Additive: three new rows, nothing existing is touched.
--
-- The readers deliberately have NO in-code default. A missing row means the
-- band is unknown, and the UI renders the neutral case (no LOW classification,
-- no colour) rather than inventing a threshold — the same rule as every other
-- value in this sprint.

insert into public.tarshid_constants (key, value, description) values
  ('low_stock_multiplier', 1.5,
   'Critical Materials: stock below threshold x this multiplier (but at or above threshold) is LOW. Below threshold is CRITICAL.'),
  ('perf_ontime_good_pct', 90,
   'Employee Performance: on-time % at or above this reads green.'),
  ('perf_ontime_warn_pct', 70,
   'Employee Performance: on-time % at or above this (and below the good band) reads amber; below it reads red.')
on conflict (key) do nothing;

-- ── proof ──────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from public.tarshid_constants
   where key in ('low_stock_multiplier','perf_ontime_good_pct','perf_ontime_warn_pct');
  if n <> 3 then raise exception 'FAIL: expected the 3 new UI-threshold constants, found %', n; end if;

  select count(*) into n from public.tarshid_constants where key = 'low_stock_multiplier' and value = 1.5;
  if n <> 1 then raise exception 'FAIL: low_stock_multiplier is not 1.5'; end if;
  select count(*) into n from public.tarshid_constants where key = 'perf_ontime_good_pct' and value = 90;
  if n <> 1 then raise exception 'FAIL: perf_ontime_good_pct is not 90'; end if;
  select count(*) into n from public.tarshid_constants where key = 'perf_ontime_warn_pct' and value = 70;
  if n <> 1 then raise exception 'FAIL: perf_ontime_warn_pct is not 70'; end if;

  -- the eight rows 0093 + 0135 seeded must be exactly as they were
  select count(*) into n from public.tarshid_constants;
  if n <> 11 then raise exception 'FAIL: tarshid_constants should hold 11 rows (8 prior + 3 new), found %', n; end if;
  select count(*) into n from public.tarshid_constants
   where (key = 'tariff_sar_kwh' and value = 0.32)
      or (key = 'seasonal_factor' and value = 0.9)
      or (key = 'capacity_tolerance_pct' and value = 10)
      or (key = 'min_savings_pct' and value = 15)
      or (key = 'lighting_derating' and value = 0.9)
      or (key = 'control_derating' and value = 0.9)
      or (key = 'control_savings_fraction' and value = 0.3)
      or (key = 'btu_per_ton' and value = 12000);
  if n <> 8 then raise exception 'FAIL: one of the 8 prior constants was disturbed — % of 8 still match', n; end if;

  raise notice 'PASS 0138: 3 UI-threshold constants seeded, 11 rows total, the prior 8 untouched';
end $$;
