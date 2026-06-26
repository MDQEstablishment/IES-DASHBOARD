-- supabase/migrations/0054_project_documents_revision.sql
-- Sprint 7.6 (4c, Option A) — explicit Replace flow. A replaced/re-submitted doc
-- keeps the original reference_no and bumps a numeric revision (R1, R2, …). The
-- existing text `revision` column ('A'/'B' for COC) is left untouched; the numeric
-- counter uses a separate rev_no column. Uniqueness moves to (reference_no, rev_no)
-- so revisions can share a reference number.

alter table public.project_documents
  add column if not exists rev_no int not null default 0;

drop index if exists project_documents_reference_no_key;
create unique index if not exists project_documents_reference_rev_key
  on public.project_documents (reference_no, rev_no);
