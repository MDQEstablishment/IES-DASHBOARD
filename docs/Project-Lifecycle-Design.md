# Project lifecycle — design study

**Status: DESIGN ONLY — awaiting owner approval. Nothing in this document is built,
migrated, or deleted.** Every proposal here is a proposal; the purge in §G is
designed, not run.

Owner's goal, verbatim: *"the system to be clear and simple of adding a project,
integrated with all dashboard features"* — and the diagnosis that goes with it:
the template's **content is right**, the **process is wrong**. Data is entered
more than once and stages do not feed each other. This study therefore proposes
**zero new fields and zero new modules**. It proposes sequencing, inheritance,
and deletion of redundancy, using machinery that in most cases already exists.

Evidence base: the live database (project `mzuyvajefqkmaxludijm`) queried
read-only on 2026-08-03, plus a file-level trace of every write path in `src/`
and `supabase/migrations/`. File:line references are to the repo at commit
`8536d36`.

---

## 0. Headline findings

1. **The lifecycle state machine already exists and is never called.**
   `projects.phase` (`survey → saving_sheet → monitoring → closeout`),
   `advance_project_phase()` (0092:305), `freeze_project_scope()` (0092:213),
   `unfreeze_project_scope()` (0092:247) and the commitment auto-unfreeze
   trigger are all live in the database — and **no code in `src/` calls any of
   them**. `scope_frozen_at` is NULL on every project. The process the owner
   wants was half-built at the schema layer and never wired to a single button.

2. **There is no survey → scope converter.** Nothing writes
   `building_item_scope` from `survey_entries`. A surveyor's work feeds the
   (parked) Saving Sheet and nothing else. Surveying is therefore *extra* work,
   not *upstream* work — which is exactly why it was bypassed: 815 buildings,
   2 survey entries, both `source='manual'`.

3. **The real creation path is the Excel bundle import**, not the form and not
   the survey. 796 of 815 buildings belong to the two DIP imports
   (PROJECT-A-DIP-709: 709, PROJECT-A-DIP-50: 50, MHRSD-K: 37); 404 of 410
   deliveries and 212 of 298 scope rows belong to PROJECT-A-DIP-50. The design
   in §C treats import as a first-class front door, not a workaround.

4. **The COC does not consume execution.** COC PDFs are generated from
   `project_installed_items` / `project_removed_items` — lists typed by hand in
   the Items & Replacements tab — not from `install_log`, not from
   `building_item_scope` (integration map, §E). The certificate that closes the
   project is disconnected from the record of what was installed.

5. **Building status is a promise, not a fact.** Migration 0002 comments that
   building status is "auto-derived from install progress" when
   `status_override` is NULL — no such derivation exists anywhere. Every reader
   falls back to the literal `'pending'`. Meanwhile `delivery_status` /
   `approval_status` on buildings are written by **no code path at all** (seed
   only).

6. **Two permission layers disagree.** The UI offers project create to
   `admin/ceo/pmo` and edit to `admin/pmo/projm/progm`; the RLS policies
   (`projects_ins`/`projects_upd`, 0018:22-23) allow **pmo only**. Everyone
   except pmo gets a silent zero-row no-op on edit (surfaced only in the status
   modal). Any spine design has to pick one truth here (§C, open question Q7).

---

## A. The current process, mapped honestly

Five write paths exist. Only three create a `projects` row; only four create
`buildings` rows. Screen names are as the user sees them.

### A.1 — "Add Project" (manual form)

**Screens:** *Projects* page → **Add Project** button (`Projects.jsx:99`) →
modal **"Add project"** → **Create project** (`ProjectModals.jsx:130,134`).
UI-gated to admin/ceo/pmo (`Projects.jsx:51`); DB accepts pmo only (0018:22).

**Writes** `projects`: code*, name*, status, client, region,
project_reference_no, beneficiary_entity, coc_layout, start/end dates,
total_weeks, contract_sign_date, works_end_date, pm_id, engineer_id,
contractor_name/phone/email, the TARSHID block (entity_name_ar, entity_poc_×4,
tarshid_poc_×4), location_address/lat/lng (`ProjectModals.jsx:63-77`).

**Optionally writes**, inline: `buildings` rows (code, name, lat, lng,
contractor name/phone — building region is silently inherited; the draft object
has a `region` key but no input renders, `ProjectModals.jsx:267`), and the
Items & Replacements block → `project_installed_items` /
`project_removed_items` / `project_item_pairs` (`ProjectModals.jsx:118-120`).

**Leaves empty:** `pm_name`/`engineer_name` (Excel-only), `doc_rev` (defaults
'00'), `energy_services_company` (defaults 'Tarshid'), `subcontractor`,
`photo_url` (edit-mode only), `phase` (defaults 'survey'), everything
freeze/status-attribution related. **Writes nothing** to `project_esms` or
`building_item_scope` — a manually created project has zero ESMs and zero
scope, so progress reads 0/0 and Manage ESMs shows Empty
(`ProjectDetail.jsx:537`).

**Re-entered later elsewhere:** ESMs (no UI creates `project_esms` at all —
import-only), scope quantities (only *editable* on existing rows,
`BuildingDetail.jsx:213` — no UI insert exists despite the Add-building modal
promising *"Planned scopes … can be added afterwards from the building's detail
page"*, `BuildingModals.jsx:86`), contractor per building, engineer per
building.

**Failure semantics worth knowing:** the project row commits first; a failed
inline-building insert only toasts "add them again from the project page"
(`ProjectModals.jsx:110`).

### A.2 — "Import Excel" (project bundle) — **the real path**

**Screens:** *Projects* page → **Import Excel** (`Projects.jsx:98`) → modal
**"Import a project from Excel"** → *Download template (.xlsx)* → *Choose Excel
file* → **Confirm import** (`ProjectModals.jsx:607-619`). Atomic RPC
`import_project_bundle` (live version v4, `0060_import_bundle_v4.sql`).

**Reads** a 6-sheet workbook (`Project`, `Buildings`, `Building Scopes`,
`Materials`, `Items`, `Instructions`), template generated by
`scripts/generate-project-template.js` → `IES-Project-Template-v3.xlsx`.

**Writes:** `projects` (26 columns incl. pm_name/engineer_name denormalised
from profiles), `buildings` (24 columns incl. the importable-only set:
name_ar, city, building_type, elec_meter/subscription/account numbers,
responsible person, operating_hours scalar), `materials` (catalog rows + silent
stubs named after unknown codes, 0060:144-147), `project_esms`
(auto-provisioned per ESM seen in Scopes), `building_item_scope`,
`project_removed_items` / `project_installed_items` / `project_item_pairs`.

**Leaves empty:** the entire TARSHID block — `entity_name_ar`, `entity_poc_*`,
`tarshid_poc_*` have **no template column**, yet ten of them are the exact
hard-required fields of the Saving Sheet's `readiness()` check
(`savingSheet.js:419-421`). Project cover photo, `is_residential`, per-ESM
bundle keys, `operating_hours` table rows. The Project sheet's `remarks` column
is parsed and then silently dropped — `projects` has no remarks column.

**Identity mapping quirks:** pm/engineer resolved by email, unresolved = silent
NULL; building contractor falls back to the project contractor (**the only path
with that fallback**); the sheet's `city` is written into both
`buildings.region` and `buildings.city` (0060:98,106). No equipment-catalog
matching happens here at all — scope `material_code` is a free string.

**Re-entered later elsewhere:** everything in "leaves empty" — a human opens
Edit project and types the TARSHID block by hand; hours are re-captured in the
Operating Hours tab; unlisted equipment identity is re-typed at survey.

### A.3 — "Import from workbook" (Settings) — **not a project path**

**Screens:** *Settings* → **Approved Equipment** tab → **Import from workbook**
(`EquipmentCatalogs.jsx:395`, `TarshidImportModal.jsx:118`). This is the
TARSHID *reference data* importer: it upserts `old_model_registry` and
`approved_baseline_units`, and updates costs on `ac_catalog` /
`lighting_catalog`. It never creates projects or buildings and never deletes.
Named here because "TARSHID import" in conversation can mean either this or
A.2; they are different screens with different scopes.

### A.4 — "Add building" (one at a time)

**Screens:** *Project Detail* → **Add building** (`ProjectDetail.jsx:213`) →
modal **"Add building"** (`BuildingModals.jsx:52`).

**Writes** `buildings`: code*, name*, region (pre-seeded from project),
contractor name → **both** `contractor` and `contractor_name`
(`BuildingModals.jsx:36` — dual write documented in-source), contractor_phone,
assigned_engineer_id **plus** denormalised `engineer_name`, lat/lng, floors,
area_sqm, remarks, is_residential, hard-coded `status_override:'pending'`.

**Can never set** (no editor exists anywhere in the app): `name_ar`, `city`,
`gps`, `building_type`, `elec_*` ×3, `responsible_person_*`,
`operating_hours` scalar, `delivery_*`, `approval_*`, `scope_*`. These are
importable-only: set once by Excel, never correctable in the UI.

### A.5 — Seed (migration `0024_business_seed.sql`)

Two demo projects, four buildings, plus rooms/scope/install/tasks/escalations.
Fills only the *legacy* columns (`contractor`, `engineer_name` — not
`contractor_name`/`assigned_engineer_id`). The files in `seed/`
(`moi-asir-buildings.csv`, `tds-*.csv`) are referenced by **no code** — inert
fixtures.

### A.6 — What the row counts say the process actually is

| Table | Rows | Interpretation |
|---|---|---|
| buildings | 815 | 796 from three Excel imports |
| building_item_scope | 298 | 212 on PROJECT-A-DIP-50 — imported |
| material_deliveries | 410 | 404 on PROJECT-A-DIP-50 |
| install_log | 25 | execution barely recorded |
| survey_entries | **2** | both `source='manual'` |
| operating_hours | 2 | synced from those 2 entries |
| rooms | 9 | seed + backfill |

The intended sequence (create → survey → scope → execute) is not the sequence
anyone follows. The lived sequence is: **import a finished scope, then record
deliveries against it**. Survey was skipped not out of laziness but because it
is *structurally pointless today*: it feeds nothing that the import didn't
already fill (finding 2). A redesign that "mandates the survey" without making
survey *produce* something would be bypassed again — so §C does not mandate it;
it makes it the scope-producing stage for projects that don't arrive with a
scope, and an optional verification stage for those that do.

---

## B. The redundancy register

Legend — **Lock**: 🔒 = read by a frozen `src/lib` generator (sha256 manifest,
§F.1); a locked column cannot be dropped, only quarantined (stop writing,
keep serving). **Typing**: effect of the elimination on how many times a human
types the fact.

| # | Fact | Stored in | Source of truth | Elimination | Lock | Typing |
|---|---|---|---|---|---|---|
| R1 | Project PM | `projects.pm_id` + `projects.pm_name` | `pm_id` → profiles | **Drop** `pm_name`; display joins profiles. Readers are unfrozen only (`Projects.jsx:168`, `ProjectDetail.jsx:235`, `ProjectModals.jsx:559`); template keeps `pm_email` and drops `pm_name` column | — | 2→1 (email only) |
| R2 | Project engineer | `projects.engineer_id` + `projects.engineer_name` | `engineer_id` | **Drop** `engineer_name`; same as R1 | — | 2→1 |
| R3 | Building engineer | `buildings.assigned_engineer_id` + `buildings.engineer_name` | `assigned_engineer_id` | **Drop** `engineer_name`; display joins profiles. Readers unfrozen (`ProjectDetail.jsx:90`, `BuildingDetail.jsx:107`, `BuildingModals.jsx:38`) | — | already 1 (derived); drop kills the stale copy |
| R4 | Building contractor | `buildings.contractor` **and** `buildings.contractor_name` (+ phone) | `contractor_name`/`contractor_phone` | **Drop** legacy `contractor` after read-side coalesce is removed (`BuildingDetail.jsx:108`, `BuildingsMap.jsx:61`, seed is the only writer that fills it alone) | — | 2 writes→1 write per save (today the same keystroke is stored twice) |
| R5 | Contractor: project vs building | `projects.contractor_name/phone/email` + per-building copies | Project = default, building = exception override | **Inherit at read**: blank building contractor renders the project's, labelled "(project)". Stop pre-copying in forms. The import already has this fallback (0060:101-103); make the UI honest about it. Keep both column sets — `projects.contractor_name` is 🔒 (`inspectionDocs.js:26`, `progressReport.js:286`) | 🔒 (project level) | N buildings×2 fields → 0 for the common case |
| R6 | Client identity | `projects.client` + `beneficiary_entity` + `entity_name_ar` | `client` (commercial), `beneficiary_entity` (official English), `entity_name_ar` (official Arabic) — three *renderings*, not one fact | **Keep all three columns** (all 🔒: `cocPdf.js:222`, `inspectionDocs.js:25`, `progressReport.js:284`, `savingSheetGen.js:28-29`, `search.js:136`). Fix the *capture*: `beneficiary_entity` blank ⇒ **write** `client` into it (the form placeholder already claims "Defaults to Client" and lies — `ProjectModals.jsx:71` writes null) | 🔒 | 3→1 typical, 3 only when they genuinely differ |
| R7 | Party fields | `energy_services_company`, `subcontractor`, `contractor_name` | one block, three distinct parties | **No relational rework.** All three are 🔒 (`progressReport.js:286`, `cocPdf.js:220`, `savingSheetGen.js:27`). ESC already defaults 'Tarshid'. Present as one "Parties" form section; no schema change | 🔒 | unchanged (each typed once) |
| R8 | POC contacts | `entity_poc_*` ×4 + `tarshid_poc_*` ×4 flat on `projects` | the eight columns, as-is | **Keep flat.** A `project_contacts` relation is cleaner and **fails the owner's test**: `savingSheetGen.js:32-39` and `savingSheet.js:419-421` index these exact column names off the raw row (🔒), so normalising costs a compat view + frozen-file risk and saves zero keystrokes. Instead: **add the 10 columns to the import template** so they arrive with the bundle instead of being typed post-import (open question Q2 — template change, not schema change) | 🔒 | 10 typed post-import → 0 when the bundle carries them |
| R9 | Building coordinate | `buildings.gps` + `location_lat` + `location_lng` | `location_lat/lng` | **Drop `gps`.** No writer populates it anywhere in the codebase; three readers prefer it (`BuildingDetail.jsx:106,255`, 🔒 `savingSheetGen.js:89` — as a *fallback* only, so its absence degrades to the lat/lng branch). Proof required in §F that dropped-column reads through `select('*')` are null-safe at all three sites | (🔒 fallback only) | 0 (nobody could type it anyway) |
| R10 | Project coordinate | `projects.location_address/lat/lng` vs its buildings' coordinates | both, deliberately | **Keep.** Project lat/lng are 🔒-required by the Saving Sheet (`savingSheet.js:421`) and mean "the entity's site", not a building. Document precedence: maps use buildings; the project pin is cover-sheet data | 🔒 | unchanged (typed once) |
| R11 | Operating hours | `buildings.operating_hours` (int, Excel-only) **and** `operating_hours` table | the **table** (it alone feeds `v_operating_hours` → saving sheet) | Rename the scalar's *label* to what it is — "contract hours/yr (from tender)" — read-only import metadata (`BuildingDetail.jsx:135` is its only reader; no frozen reader). Or drop it (owner question Q3). Never present the two as the same thing again | — | table rows already never typed (synced from survey, `0094:106`); scalar 0 (import-only) |
| R12 | Survey room identity | `survey_entries.floor/room_name/room_type/room_width/height/area` + `room_id` FK | `rooms` for identity; entry keeps raw door text (0098:8-10, deliberate) | Linking is already zero-double-work (BEFORE trigger resolves/creates the room, client never sends room_id). Remaining waste is **dimensions re-typed per entry for the same room**: fix in the form — after room resolution, prefill room_type/width/height/area from the latest sibling entry of that room (client-side inherit; no schema change). `rooms` stays name+floor | — | ~4 fields × entries-per-room → typed once per room |
| R13 | Survey equipment identity | free text `category…inverter` (9 cols) **and** `registry_id`/`catalog_item_id` + match metadata | registry/catalog match; free text = exception | **Catalog-first is already half-built for AC**: picking an `old_model_registry` row populates equipment/make/model/size/tr read-only (`EntryForm.jsx:231-253`) and the nameplate-photo gate covers the no-match path. **Extend the same pattern to lighting** (search `lighting_catalog`/registry, matched ⇒ fields read-only; unmatched ⇒ free text + photo). No new columns — flow only | — | matched entry: ~7 typed fields → 1 pick + qty |
| R14 | Region/city | `projects.region` → `buildings.region` + `buildings.city` | project.region as default; building.city as the local fact | Import writes the same string to both building columns (0060:98,106); form writes only `region` pre-seeded from project. Pick **`city`** as the building-level field, keep `region` inherited-on-read from the project. Migration backfills `city` from `region` where null; `buildings.region` becomes a candidate for later drop (kept this round: 🔒-adjacent via `cocPdf.js:224` reading `single?.region`) | 🔒 (fallback chain) | building region typed 0 times |
| R15 | Project status ×2 attribution sets | `projects.status` + `status_changed_*`/reason + `project_status_history` | `project_status_history` is the log; columns are the cursor | **Keep** — this is one machine, not two: the trigger (0030:29) writes history from the columns. No change | — | — |
| R16 | Lifecycle stage | `projects.phase` + `scope_frozen_at/by` vs `buildings.scope_status/…` vs `buildings.status_override` vs `delivery_status`/`approval_status` | see §C: `phase` = project stage; `scope_status` = building membership; building *work* status = **derived** | (a) Wire `advance_project_phase` + freeze RPCs to the UI (they exist, uncalled). (b) Implement the derivation 0002 promised: building work status computed from `install_log`÷`building_item_scope` (Dashboard already computes exactly this at `Dashboard.jsx:57-58`), `status_override` kept for exceptions only (archived/blocked/on_hold). (c) `delivery_status`/`approval_status`/`delivery_date`/`approval_date`: **written by nothing since seed** — drop, or repurpose deliberately (owner question Q4) | — | status typed only on exception |
| R17 | Planned items ×3 shapes | `building_item_scope` (planned) vs `project_installed_items`/`removed`/`pairs` (COC lists, hand-typed) vs `install_log` (events) | scope = plan; install_log = fact; COC lists = **derived output** | COC lists cannot be dropped (🔒 `cocPdf.js` context reads them) and carry TARSHID-shaped descriptions. Eliminate the *retyping*: a "Build from scope / install" action that drafts `project_installed_items`/`removed` rows from `building_item_scope` + `install_log` + catalog descriptions, editable before save. Populate-into, never read-from — frozen generators untouched | 🔒 (as sink) | item lists: typed twice → reviewed once |
| R18 | Template self-echo | `project_code` on every Buildings row; `total_weeks` alongside start/end dates; Project `remarks` parsed-then-dropped | — | Template v4: drop the per-row `project_code` (validator already demands equality — derive it), derive `total_weeks` when blank from the dates, remove the `remarks` column or land it in a real column (it currently vanishes silently) | — | −(N buildings) + −1 |
| R19 | COC bundling ×2 shapes | template `coc_bundle_key` (ESM1+ESM2 only, 0060:140) vs per-ESM "ESM BUNDLES" editor (edit-mode modal) | `project_esms.coc_bundle_key` | One rule: the template column sets keys; the editor edits the same keys. Document that the template shorthand only pairs ESM1+ESM2; anything else is editor work. No schema change | — | unchanged |
| R20 | Engineer identified 3 ways in one workbook | project `engineer_email`, per-building `assigned_engineer_email`, plus display `engineer_name` columns | emails → profiles | Template v4 drops both `*_name` columns (R1/R2); per-building email stays as the exception override (falls back to project engineer already, 0060:85-86) | — | 3 → 1–2 |

**Cross-cutting rule** that makes R1–R5 and R14 safe: *denormalised display
names leave the write path first, the read path second, and the schema last* —
three separately provable steps (§F.3).

---

## C. The target process — the spine

One state machine, three levels, each owning exactly one question:

- **`projects.status`** — commercial state: does this engagement exist?
  (`draft / active / on_hold / closed`, + soft-delete). Unchanged.
- **`projects.phase`** — process stage: what is the *next* kind of work?
  (`survey → saving_sheet → monitoring → closeout`, existing enum; renamed in
  UI copy only: Setup → Survey → Commitment → Execution → Closeout is a
  *label* question, the enum stays — see Q5).
- **`buildings.scope_status`** — membership: is this building in the deal?
  (`candidate / in_scope / surplus`). Building *work* status becomes derived
  (R16); `status_override` remains only for exceptions.

```
                        ┌──────────────────────────────────────────────────────────────┐
                        │  S0 CREATE ──► S1 BUILDINGS ──► S2 SURVEY ──► S3 SCOPE FREEZE │
                        │      │              │              │               │          │
  Excel bundle ─────────┼──────┴──────────────┴───(skip)─────┘               │          │
  (arrives with scope)  │                                                    ▼          │
                        │  S6 CLOSEOUT ◄── S5 DOCS & COC ◄── S4 EXECUTION ◄──┘          │
                        └──────────────────────────────────────────────────────────────┘

  S0 CREATE      S1 BUILDINGS      S2 SURVEY          S3 SCOPE          S4 EXECUTION        S5 DOCS & COC     S6 CLOSEOUT
  projects row   buildings rows    survey_entries     building_item_    material_deliveries project_documents status=closed
  project_esms   (import|form)     rooms (auto)       scope (from S2    material_movements  cocs (items       phase=closeout
  (import|UI)    inherit: region,  operating_hours    or import)        install_log         drafted from      COC sent
                 contractor,       (auto-sync)        freeze_project_   (against scope)     S3+S4, R17)
                 engineer          registry/catalog   scope()           derived bldg status
                                   match (R13)        phase advance
```

### The stages

**S0 — Create** *(one screen, two doors: form or Excel bundle)*
- **Entry:** a won or tendered engagement.
- **Who:** `pmo` (align UI gate with RLS or widen RLS — Q7; today the UI lies
  to admin/ceo).
- **Captured once:** identity (code, name), parties (client → auto-copies to
  beneficiary unless overridden, R6; contractor; ESC defaults Tarshid), dates
  (weeks derived, R18), people as ids (R1/R2), TARSHID block **including in the
  bundle** (R8/Q2), location.
- **Inherited:** nothing (first stage).
- **Unlocks:** S1; `project_esms` provisioning (import auto-provisions; the
  form path gets the same provisioning from a picker of existing `esms` — the
  three ESMs exist as reference rows; no UI exists today to attach them, which
  is a flow gap, not a feature gap).
- **Exit:** project exists with ≥1 ESM. `status=draft`, `phase=survey`.
- **Skippable:** no.

**S1 — Buildings** *(bundle sheet, or Add building)*
- **Entry:** S0 complete.
- **Who:** `pmo`, `projm` (matches `w_proj`).
- **Captured once:** code, name(+name_ar), city, lat/lng, physical facts.
- **Inherited, never re-typed:** region (project), contractor (project default,
  override per building only when it differs — R5), engineer (project engineer
  default, per-building override — already the import's rule, 0060:85-86).
- **Unlocks:** S2 (survey needs buildings), S3 (import path arrives here with
  scope already attached).
- **Exit:** ≥1 non-archived building. Buildings enter as `scope_status =
  candidate` (greenfield) or `in_scope` (imported with quantities — the 0092
  backfill precedent).
- **Skippable:** no (a project with no buildings is S0 only).

**S2 — Survey** *(Survey tab; catalog-first per R13)*
- **Entry:** `phase=survey` and buildings exist.
- **Who:** `proje`, `projm` (client list also shows `progm`, but RLS `w_bld`
  blocks progm writes — align, Q7).
- **Captured once:** per room×unit: pick registry/catalog match (fields
  auto-fill, read-only) **or** free text + nameplate photo (existing gate);
  qty; age. Room dims typed once per room (R12).
- **Inherited:** building identity; room identity auto-resolved (0098 trigger);
  hours rows auto-synced (`sync_operating_hours`) then completed (start/end/
  days/weeks/EFLH), not created.
- **Unlocks:** rooms; operating hours; **scope draft** (below); saving-sheet
  readiness.
- **Exit:** surveyed buildings have entries; owner-facing signal is the
  existing `has_entries` flag per building.
- **Skippable: yes — this is the TARSHID-import case.** Consequence, stated
  honestly: scope comes from the tender sheet, not from measurement; savings
  math (`v_project_savings`) stays empty because it hangs off survey matches;
  rooms/hours don't exist until (if ever) a verification survey happens. The
  system must not nag: when scope arrived by import, the Survey tab shows
  "scope imported — survey optional (verification)".

**S3 — Scope & freeze** *(Project Detail; the missing converter + existing RPCs)*
- **Entry:** scope rows exist (import), or survey entries exist (greenfield).
- **Who:** `pmo` (freeze RPC guard is pmo/admin already).
- **Captured once:** nothing new. Greenfield: **"Build scope from survey"** —
  the one genuinely new mechanism this design asks for — aggregates
  `survey_entries` (via their catalog/registry matches → material mapping) into
  `building_item_scope` rows at the existing grain, editable before commit.
  Import: scope is already there; this stage is review.
- **Inherited:** everything — the stage only transforms S2 output.
- **Unlocks:** S4 (deliveries and install log key on scope), commitment
  tracking, the freeze.
- **Exit:** `freeze_project_scope()` called from a real button; candidates
  with survey → `in_scope`, rest → `surplus` (existing semantics);
  `advance_project_phase` moves `survey → saving_sheet` (or with an override
  reason, the import path may advance without a freeze — the override
  parameter already exists for exactly this).
- **Skippable:** the freeze may be deferred (phase-advance override), but then
  the project shows "scope not frozen" until it is. Skipping the *stage*
  entirely is not possible — S4 writes require scope rows.

**S4 — Execution** *(Deliveries, Daily Progress, Install log)*
- **Entry:** frozen (or override-advanced) scope; `phase=monitoring`.
- **Who:** `procm`/`proco` (deliveries, movements), `proje` (install), per
  existing gates.
- **Captured once:** delivery events; install events (qty per scope line,
  photos).
- **Inherited:** planned quantities (scope), building/material identity;
  building *status derived* from install÷scope (R16) — nobody types "in
  progress" anymore.
- **Unlocks:** progress reports, COC item drafting (S5), partial-handover
  signals.
- **Exit:** per building: installed ≥ planned on in-scope lines (the derived
  status turns "complete"); per project: all in-scope buildings complete or
  explicitly overridden.
- **Skippable:** no; but per-building it completes independently (scenario 6).

**S5 — Documents & COC**
- **Entry:** buildings complete (or the partial-handover subset is).
- **Who:** `projm`/`pmo` (existing doc/COC role arrays).
- **Captured once:** review outcomes, signatures, dates. COC item lists are
  **drafted from S3+S4** (R17) and reviewed — not typed.
- **Inherited:** buildings covered, ESM bundles (`project_esms.coc_bundle_key`),
  reference numbers, parties — all from S0–S4.
- **Unlocks:** handover; `status_override='signed'` becomes a *derived* mark
  when a COC covering the building is sent (today no path sets it).
- **Exit:** COCs sent for all covered buildings.
- **Skippable:** per-building no; per-project it proceeds in waves (partial
  handover is the COC module's existing covered-buildings model).

**S6 — Closeout**
- **Entry:** S5 complete for all in-scope buildings (or project cancelled).
- **Who:** `pmo`.
- **Exit:** `status=closed`, `phase=closeout`, reason logged (existing status
  machinery, R15).

### Who may do what (mapped to real roles)

| Stage | ceo | pmo | progm | projm | proje | procm | proco | plane | admin |
|---|---|---|---|---|---|---|---|---|---|
| S0 create | view | **do** | view | view | view | view | view | view | Q7 |
| S1 buildings | view | **do** | view | **do** (own project) | view | view | view | view | Q7 |
| S2 survey | view | do | view* | **do** | **do** (assigned) | — | — | view | do |
| S3 scope build/freeze | view | **do** | view | propose | view | — | — | view | do |
| S4 deliveries | view | do | do | do | do | **do** | **do** | view | do |
| S4 install | view | do | do | do | **do** | — | — | view | — |
| S5 docs/COC | view | **do** | do | **do** | do | — | — | view | do |
| S6 closeout | view | **do** | view | view | view | view | view | view | do |

\* client gate includes progm today, RLS does not — Q7 resolves each row of
this table against RLS as the single truth.

`plane` holds no write gate anywhere today (constants + 0086 confirm); this
design keeps planning read-everything and changes nothing for it.

---

## D. Scenarios

**D1 — Full greenfield.** S0 form → S1 form (inherits contractor/engineer/
region) → S2 catalog-first survey (rooms+hours auto) → S3 "Build scope from
survey", review, freeze, advance → S4 → S5 (COC drafted from scope+install) →
S6. Every fact typed exactly once. Stages skipped: none. The system must not
demand: Excel anything, re-typed room dims, re-typed COC item lists.

**D2 — TARSHID import (the 815-building path).** S0+S1+S3-scope arrive in one
bundle — including the TARSHID/POC block if Q2 lands. S2 skipped (modelled:
buildings enter `in_scope`, Survey tab shows "optional verification", savings
views stay empty and say why). S3 is review + freeze via override-advance
(reason: "scope fixed by DIP"). S4–S6 as normal. The system must not demand: a
survey entry per imported building, hours rows (Saving Sheet is parked; if it
un-parks, hours become the *one* thing a verification survey must add), manual
`project_esms` setup (auto-provisioned).

**D3 — Single building / small job.** S0 form with the inline building block
(exists today) → survey that one building (or type the 3-line scope directly:
the scope editor gains insert for exactly this case — today only *edit*
exists, A.1) → freeze → execute → single COC. The full ceremony collapses to:
one form, one survey visit or one 3-line scope, one freeze click. The system
must not demand: Excel, bundle keys, ESM provisioning beyond one pick, a
saving-sheet readiness block.

**D4 — Multi-ESM project (lighting + AC + controls on different timelines).**
Already structurally supported: `project_esms` ordinal rows; scope rows carry
`project_esm_id`; deliveries/install are per material→ESM; COC bundling per
`coc_bundle_key` (R19). The spine adds: phase is *project-level*, so ESMs do
not get separate phases — the freeze covers all ESMs at once. If ESM timelines
truly diverge (AC frozen while lighting still surveying), the freeze is
per-project and would force the laggard: **flagged, not solved** — solving it
per-ESM adds state the owner hasn't asked for (Q6).

**D5 — Scope change after freeze.** Today: editing `building_item_scope` after
freeze is completely ungated (0018:34-35 unchanged; the freeze gates only
phase-advance). Target: quantity edits on a frozen project require the existing
commitment mechanism — raise a `commitment_revisions` row; the existing
auto-unfreeze trigger (0092:275) reopens auto-surplus buildings and clears the
freeze; scope is edited; re-freeze. Who: pmo (existing guards). What
re-verifies: the freeze re-run re-partitions candidates; downstream deliveries
already made against removed lines surface in the existing over-delivery
readings (deliveries are per material, not per scope line — nothing breaks, the
plan/actual comparison just moves). What breaks without this: silent plan drift
under a frozen banner — the current live behaviour.

**D6 — Partial handover.** Per-building completion is derived (R16), COCs
already cover subsets (`coc_covered_buildings`), documents are per-building.
The spine needs no new state: a project sits in S4 and S5 simultaneously by
building. The system must not demand: project-level phase flips per wave, or
"complete" typed by hand.

**D7 — Cancelled / paused mid-execution.** `status=on_hold` or `closed` with
required reason (existing modal + history). Rules the spine adds: `on_hold`
freezes phase where it stands (no data change); `closed` before S6 requires the
reason and leaves everything queryable — deliveries, install, docs stay as the
factual record; no deletion. Un-pause = status back to active, phase untouched.
Reversal is trivial because pause never mutates stage data.

---

## E. Integration map

**Consumes** = reads another stage's output. **Produces** = writes something a
later stage reads. Silo = consumes nothing from earlier stages.

| Module | Consumes | Produces | Verdict |
|---|---|---|---|
| Buildings (detail/map/photos/chat) | scope, install, rooms, survey counts, audit | rooms (backfill), scope qty edits, photos | **integrated** — the hub |
| Survey (tab, entry form, OH) | buildings, rooms, registry/catalogs | survey_entries, rooms (via trigger), operating_hours (via sync) | integrated upstream, **dead-ends downstream** (nothing consumes it but the parked Saving Sheet) → §C S3 gives it a consumer |
| Operating Hours | survey_entries (sync), buildings | operating_hours → v_operating_hours | consumer = Saving Sheet only (parked) |
| Materials & Deliveries | projects, materials; scope only via `building_material_plan` view; **never survey** | material_deliveries, movements, stock views | integrated with scope, blind to survey (correct once scope derives from survey) |
| Install log / Daily Progress | scope (keyed on scope_id), rooms, stock | install_log, building_photos | **integrated** — the model citizen |
| Documents | project fields, project_esms, buildings | project_documents, submission history | **silo** (consumes only reference fields; acceptable — it *is* paperwork) |
| COCs | coc settings, project_esms, buildings, **project_installed/removed_items (hand-typed)** | cocs, covered buildings, PDFs | **broken link**: consumes a hand-maintained copy of what S3/S4 already know (R17) |
| Reports (page + progress report) | scope, install, deliveries, docs, cocs, photos, tasks, escalations | XLSX artefacts | integrated (read-only) |
| Tasks | projects/buildings (labels only) | tasks, notifications | **silo by design** — coordination layer; fine |
| Escalations | projects/buildings (labels only) | escalations, notifications | **silo by design**; fine |
| Saving Sheet (parked) | survey_entries, v_operating_hours, unit selection, catalogs, registry | saving_sheets snapshots | the **only** survey consumer today; un-parking it is what makes S2's hours matter |
| Dashboard | projects, buildings, scope, install, escalations, tasks, docs view | KPIs | integrated (read-only); already computes the derived building progress R16 needs |

Named silos: **Documents, Tasks, Escalations** — all three consume only labels,
which is acceptable for coordination surfaces. The one *unacceptable* silo is
the **COC item list** (R17): the closing certificate should be the most
downstream artefact in the system and is currently fed by hand.

---

## F. Migration and risk

### F.1 The frozen surface (hard constraint)

All **19** modules in `src/lib` are under the sha256 manifest
(`docs/9J-acceptance.md:114`, regenerated by `scripts/ui-census.mjs --check`;
note the docs say "18" in places — the table and the directory both hold 19).
Enforcement is a manually-run gate, not CI — the constraint is discipline, not
tooling, which argues for *fewer* schema changes near generator inputs, not
more.

Columns that frozen files read off raw rows (cannot be dropped or renamed;
full list per file in §B locks): `client`, `beneficiary_entity`,
`contractor_name`, `subcontractor`, `energy_services_company`,
`entity_name_ar`, `entity_poc_*`, `tarshid_poc_*`, `project_reference_no`,
`doc_rev`, `region`, `building_type`, `projects.location_lat/lng`,
`buildings.location_lat/lng`, `buildings.gps` (fallback only),
plus `savingSheet.js`'s ten hard-required names.

Columns read by **no** frozen file (droppable with UI-only edits):
`projects.pm_name`, `projects.engineer_name`, `buildings.engineer_name`,
`buildings.contractor`, `buildings.operating_hours`,
`projects.contractor_phone/email`, `projects.location_address`,
`buildings.delivery_status/approval_status/delivery_date/approval_date`.

### F.2 Per-change risk table

| Change | Migration shape | What could break | Reversal |
|---|---|---|---|
| R1–R3 drop display names | 3 steps: (1) UI stops writing (unfrozen files only), (2) UI reads switch to profile joins, (3) `alter table … drop column` | Template v3 workbooks still carrying `pm_name` columns — importer must tolerate-and-ignore before the drop; RPC v5 replaces v4 | Steps 1–2 are pure code, revert by git; step 3 re-add column + backfill from profiles (values were derived, so lossless) |
| R4 drop `buildings.contractor` | same 3-step | seed 0024 references it (historical, not re-run); `BuildingsMap` popup coalesce | re-add + backfill from `contractor_name` (they are dual-written today — identical) |
| R5 inherit contractor at read | code-only (no migration) | none — display change; writes stop pre-copying | git revert |
| R6 beneficiary defaults to client | code-only write-time default | none (column stays) | git revert |
| R9 drop `buildings.gps` | verify zero non-null first (query), then drop | 🔒 `savingSheetGen.js:89` reads `b.gps` as fallback — after drop the property is undefined and the `||` takes lat/lng: **prove with the existing savings fixture before dropping**; feature is parked, which is the safest window | re-add column (it was all-null) |
| R11 scalar hours relabel/drop | label: code-only; drop: single column | only reader is one Meta row | re-add; values recoverable from import workbooks only — so prefer relabel until owner decides Q3 |
| R12 dims prefill | code-only (EntryForm) | none — prefill, still editable | git revert |
| R13 lighting catalog-first | code-only (EntryForm + picker reuse) | the `survey_entry_catalog_check` trigger already validates category↔catalog; no schema change | git revert |
| R16a wire phase/freeze buttons | code-only; RPCs exist | RLS: RPC guards are pmo/admin — buttons must hide for others or surface the refusal | git revert |
| R16b derived building status | code-only if computed client-side (Dashboard already does); a view if we want it server-side (additive) | `status_override` chip semantics change — screens asserted at card level 1366/1280 per Constraints | git revert / drop view |
| R16c drop delivery/approval cols | Q4 first; then 3-step drop | unknown owner intent — **stop-and-ask before touching** (Constraints §5 spirit: rules earned through failures) | re-add; data was seed-only |
| R17 COC draft-from-scope | code-only + possibly one RPC (additive) | must write *into* `project_installed_items` in exactly the shape `cocPdf.fetchCocContext` expects; byte-identical generators untouched | git revert; drafted rows are editable/deletable like typed ones |
| S3 survey→scope converter | one additive RPC (`build_scope_from_survey`) + UI | grain mismatch survey(unit) → scope(material_code×sub_type): mapping goes through catalog/registry match → materials; unmatched entries block conversion with a named list, not a guess | RPC is additive; generated rows carry a marker in `sub_type_spec` jsonb (existing column) so they are identifiable and deletable |
| Template v4 | new file + generator script change | v3 workbooks in the wild: importer accepts both for one cycle (version cell exists in template) | keep serving v3 |
| Q7 RLS alignment | additive policy migration (widen) **or** UI narrowing (code) | widening `projects_ins/upd` beyond pmo contradicts a policy that has been pmo-only since 0018 — possibly deliberate; **stop-and-ask** | policies are droppable/re-creatable |

### F.3 Proof obligations (each unit ships with its own)

1. `ui-census.mjs --check` green — 19/19 manifest hashes unchanged, every unit.
2. For each dropped column: a pre-drop query proving zero meaningful data lost
   (`gps` all-null; `pm_name` = join equivalent; `contractor` = `contractor_name`).
3. For R17/S3: generated rows byte-compare against a hand-typed control set on
   a fixture project.
4. Cards fit at 1366/1280 asserted at card level for every touched screen;
   Latin digits, local dates throughout.
5. Deploy-green means green on `main`; branch runs build-only on this repo.

---

## G. The reset — zero projects

**Designed here; not run. Runs only as its own migration, after this design is
approved, with the owner's explicit sign-off recorded. It is irreversible:
there is no undo, no soft-delete, no recycle bin. Once run, the demo content
is gone permanently. The owner must state acceptance of that in so many words
before execution.** (Constraints.md #5 — destructive ops need explicit owner
sign-off — applies in full.)

### G.1 Every table, exactly one list

58 tables exist in `public` (live enumeration, 2026-08-03). 40 are purged, 18
survive. No table is unclassified. Counts are the **expected before-counts**;
the migration asserts them and aborts loudly on mismatch (§G.4).

**DELETE — project/demo content (40 tables, 2,125 rows):**

| Table | Rows | Table | Rows |
|---|---|---|---|
| buildings | 815 | material_deliveries | 410 |
| building_item_scope | 298 | project_installed_items | 169 |
| project_removed_items | 129 | project_item_pairs | 102 |
| stock_ledger | 42 | project_documents | 29 |
| install_log | 25 | project_esms | 20 |
| building_chat_messages | 11 | projects | 9 |
| rooms | 9 | pdf_extraction_log | 8 |
| coc_esms | 7 | doc_submission_history | 7 |
| material_movements | 6 | coc_buildings | 5 |
| tasks | 5 | building_engineers | 4 |
| survey_entries | 2 | operating_hours | 2 |
| cocs | 2 | coc_covered_buildings | 2 |
| coc_project_settings | 2 | escalations | 2 |
| commitment_revisions | 1 | project_status_history | 1 |
| notifications | 1 | building_photos | 0 |
| photos | 0 | room_items | 0 |
| daily_progress_batch | 0 | daily_progress_line | 0 |
| coc_beneficiary_assignments | 0 | project_other_installed_items | 0 |
| project_unit_selection | 0 | project_control_links | 0 |
| replacement_choices | 0 | saving_sheets | 0 |

**KEEP — reference data (18 tables):**

| Table | Rows | Why kept |
|---|---|---|
| audit_log | 3,536* | **kept explicitly** — the history of who did what does not get erased with the demo content. *Grows during the purge itself (delete triggers audit); the after-count is asserted as ≥ before-count, not equal |
| lighting_catalog | 593 | catalog — expensive to rebuild |
| ac_catalog | 283 | catalog |
| materials | 56 | reference (includes import-minted stub rows named after scope codes, e.g. `ESMn-ITEM` — kept per the brief; listed for owner review, Q8) |
| material_categories | 34 | reference |
| ai_runs | 24 | usage telemetry, like audit_log; `project_id` FK is ON DELETE SET NULL so rows survive with the link nulled (Q9 if the owner prefers deletion) |
| misc_catalog | 16 | catalog |
| ai_settings | 9 | configuration |
| profiles | 9 | the team, incl. reporting tree (auth.users untouched) |
| category_hours_factors | 4 | TARSHID constants |
| tarshid_constants | 4 | TARSHID constants |
| esms | 3 | the three ESMs |
| report_templates | 1 | template |
| saving_sheet_templates | 1 | template |
| approved_baseline_units | 0 | reference (structure + future imports) |
| model_aliases | 0 | reference |
| old_model_registry | 0 | reference |
| murshid_feedback | 0 | product feedback, not project data |

### G.2 Ordering — explicit, not cascade

Cascade alone cannot do this: `buildings.project_id → projects` is **RESTRICT**;
`rooms.building_id` and `install_log.building_id` are **RESTRICT**;
`stock_ledger` (project & building), `daily_progress_batch` (building),
`pdf_extraction_log` (project) and `project_documents.delivery_id` are
**NO ACTION**. The migration deletes in explicit dependency order, one
statement per table, inside a single transaction — cascade is *not relied on*
even where it exists, so the per-table count assertions stay meaningful:

```
1  notifications                     (children of tasks/escalations/projects)
2  daily_progress_line               (→ batch, rooms, materials)
3  daily_progress_batch              (→ buildings NO ACTION)
4  photos                            (→ install_log, rooms, buildings)
5  install_log                       (→ buildings RESTRICT; → rooms SET NULL)
6  room_items                        (→ rooms)
7  survey_entries                    (→ rooms SET NULL, buildings, projects)
8  rooms                             (→ buildings RESTRICT)
9  doc_submission_history            (→ project_documents)
10 coc_buildings, coc_esms           (→ project_documents — legacy COC shape)
11 coc_covered_buildings             (→ cocs, buildings)
12 cocs                              (self-FKs root/superseded — single DELETE, NO ACTION checks at statement end)
13 coc_beneficiary_assignments, coc_project_settings
14 project_documents                 (→ material_deliveries NO ACTION — before deliveries)
15 material_movements, stock_ledger  (NO ACTION on buildings/projects)
16 material_deliveries
17 building_item_scope, building_engineers, building_chat_messages, building_photos
18 operating_hours
19 escalations, tasks                (self-FKs SET NULL; escalation→task SET NULL)
20 project_installed_items, project_removed_items, project_item_pairs,
   project_other_installed_items, project_unit_selection, project_control_links,
   replacement_choices, commitment_revisions, saving_sheets,
   project_status_history, pdf_extraction_log
21 buildings                         (RESTRICT satisfied by 5/8)
22 projects                          (RESTRICT satisfied by 21; ai_runs.project_id auto-nulls)
```

Note on triggers: audit triggers fire on these deletes (that is desired — the
purge itself is audited); the `install_log` immutability guard (0014) must be
checked for a DELETE branch before the script is written — if it blocks
deletes, the migration disables that trigger for the transaction and re-enables
it, stating so.

### G.3 Storage — SQL does not touch it

Live objects by bucket, 2026-08-03:

| Bucket | Files | Fate |
|---|---|---|
| project-docs | 28 | **delete** (orphaned by project_documents purge) |
| daily-progress-photos | 11 | **delete** (incl. `survey/<building_id>/…` photo paths) |
| delivery-notes | 8 | **delete** |
| project-photos | 3 | **delete** |
| coc-pdfs | 2 | **delete** |
| building-photos | 1 | **delete** |
| report-templates | 1 | **keep** (reference template) |
| saving-sheet-templates | 1 | **keep** |

53 files deleted via the storage API (a small script in the same change,
run immediately after the SQL, with its own before/after listing); the two
template buckets and the public `project-templates` bucket are untouched.
Any `coc-responses` objects found at run time are deleted with the rest.

### G.4 Verification — loud or nothing

- **Before:** assert the exact 40 before-counts above (and the 18 keep-counts);
  any mismatch aborts the transaction before a single delete.
- **After, same transaction:** every DELETE-list table = 0; every KEEP-list
  table unchanged (audit_log ≥ before).
- **Orphan sweep:** for every FK edge into the deleted set, assert zero
  referencing rows remain (notably: `ai_runs.project_id` IS NULL everywhere,
  no `notifications` survive, no `photos` reference anything).
- **Storage:** object count per content bucket = 0 after the script; template
  buckets unchanged.
- Published in the PR as a two-column before/after table, per table.

---

## H. Ordered implementation plan

Each unit is its own reviewable change with its own proof (§F.3 obligations
apply to all). Order matters: the purge goes first so every later unit is
proven against a clean board, and nothing later is entangled with demo rows.

| # | Unit | Contents | Proof |
|---|---|---|---|
| 1 | **The purge** | §G migration + storage script. Requires the owner's written "irreversible — accepted" | before/after count table; orphan sweep; census green |
| 2 | **Redundancy: stop writing** | Dual writes end: `contractor`+`contractor_name` single write; `pm_name`/`engineer_name` no longer written by import RPC v5 or forms; beneficiary defaults from client (R6); template v4 (R18/R20) | grep-proof: no writer references retired columns; import fixture round-trip |
| 3 | **Redundancy: stop reading** | UI reads switch to joins/coalesce (R1–R5, R14); building contractor/engineer render inherited values labelled "(project)" | screenshots at 1366/1280; census green |
| 4 | **Redundancy: drop** | `pm_name`, `projects.engineer_name`, `buildings.engineer_name`, `buildings.contractor`, `buildings.gps` (after all-null proof) | pre-drop equivalence queries; savings fixture for the gps fallback |
| 5 | **Flow: lifecycle wiring** | Phase stepper + freeze/unfreeze buttons calling the existing RPCs; derived building work status; `status_override` demoted to exceptions | RPC round-trip on fixture; Dashboard parity (its formula is the reference) |
| 6 | **Flow: survey → scope** | `build_scope_from_survey` RPC (additive) + review UI; scope-editor insert for D3; catalog-first lighting entry (R13); dims prefill (R12) | control-set comparison; unmatched-entry blocking list |
| 7 | **Flow: COC from execution** | Draft `project_installed_items`/`removed` from scope+install (R17) | byte-compare drafted vs hand-typed on fixture; cocPdf output unchanged |
| 8 | **Owner-gated items** | Q1–Q9 resolutions: RLS alignment (Q7), delivery/approval columns (Q4), scalar hours (Q3), template POC block (Q2) | per decision |

Units 2–4 are the same three-step ladder applied per column set — each step is
independently revertable and independently provable. Units 5–7 are almost
entirely code against machinery that already exists; the only new database
object in the whole plan is one additive RPC (unit 6) and, if chosen in Q4/R16,
one view.

---

## I. Open questions for the owner (stop-and-ask, per Constraints)

1. **Q1 — Approve the purge?** Including its irreversibility, the 40/18 split,
   the ai_runs/materials-stub notes (Q8/Q9), and the storage deletions.
2. **Q2 — Template carries the TARSHID/POC block?** Ten existing columns added
   to the Project sheet so imports arrive saving-sheet-ready. Template change
   only; no schema change. (Recommended: yes.)
3. **Q3 — `buildings.operating_hours` scalar:** relabel as "contract hours/yr
   (tender)" and keep, or drop? (Recommended: relabel, revisit when Saving
   Sheet un-parks.)
4. **Q4 — `buildings.delivery_status`/`approval_status`(+dates):** written by
   nothing since the seed. Drop, or is there an intended future use? These
   look like rules that predate the deliveries module — but per Constraints
   §5, asking beats assuming.
5. **Q5 — Phase labels:** keep the enum values but rename UI copy to
   Setup / Survey / Commitment / Execution / Closeout? (Enum stays; labels are
   presentation.)
6. **Q6 — Per-ESM timelines (D4):** accept project-level freeze covering all
   ESMs, or is per-ESM freezing a real operational need? (Recommended: accept
   project-level; per-ESM adds state nobody asked for.)
7. **Q7 — Permission truth:** RLS says pmo-only for project create/edit; the
   UI offers it to admin/ceo/projm/progm and fails silently. Which is correct?
   (Recommended: RLS is the truth; narrow the UI, and separately decide if
   `admin` should gain parity as 0086 intended.)
8. **Q8 — Import-minted stub materials** (rows named after unknown scope
   codes): keep per the brief's "materials survive", or list and cull the
   stubs with the purge?
9. **Q9 — `ai_runs` (24 rows):** kept as telemetry with project links nulled,
   or deleted with the demo content?

---

*End of design study. Nothing proceeds until the owner approves — the purge
(§G) explicitly, the rest by unit (§H).*
