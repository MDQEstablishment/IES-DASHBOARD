-- supabase/migrations/0033_phase5_additions.sql
-- IES Programme Control Platform v2 — Phase 5 (Sprint 2 feedback)
-- Adds: project engineer assignment, building manual status-override metadata,
-- 'archived' (+ 'on_hold'/'blocked') building statuses, and an engineer backfill.
--
-- Localization audit trail (complaint 1.1 / 1.9):
--   A full scan of EVERY text/varchar column in schema `public` for Arabic
--   codepoints [؀-ۿ] returned ZERO matches on 2026-06-22. No seed value needed
--   replacement — all rendered data is already English/ASCII. The remaining
--   Sprint-2 localization work is UI-side (verified separately in Phase 5 B.1).

-- 1) Project engineer assignment (complaint 1.7) -----------------------------
alter table public.projects
  add column if not exists engineer_id uuid references public.profiles(id);

-- 2) Building status enum: add manual-override / lifecycle values (1.2, 1.8) --
--    Existing labels: pending, in_progress, signed.
--    'archived' = soft-deleted building; 'on_hold'/'blocked' = manual overrides.
alter type public.building_status add value if not exists 'on_hold';
alter type public.building_status add value if not exists 'blocked';
alter type public.building_status add value if not exists 'archived';

-- 3) Building manual status-override metadata (complaint 1.8) -----------------
--    `status_override` already stores the building's effective status; these
--    columns record WHO set it manually, WHY, and WHEN (audit trail in-row).
alter table public.buildings
  add column if not exists status_override_reason text,
  add column if not exists status_override_by uuid references public.profiles(id),
  add column if not exists status_override_at timestamptz;

-- 4) Backfill engineer_id for the two seeded projects (complaint 1.7) ---------
--    Seeded engineer is the single profile with role 'proje' (Yousef Al-Maliki).
update public.projects
   set engineer_id = (select id from public.profiles where role = 'proje' limit 1)
 where code in ('MOI-ASIR', 'MOH-RIYADH')
   and engineer_id is null;
