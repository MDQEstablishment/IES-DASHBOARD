-- supabase/migrations/0039_seed_doc_reviewers.sql
-- IES Programme Control Platform v2 — Phase 5 hotfix
-- The seeded "approved" project documents had no reviewer/date, so the Reviewed
-- and Reviewer columns showed "—". Backfill them with the PMO (Omar Zaki) and a
-- recent review date. The live Approve action (added in the same change) keeps
-- these populated going forward.

update public.project_documents d
   set reviewed_by = (select id from public.profiles where role = 'pmo' limit 1),
       reviewed_at = now() - interval '2 days'
  from public.projects p
 where d.project_id = p.id
   and p.code = 'MOI-ASIR'
   and d.status = 'approved'
   and d.reviewed_by is null;
