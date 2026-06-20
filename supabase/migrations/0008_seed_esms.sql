-- supabase/migrations/0008_seed_esms.sql
-- IES Programme Control Platform v2 — Phase 2, migration 8 of 15 (0008–0022)
-- Seeds the 3 catalogue ESMs — the one seed deliberately deferred from Phase 1.
-- Names/units mirror the approved design's esmCatalog exactly.
-- Idempotent: ON CONFLICT (code) DO NOTHING — safe to re-run, and preserves
--   any later global rename of esms.name (editable per v1.1 change #3).

insert into public.esms (code, name, unit) values
  ('ESM1', 'Lighting Replacement', 'fixtures'),
  ('ESM2', 'Lighting Control',     'sensors'),
  ('ESM3', 'AC Units Replacement', 'units')
on conflict (code) do nothing;
