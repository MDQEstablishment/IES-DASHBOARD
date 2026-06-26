-- supabase/migrations/0059_8c_schema_and_standalone_coc.sql
-- Sprint 8C — additive schema + the standalone-COC behavioural change.
--
-- #1  Each ESM now gets its OWN COC by default. coc_bundle_key NULL already means
--     standalone (default_coc_plan groups by coalesce(coc_bundle_key,'esm:'||code));
--     the only place ESM1+ESM2 shared a 'lighting' bundle was the MOI-ASIR seed
--     (0044). Null it out so existing projects become standalone too. New imports
--     already default to standalone; an optional project-level coc_bundle_key
--     (RPC v4) can re-group ESM1+ESM2 for the rare case the owner wants to.
-- #5  buildings.operating_hours — annual operating hours agreed with the client
--     (per building, since it can vary by contract).
-- #6  projects.pm_name / engineer_name — optional display-name overrides; the
--     *_email columns remain the source of truth for permissions/identity.

alter table public.buildings add column if not exists operating_hours int;
alter table public.projects  add column if not exists pm_name text;
alter table public.projects  add column if not exists engineer_name text;

update public.project_esms set coc_bundle_key = null where coc_bundle_key = 'lighting';
