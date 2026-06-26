-- supabase/migrations/0047_sanitize_doc_review_arabic.sql
-- Sprint 6 (6E audit) — zero-Arabic gate: clear Arabic test-data left in the
-- document review free-text fields (reviewer name, response notes, history
-- notes). These were keyboard-mashed test entries, not real content.

update public.project_documents set client_reviewer_name = null
where client_reviewer_name ~ '[؀-ۿ٠-٩۰-۹]';

update public.project_documents set response_notes = null
where response_notes ~ '[؀-ۿ٠-٩۰-۹]';

update public.doc_submission_history set notes = null
where notes ~ '[؀-ۿ٠-٩۰-۹]';
