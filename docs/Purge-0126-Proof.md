# Purge 0126 — proof of run

Migration: `supabase/migrations/0126_purge_demo_content.sql`
Applied to the live database (project `mzuyvajefqkmaxludijm`) on **2026-08-03**
via `apply_migration`, name `purge_demo_content`. Spec:
`docs/Add-Project-Flow-Plan.md` § "Unit 1 — The purge".

**Owner-instructed, irreversible, no undo.** All nine projects and every
project-scoped row are permanently gone, Khobbar (`MDQ-K`) included. There is
no soft-delete and no recycle bin; nothing below can be restored from this
database.

**Verdict: the run matched the plan exactly.** Every before-count was queried
live and equalled the plan's figure; every delete-list table is now at true
zero; every keep-list table is unchanged; the orphan sweep is clean; all 53
storage objects across the six content buckets are gone and the three
template buckets are untouched. There were no deviations from the plan's
scope, counts or order. Two mechanical notes — neither a scope change — are
recorded under "Notes on mechanics" at the end.

---

## Per-table before / after

Both columns were queried against the live database — `before` immediately
prior to `apply_migration`, `after` immediately following it. Neither column
is copied from the plan; the "plan" column is shown alongside so the match is
checkable at a glance.

### Delete list (40 tables) — all reached zero

| Table | Plan | Before (live) | After (live) | Match |
|---|---:|---:|---:|:--:|
| projects | 9 | 9 | 0 | yes |
| buildings | 815 | 815 | 0 | yes |
| building_item_scope | 298 | 298 | 0 | yes |
| project_item_pairs | 102 | 102 | 0 | yes |
| project_documents | 29 | 29 | 0 | yes |
| project_esms | 20 | 20 | 0 | yes |
| rooms | 9 | 9 | 0 | yes |
| doc_submission_history | 7 | 7 | 0 | yes |
| material_movements | 6 | 6 | 0 | yes |
| tasks | 5 | 5 | 0 | yes |
| survey_entries | 2 | 2 | 0 | yes |
| cocs | 2 | 2 | 0 | yes |
| coc_project_settings | 2 | 2 | 0 | yes |
| commitment_revisions | 1 | 1 | 0 | yes |
| notifications | 1 | 1 | 0 | yes |
| material_deliveries | 410 | 410 | 0 | yes |
| project_installed_items | 169 | 169 | 0 | yes |
| project_removed_items | 129 | 129 | 0 | yes |
| stock_ledger | 42 | 42 | 0 | yes |
| install_log | 25 | 25 | 0 | yes |
| building_chat_messages | 11 | 11 | 0 | yes |
| pdf_extraction_log | 8 | 8 | 0 | yes |
| coc_esms | 7 | 7 | 0 | yes |
| coc_buildings | 5 | 5 | 0 | yes |
| building_engineers | 4 | 4 | 0 | yes |
| operating_hours | 2 | 2 | 0 | yes |
| coc_covered_buildings | 2 | 2 | 0 | yes |
| escalations | 2 | 2 | 0 | yes |
| project_status_history | 1 | 1 | 0 | yes |
| building_photos | 0 | 0 | 0 | yes |
| photos | 0 | 0 | 0 | yes |
| room_items | 0 | 0 | 0 | yes |
| daily_progress_batch | 0 | 0 | 0 | yes |
| daily_progress_line | 0 | 0 | 0 | yes |
| coc_beneficiary_assignments | 0 | 0 | 0 | yes |
| project_other_installed_items | 0 | 0 | 0 | yes |
| project_unit_selection | 0 | 0 | 0 | yes |
| project_control_links | 0 | 0 | 0 | yes |
| replacement_choices | 0 | 0 | 0 | yes |
| saving_sheets | 0 | 0 | 0 | yes |

**Total rows deleted: 2,125** (29 tables held rows; the other 11 were already
empty and were asserted 0 → 0). All 9 projects (no `deleted_at` filter — the
purge is total), all 815 buildings, true zero on the project side.

`material_movements`: all 6 rows went, as the plan specifies — 5 belonging to
the doomed projects and 1 warehouse-level demo movement with no project link.
That row is the only one in the entire purge not reachable from the projects,
and it was named in the plan in advance rather than discovered here.

### Keep list (18 tables) — all unchanged

| Table | Plan | Before (live) | After (live) | Match |
|---|---:|---:|---:|:--:|
| audit_log | 3,536 (asserted ≥) | 3,536 | 4,738 | yes — grew, as expected |
| lighting_catalog | 593 | 593 | 593 | yes |
| ac_catalog | 283 | 283 | 283 | yes |
| materials | 56 | 56 | 56 | yes |
| material_categories | 34 | 34 | 34 | yes |
| ai_runs | 24 | 24 | 24 | yes |
| misc_catalog | 16 | 16 | 16 | yes |
| ai_settings | 9 | 9 | 9 | yes |
| profiles | 9 | 9 | 9 | yes |
| category_hours_factors | 4 | 4 | 4 | yes |
| tarshid_constants | 4 | 4 | 4 | yes |
| esms | 3 | 3 | 3 | yes |
| report_templates | 1 | 1 | 1 | yes |
| saving_sheet_templates | 1 | 1 | 1 | yes |
| approved_baseline_units | 0 | 0 | 0 | yes |
| model_aliases | 0 | 0 | 0 | yes |
| old_model_registry | 0 | 0 | 0 | yes |
| murshid_feedback | 0 | 0 | 0 | yes |

`audit_log` gained **1,202 rows** (3,536 → 4,738). This is the expected and
required behaviour: the `AFTER DELETE` `audit_trigger_fn()` triggers were
deliberately left enabled so that the purge is itself audited, which is why
the plan asserts `audit_log` as a floor (`≥`) rather than an equality. It is
the only keep-list table whose count moved, and it moved upward only. Not
every purged table carries an audit trigger, which is why the growth is 1,202
rather than 2,125.

`auth.users` was never referenced by the migration and is untouched. All 58
public tables appear in exactly one of the two lists above (40 + 18 = 58).

---

## Orphan sweep

Queried live after the migration:

| Check | Expected | Actual | Result |
|---|---:|---:|:--:|
| `ai_runs` total rows | 24 | 24 | pass |
| `ai_runs` rows with non-NULL `project_id` | 0 | 0 | pass |
| `tasks` rows with non-NULL `project_id` or `building_id` | 0 | 0 | pass |
| `escalations` rows with non-NULL `project_id`, `building_id` or `related_task_id` | 0 | 0 | pass |
| `material_movements` rows with non-NULL `project_id` or `building_id` | 0 | 0 | pass |
| All 40 delete-list tables | 0 | 0 | pass |

`ai_runs` is the only surviving table anywhere in the schema holding a foreign
key into the purged set (`ai_runs.project_id`, `ON DELETE SET NULL`). All 24
rows already carried a NULL `project_id` before the purge, so the FK had
nothing to null and the telemetry is bit-for-bit unchanged. `audit_log` holds
no foreign keys at all. **Zero rows anywhere in the database still reference a
deleted project, building, room, task, escalation, COC, document or delivery
id.**

These same checks also run as assertions inside the migration's closing `DO`
block, so a failure would have rolled the whole transaction back rather than
leaving a half-purged database.

---

## Storage

Six content buckets held 53 objects before the run, exactly as the plan
predicted. `coc-responses` exists as a bucket but held zero objects, so the
"also delete anything found in coc-responses" instruction found nothing to do.

| Bucket | Before | After | Status |
|---|---:|---:|---|
| project-docs | 28 | 0 | purged |
| daily-progress-photos | 11 | 0 | purged (incl. 7 `survey/…` paths) |
| delivery-notes | 8 | 0 | purged |
| project-photos | 3 | 0 | purged (incl. Khobbar's cover photo) |
| coc-pdfs | 2 | 0 | purged |
| building-photos | 1 | 0 | purged |
| coc-responses | 0 | 0 | purged (was already empty) |
| **Content total** | **53** | **0** | |
| report-templates | 1 | 1 | **untouched** |
| saving-sheet-templates | 1 | 1 | **untouched** |
| project-templates | 0 | 0 | **untouched** |
| images | 0 | 0 | not in scope, unchanged |
| saving-sheets | 0 | 0 | not in scope, unchanged |

Khobbar's cover photo
`project-photos/9e89023c-c561-43b7-8576-2c6be2a41e0c/76cc6e5e-49f7-468a-b27f-f9b9512569bf.jpg`
was present before and is gone after, which is what the total-purge ruling
requires.

### Before listing (all 53, per bucket)

**building-photos (1)**
- `1de762ad-a993-49a8-bed6-84a4cc9e80c1/bd93f7b2-6181-4233-a9c6-4a0438c60cd0/2026-06-20/1781981787710-3zd3fd.jpg`

**coc-pdfs (2)**
- `53312e46-4da3-41f9-babd-7630f28297c1/DEMO-PROJECT-2-COC-001-R1.pdf`
- `53312e46-4da3-41f9-babd-7630f28297c1/DEMO-PROJECT-2-COC-002-R1.pdf`
  <!-- Both filenames began with the demo programme's project code, which
       carried a real ministry's identity; neutralised under Constraints #7.
       The objects themselves were deleted by the purge this document proves,
       and the count (2) and paths are otherwise unchanged. -->

**daily-progress-photos (11)**
- `1de762ad-…-80c1/2026-06-28/a17bfe84-d866-44cc-9e3e-1ce5af1f2a02.jpeg`
- `1de762ad-…-80c1/2026-06-28/a39798c9-2c70-4b17-9f9f-d4d4ca57e55a.jpeg`
- `58121830-c97c-46e5-abe9-9e056632c909/2026-07-16/0888c179-23df-4d2f-a980-cd2bf32bf2a5.png`
- `7d3208ed-87d7-493f-9827-e580f7ac5934/2026-06-28/f6b39ec1-54b1-4a4a-9686-d4adf9811f64.jpeg`
- `survey/68f2bffb-…-b035bc2/066d5962-61d6-4611-811b-546258ab3350.png`
- `survey/68f2bffb-…-b035bc2/32fc32cb-a28a-4fef-b9ec-6959a8d56b88.png`
- `survey/68f2bffb-…-b035bc2/50b93e35-242f-48f7-a42a-8815aad01703.jpeg`
- `survey/68f2bffb-…-b035bc2/6052cc80-71f4-43fb-a74d-898b84a6d4bf.png`
- `survey/68f2bffb-…-b035bc2/cc58096c-86b3-4623-8819-ad9e25bedc3e.jpeg`
- `survey/68f2bffb-…-b035bc2/f2fc7c41-db4c-4b0d-b7fc-7519482917f8.jpeg`
- `survey/f3e3996d-bf1c-4806-b69a-cd2fbf24ec63/13b545e0-3cee-438a-b9d1-586d3d7a7cea.png`

**delivery-notes (8)** — all under `84f189ad-2281-402c-8f0d-cfa5b6d790b8/`
- `24b759e1-664e-4d32-ba74-d7520b8e3f41.pdf`
- `2b7bf396-4fdf-40a2-b7b8-ea375f5cb749.pdf`
- `6e686117-7907-493f-831d-9f88c158b607.pdf`
- `8a544774-96fe-4ec3-ab63-7ee7b8fd8f21.pdf`
- `af136ce2-c647-4ce6-8f3e-1567be44dd28.pdf`
- `bbea956e-d8d5-41cc-8731-0d28cd7f3bcf.pdf`
- `bcfac6b1-ceb7-4e4c-bf58-2680a2a2472f.pdf`
- `d56b70e7-ad10-445f-9ada-0ef0e51aadf3.pdf`

**project-docs (28)** — 21 under project `2d6b3088-…-84276`, 4 under
`53312e46-…-8297c1`, 3 under `84f189ad-…-d790b8`; a mix of dated uploads and
generated MIRs (`MIR-PROJECT-A-2026-0010` … `-0014`,
`MIR-PROJECT-A-DIP-50-2026-0002`, `-0003`).

**project-photos (3)**
- `53312e46-4da3-41f9-babd-7630f28297c1/8769e451-a441-4db3-9b2e-8aeafbe1e7a8.jpg`
- `9e89023c-c561-43b7-8576-2c6be2a41e0c/76cc6e5e-49f7-468a-b27f-f9b9512569bf.jpg` — Khobbar's cover photo
- `a5010000-0000-4000-8000-000000000001/54880bdb-8d6f-46c1-8054-e0a24721b233.jpeg`

**coc-responses (0)** — bucket exists, held no objects.

### After listing

Every one of the seven buckets above returns **zero objects**. The only
objects remaining anywhere in storage are the two template files that the plan
requires be kept: one in `report-templates` and one in `saving-sheet-templates`.

### Method, and what "deleted" means here

The deletion was performed with
`DELETE FROM storage.objects WHERE bucket_id IN (…)` over `execute_sql`, as
the plan's preferred method. **This removes the API-visible objects** — they
no longer appear in any listing, download or signed-URL request, and the
application sees empty buckets. **Physical blob garbage collection is
Supabase-side**: the underlying S3 blobs are reclaimed by Supabase's own
storage GC on its schedule, not by this statement. Nothing further is required
of the application, and no orphaned row remains in `storage.objects`.

---

## Repo checks

Unit 1 touches no application code — the commit contains only the migration
and this proof — so both checks below are expected to be trivially green. They
were run anyway, after the purge, and both passed.

| Check | Result |
|---|---|
| `npm run build` | **pass** — `vite build`, exit 0, built in 10.52s, no errors or warnings |
| `node scripts/ui-census.mjs --check` | **pass** — exit 0, "census clean — no control, query or lib hash changed" |

`src/lib/**` is byte-identical: the census reports no lib hash change, which is
the 19/19 manifest condition from the sprint constraints.

---

## Notes on mechanics

Two implementation details worth recording. Neither changes the purge's scope,
counts or ordering, and neither is a deviation from the plan.

**1. No trigger needed disabling.** The plan required the `install_log`
immutability guard from migration 0014 to be checked for a DELETE branch
before writing the script. It was checked: `install_log_immutable_guard()` is
attached as a **BEFORE UPDATE** trigger only and has no DELETE branch, so it
does not block deletes. A full scan of `pg_trigger` for `BEFORE DELETE`
triggers in schema `public` returned zero rows, and `pg_rewrite` holds no
DELETE rules. **No trigger was disabled by the migration**, and none needed to
be. The `AFTER DELETE` audit triggers were left deliberately enabled so the
purge is audited — see the `audit_log` growth above.

**2. Storage has its own delete guard.** `storage.objects` carries a
Supabase-managed `storage.protect_delete()` trigger that rejects direct SQL
deletion unless the session GUC `storage.allow_delete_query` is set to
`'true'` — an opt-in escape hatch Supabase provides for exactly this case. The
setting was enabled for the single delete statement and set back to `'false'`
in the same session immediately afterwards, leaving the guard re-armed. The
trigger itself was never dropped, altered or disabled, and nothing in the
`storage` schema was modified.

**Scope discipline.** No schema changes were made: no DDL, no column drops or
renames, no RLS changes, no changes to any trigger or function definition. The
migration contains only assertions and `DELETE` statements. Nothing outside
the plan's enumerated delete list was touched, in either the `public` or the
`storage` schema.
