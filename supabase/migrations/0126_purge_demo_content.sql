-- supabase/migrations/0126_purge_demo_content.sql
-- IES Programme Control Platform — Sprint "Add Project", Unit 1: THE PURGE.
--
-- OWNER-INSTRUCTED, IRREVERSIBLE, THERE IS NO UNDO.
-- This migration permanently deletes every project and every project-scoped
-- row in the database: all 9 projects (including MDQ-K / Khobbar, which the
-- owner ruled was card-test data and goes too), all 815 buildings, and all
-- children. No soft-delete, no recycle bin, no `deleted_at` filter — the
-- purge is total. Once this has run the demo content is gone permanently and
-- cannot be recovered from this database. The owner has instructed this
-- directly and granted standing authority for it.
--
-- Spec: docs/Add-Project-Flow-Plan.md § "Unit 1 — The purge".
-- Proof of the run (live before/after counts, orphan sweep, storage listing):
-- docs/Purge-0126-Proof.md.
--
-- Reference data is NOT touched: audit_log, profiles (and auth.users), the
-- catalogs (lighting/ac/misc), materials + material_categories, esms,
-- tarshid_constants, category_hours_factors, ai_settings, ai_runs,
-- murshid_feedback, report_templates, saving_sheet_templates,
-- approved_baseline_units, model_aliases, old_model_registry.
-- `ai_runs.project_id` is ON DELETE SET NULL and nulls itself; all 24 rows
-- already carry no project link, so ai_runs is unchanged in practice.
--
-- Structure: (a) assert the exact expected before-counts for all 40
-- delete-list tables and the 18 keep-list tables — any mismatch raises and
-- aborts the whole migration; (b) the deletes, in explicit FK order, one
-- statement per table; (c) assert every delete-list table is 0, the keep list
-- is unchanged, and the orphan sweep is clean. A migration runs as a single
-- transaction, so an assertion failure at either end rolls everything back.
--
-- TRIGGER CHECK (required by the plan): the install_log immutability guard
-- from migration 0014 (`install_log_immutable_columns_guard` /
-- `install_log_immutable_guard()`) is a BEFORE **UPDATE** trigger only — it
-- has no DELETE branch and does not block deletes. A full scan of
-- `pg_trigger` for BEFORE DELETE triggers in schema `public` returned zero
-- rows, and `pg_rewrite` holds no DELETE rules. Nothing therefore needs to be
-- disabled: NO TRIGGER IS DISABLED BY THIS MIGRATION. The only DELETE-firing
-- triggers are the AFTER DELETE `audit_trigger_fn()` audit triggers, which we
-- deliberately leave enabled so the purge is itself audited — which is why
-- audit_log is asserted `>=` its before-count, never `=`.

-- ---------------------------------------------------------------------------
-- (a) BEFORE-COUNT ASSERTIONS — abort on any mismatch with the plan's table.
-- ---------------------------------------------------------------------------
do $$
declare
  r        record;
  actual   bigint;
begin
  -- Delete list: all 40 tables, exact equality with docs/Add-Project-Flow-Plan.md.
  for r in
    select * from (values
      ('projects',                      9),
      ('buildings',                   815),
      ('building_item_scope',         298),
      ('project_item_pairs',          102),
      ('project_documents',            29),
      ('project_esms',                 20),
      ('rooms',                         9),
      ('doc_submission_history',        7),
      ('material_movements',            6),
      ('tasks',                         5),
      ('survey_entries',                2),
      ('cocs',                          2),
      ('coc_project_settings',          2),
      ('commitment_revisions',          1),
      ('notifications',                 1),
      ('material_deliveries',         410),
      ('project_installed_items',     169),
      ('project_removed_items',       129),
      ('stock_ledger',                 42),
      ('install_log',                  25),
      ('building_chat_messages',       11),
      ('pdf_extraction_log',            8),
      ('coc_esms',                      7),
      ('coc_buildings',                 5),
      ('building_engineers',            4),
      ('operating_hours',               2),
      ('coc_covered_buildings',         2),
      ('escalations',                   2),
      ('project_status_history',        1),
      -- zero-row members of the delete set, asserted 0 -> 0
      ('building_photos',               0),
      ('photos',                        0),
      ('room_items',                    0),
      ('daily_progress_batch',          0),
      ('daily_progress_line',           0),
      ('coc_beneficiary_assignments',   0),
      ('project_other_installed_items', 0),
      ('project_unit_selection',        0),
      ('project_control_links',         0),
      ('replacement_choices',           0),
      ('saving_sheets',                 0)
    ) as t(tbl, expected)
  loop
    execute format('select count(*) from public.%I', r.tbl) into actual;
    if actual <> r.expected then
      raise exception
        'PURGE 0126 ABORT: before-count mismatch on public.% — plan expected %, live database has %. Nothing has been deleted; the transaction is rolled back.',
        r.tbl, r.expected, actual
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Keep list: asserted unchanged. audit_log is the one exception — it is
  -- asserted as a FLOOR (>=), because the purge's own AFTER DELETE audit
  -- triggers append to it while this migration runs.
  execute 'select count(*) from public.audit_log' into actual;
  -- Stash the measured value in a session GUC so block (c) can assert
  -- "after >= the value actually observed before the deletes", not merely
  -- against the plan's literal. A GUC (not a temp table) so the migration is
  -- indifferent to how the runner wraps its statements.
  perform set_config('purge0126.audit_log_before', actual::text, false);
  if actual < 3536 then
    raise exception
      'PURGE 0126 ABORT: keep-list floor breached on public.audit_log — plan expected at least %, live database has %. Nothing has been deleted; the transaction is rolled back.',
      3536, actual
      using errcode = 'check_violation';
  end if;

  for r in
    select * from (values
      ('lighting_catalog',       593),
      ('ac_catalog',             283),
      ('materials',               56),
      ('material_categories',     34),
      ('ai_runs',                 24),
      ('misc_catalog',            16),
      ('ai_settings',              9),
      ('profiles',                 9),
      ('category_hours_factors',   4),
      ('tarshid_constants',        4),
      ('esms',                     3),
      ('report_templates',         1),
      ('saving_sheet_templates',   1),
      ('approved_baseline_units',  0),
      ('model_aliases',            0),
      ('old_model_registry',       0),
      ('murshid_feedback',         0)
    ) as t(tbl, expected)
  loop
    execute format('select count(*) from public.%I', r.tbl) into actual;
    if actual <> r.expected then
      raise exception
        'PURGE 0126 ABORT: keep-list count mismatch on public.% — plan expected %, live database has %. Nothing has been deleted; the transaction is rolled back.',
        r.tbl, r.expected, actual
        using errcode = 'check_violation';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (b) THE DELETES — explicit FK order, one statement per table.
--     Cascade is deliberately NOT relied on: buildings->projects,
--     rooms/install_log->buildings and install_log/room_items->
--     building_item_scope are RESTRICT; stock_ledger, daily_progress_batch,
--     pdf_extraction_log and project_documents.delivery_id are NO ACTION.
-- ---------------------------------------------------------------------------

-- Notifications first: they reference tasks, escalations, buildings, projects
-- and building_chat_messages, and are the leaf of all of them.
DELETE FROM public.notifications;

-- Daily progress: line -> batch (batch->buildings is NO ACTION;
-- line->rooms is NO ACTION, so both must precede rooms and buildings).
DELETE FROM public.daily_progress_line;
DELETE FROM public.daily_progress_batch;

-- Photos reference install_log and rooms (SET NULL) — cleared before both.
DELETE FROM public.photos;

-- install_log -> buildings and -> building_item_scope are RESTRICT.
DELETE FROM public.install_log;

-- room_items -> building_item_scope is RESTRICT, -> rooms is CASCADE.
DELETE FROM public.room_items;

DELETE FROM public.survey_entries;
DELETE FROM public.rooms;

-- COC / document family. coc_buildings, coc_esms and doc_submission_history
-- all hang off project_documents, so they precede it.
DELETE FROM public.doc_submission_history;
DELETE FROM public.coc_buildings;
DELETE FROM public.coc_esms;
DELETE FROM public.coc_covered_buildings;
DELETE FROM public.cocs;
DELETE FROM public.coc_beneficiary_assignments;
DELETE FROM public.coc_project_settings;

-- project_documents.delivery_id -> material_deliveries is NO ACTION, so
-- documents go before deliveries.
DELETE FROM public.project_documents;

-- Warehouse. NOTE: material_movements loses 6 rows, of which 5 belong to the
-- doomed projects and 1 is a warehouse-level demo movement with no project.
-- That row is deleted deliberately and by name in the plan: leaving it would
-- show phantom stock in the warehouse views once stock_ledger and the
-- deliveries are gone. stock_ledger -> projects/buildings is NO ACTION.
DELETE FROM public.material_movements;
DELETE FROM public.stock_ledger;
DELETE FROM public.material_deliveries;

-- Building children. building_item_scope -> project_esms is RESTRICT, so
-- scope must be cleared before the project_* children below.
DELETE FROM public.building_item_scope;
DELETE FROM public.building_engineers;
DELETE FROM public.building_chat_messages;
DELETE FROM public.building_photos;
DELETE FROM public.operating_hours;

-- escalations.related_task_id -> tasks is SET NULL: escalations before tasks.
DELETE FROM public.escalations;
DELETE FROM public.tasks;

-- The project_* children and the remaining project-scoped tables.
-- project_control_links and project_item_pairs reference
-- project_installed_items / project_removed_items, so they go first.
DELETE FROM public.project_control_links;
DELETE FROM public.project_item_pairs;
DELETE FROM public.project_installed_items;
DELETE FROM public.project_removed_items;
DELETE FROM public.project_other_installed_items;
DELETE FROM public.project_unit_selection;
DELETE FROM public.project_status_history;
DELETE FROM public.project_esms;
DELETE FROM public.commitment_revisions;
DELETE FROM public.saving_sheets;
DELETE FROM public.replacement_choices;
-- pdf_extraction_log.project_id -> projects is NO ACTION: must precede projects.
DELETE FROM public.pdf_extraction_log;

-- The two RESTRICT parents, last. No deleted_at filter anywhere: the purge is
-- total and takes all 9 projects, Khobbar included.
DELETE FROM public.buildings;
DELETE FROM public.projects;

-- ---------------------------------------------------------------------------
-- (c) AFTER ASSERTIONS — every delete-list table at true zero, keep list
--     unchanged (audit_log >= its before-count, since the deletes are
--     audited), and the orphan sweep clean.
-- ---------------------------------------------------------------------------
do $$
declare
  r       record;
  actual  bigint;
  before  bigint;
begin
  -- Every one of the 40 delete-list tables must now be exactly 0.
  for r in
    select * from (values
      ('projects'),('buildings'),('building_item_scope'),('project_item_pairs'),
      ('project_documents'),('project_esms'),('rooms'),('doc_submission_history'),
      ('material_movements'),('tasks'),('survey_entries'),('cocs'),
      ('coc_project_settings'),('commitment_revisions'),('notifications'),
      ('material_deliveries'),('project_installed_items'),('project_removed_items'),
      ('stock_ledger'),('install_log'),('building_chat_messages'),
      ('pdf_extraction_log'),('coc_esms'),('coc_buildings'),('building_engineers'),
      ('operating_hours'),('coc_covered_buildings'),('escalations'),
      ('project_status_history'),('building_photos'),('photos'),('room_items'),
      ('daily_progress_batch'),('daily_progress_line'),('coc_beneficiary_assignments'),
      ('project_other_installed_items'),('project_unit_selection'),
      ('project_control_links'),('replacement_choices'),('saving_sheets')
    ) as t(tbl)
  loop
    execute format('select count(*) from public.%I', r.tbl) into actual;
    if actual <> 0 then
      raise exception
        'PURGE 0126 ABORT: after-count not zero on public.% — expected %, found %. Rolling back.',
        r.tbl, 0, actual
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Keep list unchanged. Block (a) already proved each of these equals the
  -- plan's figure before the deletes, so re-asserting the same figure here is
  -- exactly "unchanged by the purge".
  for r in
    select * from (values
      ('lighting_catalog',       593),
      ('ac_catalog',             283),
      ('materials',               56),
      ('material_categories',     34),
      ('ai_runs',                 24),
      ('misc_catalog',            16),
      ('ai_settings',              9),
      ('profiles',                 9),
      ('category_hours_factors',   4),
      ('tarshid_constants',        4),
      ('esms',                     3),
      ('report_templates',         1),
      ('saving_sheet_templates',   1),
      ('approved_baseline_units',  0),
      ('model_aliases',            0),
      ('old_model_registry',       0),
      ('murshid_feedback',         0)
    ) as t(tbl, expected)
  loop
    execute format('select count(*) from public.%I', r.tbl) into actual;
    if actual <> r.expected then
      raise exception
        'PURGE 0126 ABORT: keep-list table public.% changed — before %, after %. Rolling back.',
        r.tbl, r.expected, actual
        using errcode = 'check_violation';
    end if;
  end loop;

  -- audit_log: floor, not equality — the purge's own AFTER DELETE triggers
  -- add rows to it while this transaction runs.
  before := current_setting('purge0126.audit_log_before')::bigint;
  execute 'select count(*) from public.audit_log' into actual;
  if actual < before then
    raise exception
      'PURGE 0126 ABORT: audit_log shrank — before %, after %. Rolling back.',
      before, actual
      using errcode = 'check_violation';
  end if;

  -- Orphan sweep: nothing anywhere may still reference a deleted id.
  -- ai_runs is the only kept table with an FK into the purged set
  -- (project_id, ON DELETE SET NULL); it must be entirely NULL.
  execute 'select count(*) from public.ai_runs where project_id is not null' into actual;
  if actual <> 0 then
    raise exception
      'PURGE 0126 ABORT: orphan sweep failed — public.ai_runs still has % row(s) with a non-NULL project_id (expected %). Rolling back.',
      actual, 0
      using errcode = 'check_violation';
  end if;

  -- Belt and braces on the reference columns the plan names explicitly.
  -- These tables are emptied above, so each of these must be 0 by definition;
  -- asserting them directly makes the sweep self-evident in the record.
  execute 'select count(*) from public.tasks where project_id is not null or building_id is not null' into actual;
  if actual <> 0 then
    raise exception 'PURGE 0126 ABORT: orphan sweep failed — public.tasks has % row(s) still referencing a project or building (expected %). Rolling back.', actual, 0
      using errcode = 'check_violation';
  end if;

  execute 'select count(*) from public.escalations where project_id is not null or building_id is not null or related_task_id is not null' into actual;
  if actual <> 0 then
    raise exception 'PURGE 0126 ABORT: orphan sweep failed — public.escalations has % row(s) still referencing a project, building or task (expected %). Rolling back.', actual, 0
      using errcode = 'check_violation';
  end if;

  execute 'select count(*) from public.material_movements where project_id is not null or building_id is not null' into actual;
  if actual <> 0 then
    raise exception 'PURGE 0126 ABORT: orphan sweep failed — public.material_movements has % row(s) still referencing a project or building (expected %). Rolling back.', actual, 0
      using errcode = 'check_violation';
  end if;

  raise notice 'PURGE 0126: complete. All 40 delete-list tables at zero, 18 keep-list tables intact, orphan sweep clean.';
end $$;
