-- 8U Issue 1: signing is TARSHID's scope. The ESCO no longer enters signer names,
-- so clear any signatory values already seeded into coc_project_settings (stale
-- names must never resurface on a generated COC). Schema kept non-destructively:
-- the jsonb columns + coc_beneficiary_assignments are reserved for a future
-- TARSHID-side feature; profiles.job_title / projects.coc_signature_date become
-- no-ops. Column drops are deferred to the post-8S cleanup migration. The
-- signatory columns are NOT NULL, so clear to empty objects rather than null.
update public.coc_project_settings
   set esco_signatory    = '{"org":"IES"}'::jsonb,
       tarshid_spm       = '{}'::jsonb,
       tarshid_technical = '{}'::jsonb;

comment on column public.coc_project_settings.esco_signatory    is 'DEPRECATED (8U): signing is TARSHID scope; not entered by the ESCO, not printed. Reserved.';
comment on column public.coc_project_settings.tarshid_spm       is 'DEPRECATED (8U): reserved for a future TARSHID-side signing feature.';
comment on column public.coc_project_settings.tarshid_technical is 'DEPRECATED (8U): reserved for a future TARSHID-side signing feature.';
comment on column public.profiles.job_title                     is 'DEPRECATED (8U): was the auto-filled IES signatory designation; COCs now print blank signer cells.';
comment on column public.projects.coc_signature_date            is 'DEPRECATED (8U): COC signing date is filled by hand at signing; approval date cell prints blank.';
