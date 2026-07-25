-- Sprint 9D-6: THE SURVEY CAPTURES THE OLD UNIT.
-- No structural change is needed — survey_entries already carries registry_id /
-- match_source / match_confidence (the surveyed unit) AND catalog_item_id (the
-- replacement). This migration only makes the two queues the new form depends on
-- cheap to ask for, and documents which column means what so the next reader
-- does not repeat the mistake the form made.
--
-- The "needs matching" queue — AC rows with no registry link — is the input to
-- AI job #1 and is read on every load of the AI assist panel and the survey
-- table filter, so it gets a partial index: only the unmatched rows are in it.

create index if not exists idx_survey_entries_needs_match
  on public.survey_entries(project_id)
  where category = 'ac' and registry_id is null;

create index if not exists idx_survey_entries_registry
  on public.survey_entries(registry_id)
  where registry_id is not null;

comment on column public.survey_entries.registry_id is
  'The SURVEYED (existing) unit, resolved to old_model_registry. Drives the real baseline efficiency (equivalent_seer) and T1 BTU/EER. NULL = needs matching: the baseline falls back to the assumed_old_eff factor and the row is flagged, never silently defaulted.';
comment on column public.survey_entries.catalog_item_id is
  'The approved REPLACEMENT unit. Set at project level (Saving Sheet -> Project Unit Selection), never by the field technician. Rows that already carry one keep it and it wins over the project-level resolution.';
comment on column public.survey_entries.match_source is
  'Who made the registry link: human (picked in the survey form) or ai (job #1, accepted by a human).';
