-- supabase/migrations/0081_coc_legacy_tables_drop.sql
-- Sprint 8S Phase 1 — drop the dead legacy document stack (owner answer #14).
-- Verified: src/pages/Documents.jsx is UNROUTED (dead) — the only reader of
-- these tables; the file itself is removed in Phase 4.
-- NOTE: coc_buildings / coc_esms / project_documents stay until Phase 5 merges
-- (the live COC tab still reads them); they drop in a post-8S cleanup migration.

drop table if exists public.esm_doc_status cascade;
drop table if exists public.documents cascade;
