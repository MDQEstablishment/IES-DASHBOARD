-- supabase/migrations/0056_projects_soft_delete.sql
-- Sprint 8B (Fix #15) — a real client who mis-imports a project had no way to
-- remove it from the UI. Add a recoverable soft-delete: deleted_at is stamped on
-- delete (status is preserved so the row can be restored to its prior lifecycle
-- state). Every project list / lookup excludes deleted_at IS NOT NULL.
-- A hard-delete sweep for rows older than 30 days is intentionally left to a
-- separate admin job (flagged, not in this sprint).

alter table public.projects add column if not exists deleted_at timestamptz;

-- Partial index keeps the "live projects" scans (the common case) cheap.
create index if not exists projects_live_idx on public.projects (id) where deleted_at is null;
