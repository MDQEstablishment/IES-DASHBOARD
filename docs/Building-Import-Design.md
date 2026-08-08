# Building list import — template and import design

**Status: PLAN, awaiting owner approval of the template design. Nothing built.**

Step one of a project is creating the project card; step two is adding
buildings. Buildings arrive two ways from that same card — one at a time
through the Add-building modal, or in bulk from an Excel file — and the
template is the guide an ESCO holds in its hands. The template is the product
here, so it is specified column by column below and shown to the owner before
anything is built.

---

## 1. The finding that shapes the whole sprint

The owner's requirement is that **manual add and Excel import produce identical
rows** — same defaults, same code generation, same audit — from one write path.
Two things in the code today make that a real change rather than a wiring job.

**(a) The Add-building modal makes the user type the building code.**
`BuildingModals.jsx` initialises `code` from a text field and refuses to save
without it: `if (!f.code.trim() || !f.name.trim())`. The frozen scheme
(Survey-Stage-Design §5.2, §6) says building codes are `<PROJECT>-B0001…` minted
**at import in list order**. If import mints and the modal accepts anything
typed, the two paths diverge on the first field — the exact divergence the
owner ruled out. **The modal must stop asking for a code**, show the code it
will be assigned, and mint through the same function.

**(b) The contractor name is written to two columns on purpose.**
The modal comments say it mirrors into both `contractor` and `contractor_name`
"so the new row shows everywhere immediately", and both are populated on both
existing rows. That is one fact with two homes — the defect class this project
already has a test for (`tests/oneFactOneHome.test.mjs`). The import must not
inherit it silently. Plan: the single write path writes both **for now**, and a
follow-up collapses to `contractor_name` after backfilling readers. Dropping a
column is destructive, so it needs sign-off under Constraints #5 and is not
bundled here.

**The one write path.** A Postgres function

```
import_buildings(p_project_id uuid, p_rows jsonb, p_source text, p_file_name text)
  returns table (row_index int, outcome text, code text, reason text)
```

is the only thing that inserts a building. The modal calls it with a
single-element array and `p_source = 'app'`; the importer calls it with the
parsed file and `p_source = 'import'`. Defaults, code minting, coordinate
normalisation and the audit row live inside it, so they cannot drift apart.

---

## 2. The template, sheet by sheet

Generated **server-side, per project, per download** by an Edge Function —
never a committed binary. It embeds the project code and reads its dropdown
values from the database, so it is current at the moment of download. Built
with **ExcelJS**, which preserves data validation; openpyxl silently drops it,
which is why the proof in §6 reopens the generated file two independent ways.

### Sheet 1 — `Instructions` (English)

Read-only, styled to the dashboard palette. Contains:

- project name and code, and the generation date;
- three-step how-to: fill one row per building, keep the header row, upload;
- **the column reference table** (every column, whether required, its format,
  a worked example, and what happens if it is wrong);
- **a filled example row** shown exactly as it should look;
- the note that **Building Code is not typed** — it is assigned at import in
  the order of the rows, so there is no code column to fight over;
- the two accepted coordinate formats, with an example of each;
- what happens on a duplicate name (held for your decision, never merged);
- what happens on a re-import (every row already present is held, nothing is
  written twice).

### Sheet 2 — `Buildings` (the data sheet)

Header row frozen and locked; every data cell below it open. One row per
building.

| # | Column header | Req | Type / validation | Lands in | Notes |
|---|---|---|---|---|---|
| A | `#` | – | integer, locked formula | – | row counter, for the report to refer to |
| B | `Building Name` | **yes** | text | `name` | as supplied, any script — see Decision 1 |
| C | `Building Name (Arabic)` | no | text | `name_ar` | Constraints #1 sanctioned exception |
| D | `City` | no | text | `city` | |
| E | `Region` | no | **dropdown** | `region` | values from DB lookup, not hardcoded |
| F | `Coordinates` | no | text | `gps` + `location_lat/lng` | DMS **or** decimal, one column |
| G | `Ownership Type` | no | **dropdown** | `building_type` | values from DB lookup — see Decision 2 |
| H | `Electricity Meter No` | no | text (text-formatted) | `elec_meter_no` | text format keeps leading zeros |
| I | `Floors` | no | integer 0–200 | `floors` | |
| J | `Area (m2)` | no | decimal ≥ 0, 2 dp | `area_sqm` | header has no `²` so the importer never sees an encoding surprise |
| K | `Contractor Name` | no | text | `contractor_name` (+`contractor`) | see §1(b) |
| L | `Contractor Phone` | no | text-formatted | `contractor_phone` | text so `+966…` and leading `0` survive |
| M | `Site Engineer` | no | text | `engineer_name` (+ maybe `assigned_engineer_id`) | see Decision 3 |
| N | `Residential` | no | **dropdown** Yes/No | `is_residential` | blank ⇒ `false`, the column default |
| O | `Notes` | no | text | `remarks` | preserved as data, never parsed |

Number and date formats are set on the columns themselves, so a value typed as
text still lands as a number.

### Sheet 3 — `Lists` (hidden)

The dropdown sources: regions, ownership types, Yes/No. Hidden rather than
deleted, because a validation whose source sheet is missing is a validation
Excel silently drops on the next save.

### Sheet 4 — `_meta` (hidden)

`project_id`, `project_code`, `template_version`, `generated_at`. The importer
**refuses a workbook whose `project_id` is not the project being imported
into**, with that reason stated — a file filled for one project cannot be
misfiled into another.

---

## 3. Import behaviour

**Header-driven, never position-driven.** Headers are matched on a normalised
form (trim, casefold, collapse whitespace, strip trailing `*`). Reordered
columns import correctly. Unknown headers are **reported, not fatal**. A
missing required header rejects the file **before any write**, naming the
header.

**Nothing is silently dropped.** Every row returns `accepted` or `held` with a
reason the surveyor can act on. Held rows are shown with their row number and
original values; the file is never partially applied without the report saying
exactly what happened to each line.

**Duplicates are surfaced, never auto-merged** — within the file and against
the project, compared on a normalised name (casefold, collapse whitespace).
Both sides of the match are shown so a human decides.

**Coordinates normalise to one canonical form, original preserved.** The
supplied string goes to `gps` verbatim; the parsed decimal goes to
`location_lat` / `location_lng`. Accepted: decimal (`24.7136, 46.6753`) and DMS
(`24°42'49"N 46°40'31"E`). Out-of-range or unparseable ⇒ row **accepted** with
the coordinate left null and a note — a bad coordinate is not a reason to
refuse a building.

**Codes** are minted inside the write path, in file order, `<PROJECT>-B0001`
upward, under a per-project advisory lock so two simultaneous imports cannot
collide.

**Authority**: the same model as everything else — a `project_members` member
(`projm`/`proje`/`procm`/`proco`) on that project, or an all-scope role. The
RPC is `security definer` and re-checks with `may('project.write', p_project_id)`
rather than trusting the caller.

**Audit**: every import writes one row to `building_import_log` — who, when,
file name, rows accepted, rows held — and the held rows as `jsonb` so the
decision can be revisited. A manual add writes the same audit row with
`source='app'` and no file name.

---

## 4. Year-two column — what will a client want to change, and can they?

| Change | Without us? | Mechanism |
|---|---|---|
| Add a region to the dropdown | **yes** | row in the lookup table; next download has it |
| Add an ownership type | **yes** | same |
| Reorder the columns | **yes** | header-driven matching |
| Rename a header (`Area (m2)` → `Built-up Area`) | **yes** | alias rows in the lookup table, matched before the canonical header |
| Translate the headers | **yes** | same alias mechanism |
| **Add a new data column** | **no** | needs a schema column, a template column and a mapping — honest answer: this one needs us |

The last row is the honest limit. Two things soften it: `Notes` accepts
anything unstructured, and unknown headers are reported rather than rejected,
so when a client starts adding a column we find out from the report instead of
from a silent loss.

**This is why regions and ownership types are DB lookups rather than constants
in the generator.** Hardcoding them would put a client change behind a deploy,
which is the year-two failure this column exists to prevent.

---

## 5. Scenario set

| Scenario | Behaviour |
|---|---|
| **Empty file** (headers only) | 0 accepted, 0 held, nothing written, report says "no data rows found"; an audit row is still written, because an attempted import is an event |
| **500 buildings** | one RPC call, one transaction, contiguous codes `B0001…B0500`; report paginates; a partial failure rolls the whole file back rather than leaving half a list |
| **Mixed coordinate formats** | each row parsed independently; DMS and decimal in the same file both normalise; originals preserved per row |
| **Arabic-only names** | **Decision 1 below** — this is the one scenario the current constraints do not cleanly answer |
| **Headers reordered** | imports correctly; a test asserts it with a deliberately shuffled file |
| **Re-import of the same file** | every row matches an existing building ⇒ all held with "already in this project", **zero written**; the owner chooses skip or merge from the report |

---

## 6. Proof obligations before this is called done

1. **Validations survive.** Regenerate the template, reopen it with ExcelJS
   **and** unzip the archive and assert `<dataValidation>` elements exist in
   the sheet XML — two independent methods, because a single tool that drops
   validations would also report them as fine (the Constraints #7 cross-check
   lesson).
2. **Deterministic.** Two generations from identical inputs produce identical
   bytes.
3. **Not committed.** The generated file never enters the tree; the Constraints
   #8 gate (`tests/unreadableList.test.mjs`) enforces this automatically.
4. **One write path.** A test asserts the modal and the importer both reach
   `import_buildings`, and that a row created each way is field-for-field
   identical apart from `source`.
5. **The scenario set above**, each as a test with a real fixture workbook
   generated at test time, not committed.

---

## 7. Decisions needed before Opus builds

**Decision 1 — Arabic building names.** The owner wants the name preserved
**as supplied, including Arabic**. Constraints #1 forbids Arabic in the
database, with a sanctioned exception for `buildings.name_ar` only. An
Arabic-only ESCO list therefore has nowhere legitimate to put the name that the
UI shows. Three options:

- **(a)** Amend Constraints #1 so `buildings.name` may hold the supplied name in
  any script. Simplest and matches "as supplied"; the name is client data, not
  a UI string. **Recommended.**
- **(b)** Require a Latin name: rows with only an Arabic name are *held* until
  one is supplied. Faithful to the constraint, but it refuses the exact file
  TARSHID hands over.
- **(c)** Put the Arabic in `name_ar` and auto-transliterate into `name`. Invents
  data; rejected.

**Decision 2 — ownership types.** `building_type` exists and is unused (0 of 2
rows). What are the allowed values? A starting list is needed to seed the
lookup — e.g. Government, Ministry-owned, Rented, Private, Mixed. The owner's
list becomes the seed; clients can extend it afterwards without us.

**Decision 3 — site engineer.** The template carries a typed name, but the app
assigns engineers by `assigned_engineer_id`. Proposal: store the typed name in
`engineer_name` always; **additionally** set `assigned_engineer_id` when the
name matches exactly one active `proje` profile. Ambiguous or unmatched ⇒ name
kept, assignment left empty, row **accepted** with a note — never held, because
the ESCO's name is still the truth they supplied.

**Decision 4 — the existing committed template.**
`public/templates/IES-Project-Template-v3.xlsx` is a build output committed
beside its own generator. This sprint replaces the building half of it. Confirm
it should be deleted and generated into `dist/` at build time as part of this
work.
