-- supabase/migrations/0053_doc_submission_storage_installation.sql
-- Sprint 7.5 (Note 1.4) — persist the MIR/WIR Storage + Installation fields the
-- user enters in the generate modal. Documents live in project_documents (there
-- is no doc_submissions table). Additive, nullable.

alter table public.project_documents
  add column if not exists storage_location   text,
  add column if not exists installation_areas text;
