-- 9H(5) part 2 of 2 — wire the new outcome in, and record the re-submission
-- date the inspection form asks for.
--
-- expected_resubmission_date backs the "EXPECTED RE-SUBMISSION DATE (if
-- applicable)" line that 9H(4) added to the inspection shell. It is a date the
-- REVIEWER sets when asking for a resubmission, so it belongs on the document
-- row next to the rest of the client-response fields (client_reviewer_name,
-- client_response_date, response_notes) rather than in the generator's payload.

alter table public.project_documents
  add column if not exists expected_resubmission_date date;

-- 'retained_for_information' joins the eight statuses a document may hold.
alter table public.project_documents drop constraint if exists project_documents_status_check;
alter table public.project_documents add constraint project_documents_status_check
  check (status = any (array[
    'draft', 'submitted', 'under_review', 'approved', 'approved_with_comments',
    'rejected', 'resubmitted', 'retained_for_information', 'superseded'
  ]));

-- The history trigger writes one row per status change and drops anything this
-- mapping returns null for — so without this the new outcome would change the
-- document silently, leaving no audit trail. That is the whole reason the enum
-- value had to exist first.
create or replace function public.doc_status_to_action(p text)
returns public.doc_action
language sql
immutable
as $$
  select case p
    when 'submitted' then 'submitted'::public.doc_action
    when 'under_review' then 'client_received'::public.doc_action
    when 'approved' then 'approved'::public.doc_action
    when 'approved_with_comments' then 'approved_with_comments'::public.doc_action
    when 'rejected' then 'rejected'::public.doc_action
    when 'resubmitted' then 'resubmitted'::public.doc_action
    when 'retained_for_information' then 'retained_for_information'::public.doc_action
    else null end;
$$;
