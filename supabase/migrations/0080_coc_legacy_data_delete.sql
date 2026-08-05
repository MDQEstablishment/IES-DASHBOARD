-- supabase/migrations/0080_coc_legacy_data_delete.sql
-- Sprint 8S Phase 1 — remove ALL legacy COC trial data (owner answers #6, #7,
-- and Q-A: including the 2 remaining demo-project drafts — "start clean").
-- (Comment neutralised under Constraints #7: it named a demo project code
-- carrying a real ministry's identity. No statement in this file changed.)
-- coc_buildings / coc_esms / doc_submission_history rows cascade via FK.
-- The new COC world (0079 tables) starts empty; nothing is migrated.

delete from public.project_documents where doc_type = 'coc';
