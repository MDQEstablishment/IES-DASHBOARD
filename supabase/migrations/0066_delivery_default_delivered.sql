-- supabase/migrations/0066_delivery_default_delivered.sql
-- Sprint 8F — delivery simplification. New deliveries land directly as 'delivered'
-- against the project warehouse pool (building_id NULL); per-building consumption
-- continues to flow through install_log / Daily Progress, not at delivery time.
-- Additive: only changes the default + documents building_id. Existing rows are
-- left exactly as-is (building_id and status untouched). The 0065 ledger trigger
-- already counts 'delivered' and stock_ledger.building_id is nullable, so a NULL
-- building_id delivery writes a valid delivery_in row (verified in the sprint).

alter table public.material_deliveries alter column status set default 'delivered';
comment on column public.material_deliveries.building_id is
  'historical only — new deliveries go to the project warehouse pool; per-building draw happens via install_log';
