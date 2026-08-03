# Sprint plan — purge, then Add Project reduction

**Owner's decisions, closed.** The lifecycle is three stages in this order:
**1) create the project card (basic identity only) → 2) upload the TARSHID
file inside the project, which is what brings the buildings in → 3) survey.**
Buildings are NOT created by hand at project creation.

**This sprint is the project card ONLY** (plus the purge that precedes it).
The TARSHID import and the survey come after the card is finished and the
owner has approved it: **do not build them, do not scaffold them** — no stub
tabs, no placeholder buttons (zero-dead-buttons rule), no partial wiring.
After Unit 2 ships, work **stops for owner approval of the card** before
anything downstream.

This file supersedes the previous version of this plan and narrows
`docs/Project-Lifecycle-Design.md` §G (that design assumed zero projects;
the owner's instruction is: delete the eight soft-deleted projects, **keep
Khobbar**). The register and integration map in that document remain the
reference for later sprints.

Order of work, one logical unit per commit: **purge first**, then the form.
Deploy-green on `main` between units, DB-verified before push, `src/lib`
byte-identical (19/19 sha256, `node scripts/ui-census.mjs --check`). Anything
that turns out to be consumed by a frozen generator is a **stop-and-ask**.

---

## Unit 1 — The purge (verified scope, runs first)

**Scope, verified on the live DB (2026-08-03):** all 815 buildings belong to
the eight soft-deleted projects; zero belong to Khobbar (`MDQ-K`,
`9e89023c-c561-43b7-8576-2c6be2a41e0c`), which is kept. Khobbar owns **zero
rows in every child table** — verified per table, not assumed. Delete the
eight projects and every dependent row; keep all reference data and
`audit_log`.

**There is no undo.** No soft-delete, no recycle bin. Once run, the demo
content is gone permanently. The owner has instructed this directly; the
migration text states it again.

### Delete — expected before → after

| Table | Before | After | | Table | Before | After |
|---|---|---|---|---|---|---|
| projects | 9 | **1** (Khobbar) | | material_deliveries | 410 | 0 |
| buildings | 815 | 0 | | project_installed_items | 169 | 0 |
| building_item_scope | 298 | 0 | | project_removed_items | 129 | 0 |
| project_item_pairs | 102 | 0 | | stock_ledger | 42 | 0 |
| project_documents | 29 | 0 | | install_log | 25 | 0 |
| project_esms | 20 | 0 | | building_chat_messages | 11 | 0 |
| rooms | 9 | 0 | | pdf_extraction_log | 8 | 0 |
| doc_submission_history | 7 | 0 | | coc_esms | 7 | 0 |
| material_movements | 6* | 0 | | coc_buildings | 5 | 0 |
| tasks | 5 | 0 | | building_engineers | 4 | 0 |
| survey_entries | 2 | 0 | | operating_hours | 2 | 0 |
| cocs | 2 | 0 | | coc_covered_buildings | 2 | 0 |
| coc_project_settings | 2 | 0 | | escalations | 2 | 0 |
| commitment_revisions | 1 | 0 | | project_status_history | 1 | 0 |
| notifications | 1 | 0 | | *(zero-row members of the delete set, asserted 0→0: building_photos, photos, room_items, daily_progress_batch, daily_progress_line, coc_beneficiary_assignments, project_other_installed_items, project_unit_selection, project_control_links, replacement_choices, saving_sheets)* | | |

\* `material_movements`: 5 rows belong to doomed projects; **1 row has no
project** (a warehouse-level demo movement). It is deleted with the rest —
leaving it would show phantom stock in the warehouse views once
`stock_ledger` and deliveries are gone. It is the only row in the entire
purge not reachable from the eight projects, named here so the count is
explained, not discovered.

### Keep — unchanged counts asserted

`audit_log` (3,536 — **kept explicitly; grows during the purge because the
deletes are themselves audited, so asserted ≥, not =**) · `lighting_catalog`
593 · `ac_catalog` 283 · `materials` 56 · `material_categories` 34 ·
`ai_runs` 24 (usage telemetry; all 24 already carry no project link) ·
`misc_catalog` 16 · `ai_settings` 9 · `profiles` 9 (incl. reporting tree;
`auth.users` untouched) · `category_hours_factors` 4 · `tarshid_constants` 4 ·
`esms` 3 · `report_templates` 1 · `saving_sheet_templates` 1 ·
`approved_baseline_units` 0 · `model_aliases` 0 · `old_model_registry` 0 ·
`murshid_feedback` 0.

Every one of the 58 public tables appears in exactly one of the two lists.

### Mechanics

- Single transaction, **explicit ordering** (cascade is not relied on —
  `buildings→projects` is RESTRICT; `rooms`/`install_log`→buildings RESTRICT;
  `stock_ledger`, `daily_progress_batch`, `pdf_extraction_log`,
  `project_documents.delivery_id` are NO ACTION). Order: notifications →
  daily_progress_line/batch → photos → install_log → room_items →
  survey_entries → rooms → doc_submission_history → coc_buildings/coc_esms →
  coc_covered_buildings → cocs → coc_beneficiary_assignments/
  coc_project_settings → project_documents → material_movements/stock_ledger →
  material_deliveries → building_item_scope/building_engineers/
  building_chat_messages/building_photos → operating_hours →
  escalations/tasks → the project_* children → buildings → the 8 projects
  (`where deleted_at is not null`).
- **Before-count assertions abort the transaction on any mismatch** with the
  table above; after-count assertions verify the After column and the keep
  list inside the same transaction. Orphan sweep: zero rows referencing any
  deleted id remain anywhere (incl. `tasks.project_id`/`building_id`,
  `escalations.*`, `material_movements.*`).
- The `install_log` immutability guard (migration 0014) must be checked for a
  DELETE branch before writing the script; if it blocks deletes, disable that
  trigger inside the transaction and re-enable it, and say so in the
  migration comments.
- **Storage (SQL does not touch it):** 53 files exist across six content
  buckets. **52 are deleted; 1 is kept** — Khobbar's project cover photo
  (`project-photos/9e89023c-…/76cc6e5e-….jpg`), verified by path attribution.
  Deleted: project-docs 28, daily-progress-photos 11 (incl. `survey/…`
  paths), delivery-notes 8, project-photos 2 of 3, coc-pdfs 2,
  building-photos 1. Buckets `report-templates`, `saving-sheet-templates`,
  `project-templates` untouched. Run as a script immediately after the SQL,
  with its own before/after listing.
- Proof in the PR: per-table before/after table, orphan-sweep output, storage
  listing, census green.

---

## Unit 2 — Add Project form reduction (his changes, verbatim)

All in `ProjectFormModal` (`src/components/ProjectModals.jsx`) unless noted.
No schema changes. No `src/lib` edits. No column drops in this sprint —
**explicitly not in the same commit that changes a column's meaning** (F4).

**F1 — Remove the Buildings section entirely** (`:266-288` and the insert at
`:105-110`). Buildings arrive from the TARSHID import in stage two.
*Accept:* add-mode modal has no building inputs; project creation writes only
`projects`.

**F2 — Remove Items & Replacements entirely** (`:299-324` and inserts
`:118-123`). Scope comes after survey, not before it — this section is what
invited skipping the survey. The Items tab on Project Detail is unchanged.
*Accept:* no `project_installed_items`/`removed`/`pairs` writes from the add
modal.

**F3 — Remove the TARSHID info block** (`:225-255`). Deferred with the parked
Saving Sheet; the ten columns stay in the DB (frozen `savingSheet.js`
readiness list reads them) and remain editable in edit mode.
*Accept:* add-mode form never renders the block; edit mode unchanged.

**F4 — The two date pairs collapse into one.** Owner's words: the project
schedule and the week count are one thing, taken from contract signature date
and works completion date. Form changes:
- The separate Start date / End date inputs (`:199-200`) come **off** the form.
- `Total weeks` (`:201`) becomes **computed, read-only**, from
  `works_end_date − contract_sign_date`, shown blank (not zero) when either
  is missing.

**Every consumer of `start_date`/`end_date`/`total_weeks`, traced** (the
requested stop-and-ask was raised on this trace and resolved by the ruling
below):

| Consumer | Reads | Frozen |
|---|---|---|
| `progressReport.js:49-50` (`estimatedCompletion` = start + weeks×7), `:154`, `:287` (report meta) | `start_date`, `total_weeks` | 🔒 |
| `cocPdf.js:217-218` | `contract_sign_date \|\| start_date`, `works_end_date \|\| end_date` | 🔒 |
| `ProjectDetail.jsx:157-162,267` (header: elapsed weeks, timeline %, days-to-end alert) | all three | — |
| `ProgressReportCard.jsx:39,45,178` (report From default, estimate line) | `start_date`, `total_weeks` | — |
| `Projects.jsx:84-86` (list sort, falls back to created_at) | `start_date` | — |

**Ruling: write-through aliasing** — the contract pair is the source of
truth; save also writes `start_date := contract_sign_date`,
`end_date := works_end_date`, `total_weeks := round(days/7)`. This is the
option provably safe against the frozen readers: the columns carry the
contract values by construction, so `progressReport.js` and `cocPdf.js` keep
producing populated, correct output with zero generator edits — the S-curve
risk is resolved, not accepted. (The alternative — leaving the columns
unwritten — was rejected because it blanks the frozen progress report's
estimated-completion and schedule fields for every new project.) The columns
keep their names; their meaning — derived copies of the contract pair — is
documented in the modal source. Dropping or renaming them is a later,
separate decision, never in the commit that changes their meaning.

> **Column ownership note — for the future reader.** From this sprint on,
> `projects.start_date`, `end_date` and `total_weeks` are **derived copies of
> the contract pair, not authoritative fields**. They stay populated, which
> is easy to mistake for still being owned — they are not; the form neither
> shows nor accepts them. Whether they are ever dropped is a separate later
> decision, and it is contingent on confirming nothing still writes them
> independently. One independent writer is known **today**: the Excel bundle
> import (`import_project_bundle` v4, `0060:50-81`) writes all three from
> template columns. That path is out of scope this sprint and must be
> reconciled in the import sprint before any drop is even considered.

*Accept:* creating with contract 2026-08-01 → works-end 2026-12-31 stores
start=2026-08-01, end=2026-12-31, total_weeks=22; with either date blank all
three stay NULL and the weeks display is empty; edit-mode saves re-derive the
triple.

**F5 — COC Layout removed from the add modal** (`:187-196`). COC is a
separate workstream the owner takes up later. Verified consumers: the COC
building-list CTE (`0044_sprint5_schema.sql:118-125`, via the COC generation
RPCs) and the Items tab grouping (`ProjectItems.jsx:206`) — nothing reads it
at creation time. **Preservation, so nothing is orphaned:** the column, its
enum and every stored value are untouched; the add form simply stops sending
the key, so new rows take the DB default `'concatenated'` (0044:12); the
radio remains in **edit** mode so any existing project's value stays visible
and editable; the COC RPCs and Items tab keep reading `projects.coc_layout`
exactly as before. Post-purge the one surviving project keeps its stored
value. Existing COCs are unaffected — they were generated from settings rows
and PDFs that this change never touches.
*Accept:* add-mode payload sends no `coc_layout`; DB default applies; edit
mode still shows the stored value for pre-existing projects.

**F6 — Coordinates start empty; the purge takes the rest.** Ruling: the Asir
coordinates were demo-project data, and they go with the purge. Two
components to that, kept distinct: (a) the demo projects' stored Asir values
came from migration 0026:26's backfill — **deleted by Unit 1** with those
projects; (b) the create form renders `18.2164` / `42.5053` as `placeholder`
text (`ProjectModals.jsx:259-260`) — grey Asir coordinates that look
pre-filled though they submit empty — **removed entirely** so the fields
start blank with plain labels. No project's values are carried anywhere as a
fallback; a project created without coordinates has none and the map skips
it. The same Asir literals also exist as placeholders in
`BuildingModals.jsx:72-73` and as example-row data in
`scripts/generate-project-template.js:195,216` — both outside the project
card, both **flagged here and left unchanged this sprint** (card only); the
import sprint owns the template.
*Accept:* no coordinate literals anywhere in `ProjectModals.jsx`; created-
blank projects store NULL lat/lng.

**F7 — PM and Project engineer stay** (`:212-213`). Explicit owner call —
untouched.

**F8 — Beneficiary Entity stays explicit.** Owner reversed the derive
proposal: he enters it deliberately as the single authoritative reference.
No silent client fallback at save. The lying placeholder "Defaults to Client"
(`:184`) is removed — the field is labelled plainly as the authoritative
entity. Per the follow-up ruling (Report 1), `client` stays on the card as
the **optional** commercial-client field with the caption "commercial client
— MIR/WIR prints Tarshid when blank"; no reader is repointed this sprint.

Resulting add-mode form: Identity (code, name, status) · Client + Beneficiary
Entity · Reference no · Schedule (contract signature date, works completion
date, computed weeks) · People (PM, engineer) · Contractor (name/phone/email)
· Location (address, blank lat/lng) — and nothing else.

---

## Report 1 — is `client` now the redundant one, and who still reads it

Data fact: in all five live rows where both are set, `client` and
`beneficiary_entity` are **identical**; the remaining rows have
`beneficiary_entity` NULL. So in practice the pair carries one value today.

Who still reads `projects.client`:

| Reader | Where | Behaviour if `client` were left blank |
|---|---|---|
| MIR/WIR generator 🔒 | `inspectionDocs.js:20` — `clientName: client \|\| 'Tarshid'` (**prefers client; does not read beneficiary for this line**) | prints "Tarshid" |
| MIR/WIR beneficiary line 🔒 | `inspectionDocs.js:25` — `beneficiary_entity \|\| client` | unaffected (beneficiary set) |
| Progress report cover 🔒 | `progressReport.js:284` — `client \|\| beneficiary_entity` (prefers client) | falls back to beneficiary — same output |
| COC 🔒 | `cocPdf.js:222` — `beneficiary_entity \|\| client` | unaffected |
| Saving sheet 🔒 | `savingSheetGen.js:29,87` — `beneficiary_entity \|\| client` | unaffected |
| Photo annex 🔒 | `reportPhotoAnnex.js:93` via meta.client | follows progress report meta |
| UI | `ProjectDetail.jsx:233` header chip, `Projects.jsx:168` list meta | shows "—" / omits |

Conclusion: with Beneficiary Entity authoritative, `client` is **redundant as
data** (always equal when present) but **not removable and not blankable
without consequence**: two frozen generators prefer it, and the MIR/WIR
"Client" line semantically means the paying client (its own default is
literally `'Tarshid'`), which is not always the beneficiary ministry.

**Ruled: keep `client` as the optional commercial-client field**, beneficiary
authoritative, captioned "commercial client — MIR/WIR prints Tarshid when
blank". No reader changes this sprint. The places that read `client` where,
under the new authority, they arguably *should* read beneficiary — the
progress-report cover (`progressReport.js:284` 🔒, prefers client) and the
two UI surfaces (`ProjectDetail.jsx:233` header, `Projects.jsx:168` list) —
are recorded here for the later documents/COC workstream, not changed now;
the frozen one is a stop-and-ask whenever that workstream reaches it.

## Report 2 — numeric S-curve impact of repointing to contract dates

*(Resolved by the write-through ruling: because the columns carry the
contract values by construction, the numbers below describe the **intended
new behaviour**, not a risk — no consumer, frozen or not, sees a blank or a
divergent value.)*

What consumes the old pair: `ProjectDetail.jsx:157-162` (header: weeks
elapsed = ⌊(today − start_date)/7⌋, timeline % = elapsed/total_weeks, "days
to end" red alert ≤ 14 days from end_date), `progressReport.js:49-56` 🔒
(estimated completion = start_date + total_weeks×7; report meta),
`ProgressReportCard.jsx:39,178` (report From defaults to start_date),
`Projects.jsx:84-86` (sort). The frozen generator reads the **columns**
`start_date`/`total_weeks` — which is why F4 write-through aliases the
columns rather than repointing readers.

On the live projects that carry both pairs, as of 2026-08-03:

| Project | Today (start/end/weeks) | Contract pair | Numeric change |
|---|---|---|---|
| **MDQ-K (Khobbar — the real one)** | 2026-08-03 → 2026-11-01, total_weeks **64** (already self-contradictory: the date span is 12.9 weeks) | 2026-08-01 → 2026-12-31 = 152 days = **21.7 → 22 weeks** | Planned-progress denominator 64 → 22: on 2026-10-01 the header timeline reads **12.5 %** today vs **36.4 %** repointed (8 elapsed weeks ÷ 64 vs ÷ 22). Estimated completion 🔒: 2026-08-03 + 448 d = **2027-10-25** today vs 2026-08-01 + 154 d = **2027-01-02** repointed (rounding to whole weeks lands 2 days past works-end — display the date pair, use weeks only for the %). "Days to end" alert: 90 → 150 days. |
| PROJECT-A-DIP-50 / -FULL | 2026-09-01 → 2028-09-01, 104 w | 2026-08-15 → 2028-08-31 = 747 d = 106.7 w | start 17 days earlier, +2.7 weeks denominator: mid-project planned % shifts ≈ +1.5 points at any given date. Purged anyway — shown as the "pairs nearly agree" case. |
| PROJECT-A-DIP-709 | all NULL | 2025-10-01 → 2026-06-30 | today: **no timeline at all** (header shows nothing, estimated completion empty). Repointed it would have had one — the current split-brain in one row. Purged anyway. |

Summary: where the pairs disagree the effect is not cosmetic — for Khobbar
the planned-progress line nearly **triples** its slope (denominator 64 → 22
weeks) and the estimated completion moves **ten months earlier**. That is the
owner's stated intent (the contract IS the schedule); the write-through in F4
makes every consumer — frozen and unfrozen — follow the contract pair with no
generator edits. The old fallback (`cocPdf.js:217-218` printing start/end
when cert dates were blank) becomes moot: after F4 the pairs are equal by
construction on new/edited rows.

---

## Constraints for the implementer (both units)

1. `src/lib/**` byte-identical — 19/19 manifest, `--check` before claiming done.
2. One logical unit per commit: purge (its own migration + storage script),
   then the form reduction. Deploy-green on `main` between them; branch runs
   build-only.
3. No column drops, no renames, no RLS changes anywhere in this sprint.
4. Zero dead buttons; zero Arabic in source; Latin digits, local dates;
   cards contain their tables at 1366 and 1280.
5. Frozen-generator surprises (anything new found reading a touched field) =
   stop and ask, not a judgement call.

## Review checklist (what I check when Opus hands back)

- [ ] Purge migration asserts the exact before-counts and fails loudly;
      after-counts + orphan sweep + storage listing in the PR; Khobbar row,
      its cover photo, all reference tables and `audit_log` intact.
- [ ] Census 19/19; build clean on branch; `main` green after each merge.
- [ ] Add modal: no Buildings section, no Items & Replacements, no TARSHID
      block, no COC Layout, no start/end inputs, no coordinate placeholders.
- [ ] Weeks computed+read-only, blank (not 0) when a date is missing;
      write-through stores the aliased triple correctly.
- [ ] Beneficiary field explicit, no fallback write, placeholder gone.
- [ ] PM/engineer selects untouched; edit mode still exposes the removed
      blocks where they belong (TARSHID block, COC layout).
- [ ] No writes to `project_installed_items`/`removed`/`pairs`/`buildings`
      from the add path — grep-proof.
