-- supabase/migrations/0062_widen_delivery_status_check.sql
-- Sprint 8D hotfix — 0061 introduced the 'pending_approval' status value (used by
-- the PDF-extraction flow) but did not update the material_deliveries_status_check
-- CHECK constraint, so saving a pending_approval row failed with
-- "violates check constraint material_deliveries_status_check".
--
-- Existing whitelist was: pending, in_transit, delivered, rejected.
-- Widen it to the union with 'pending_approval' (rejected was already present).
-- Additive only — no value removed, no data backfill.

alter table public.material_deliveries drop constraint if exists material_deliveries_status_check;
alter table public.material_deliveries add constraint material_deliveries_status_check
  check (status = any (array['pending','in_transit','delivered','rejected','pending_approval']::text[]));
