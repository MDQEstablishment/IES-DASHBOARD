-- supabase/migrations/0051_sanitize_doc_name_arabic.sql
-- Sprint 7 (7D audit) — zero-Arabic gate: replace the remaining Arabic test-data
-- document name with its reference number (now that every doc has one).

update public.project_documents
  set name = coalesce(reference_no, public.doc_kind_code(doc_type) || ' Document')
where name ~ '[؀-ۿ٠-٩۰-۹]';
