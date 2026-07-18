-- 8T: COC signatory auto-fill + project-sourced dates
-- item 1 — profiles.job_title is the IES signatory designation printed on COCs
-- (falls back to the role label when unset).
alter table public.profiles add column if not exists job_title text;
comment on column public.profiles.job_title is 'Job title printed as the IES signatory designation on generated COCs (falls back to role label).';

-- item 2 — the التاريخ printed in the COC approval grid comes from the project.
alter table public.projects add column if not exists coc_signature_date date;
comment on column public.projects.coc_signature_date is 'Date the Certificate of Completion is signed/issued; auto-filled into the COC approval grid date row.';
