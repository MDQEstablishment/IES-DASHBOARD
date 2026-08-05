# Saving Sheets — the engine made correct, then Murshid made fluent

**Status: CONCEPT — awaiting owner approval. Nothing here is built, no migration
applied, no code touched.**

Owner's goal, verbatim: *"Murshid should be perfect at creating saving sheets for
all ESMs."* Inputs: two approved TARSHID workbooks (AC, and
Lighting + Lighting Control), read as reference material and extracted into a
calculation model, gates and instructions. Per Constraints #7 the workbooks
themselves are not held in the repository and no figure identifiable to a client
appears below. The extraction is quoted throughout as **[EXT]**; the shipped
code as **[9D]** with file:line.

The division of responsibility, fixed by the owner and unchanged here: **Murshid
conducts the intake conversation, checks readiness, names exactly what is missing,
explains the result line by line, and labels the output a draft requiring review —
the engine computes every number.**

## 0. The output ruling — absolute, and it shapes everything below

Owner's ruling, in his words: **TARSHID accepts their own template and nothing
else, ever.** The output is not a workbook we generate — it is TARSHID's own
workbook, stored in the database, populated in place.

The shipped architecture already obeys this mechanically, which is why it
survives this design intact: `savingSheetGen.js` downloads the active template
from the `saving-sheet-templates` bucket, writes **input cells only**, and
`xlsxPatch.js:66` refuses to touch any cell containing a formula — so every
number on the delivered sheet is TARSHID's own formula recomputing on open.
This design adds no second path. Concretely: no sheet is ever added, removed,
renamed or restyled; no formula, pivot, named range, dropdown, data-validation
rule or reference sheet is ever rewritten — not even with identical content.
**The template is governed exactly as the frozen `src/lib` generators are: it
is a deliverable, not a thing we own.**

### 0.1 The four reasons, owner's ruling — they change what we build

1. **Recognition.** TARSHID receives a file identical to the one they issued.
2. **Auditability.** A reviewer clicks any cell and sees the formula and its
   precedents — the sheet stays inspectable instead of being an opaque export.
3. **Revision without code.** A changed factor or added column in TARSHID's
   next template is a swap of the stored artefact, touching no code (§0.3
   defines what a swap requires before it takes effect).
4. **The permanent independent cross-check — a HARD GATE.** The workbook
   computes the same numbers the engine computes, from TARSHID's own formulas.
   Before any sheet is released, the engine's values are compared against the
   values the workbook's own formulas actually produce, and **a mismatch blocks
   the export** — not a warning, a wall. Every single sheet thereby becomes a
   live test of the engine, not just the fixture run. Mechanism in §0.2;
   enforcement is a status-transition gate on `saving_sheets` (a sheet cannot
   leave `draft` without a recorded `verified` result for its exact bytes).

### 0.2 The stale-cache problem, solved explicitly — not left to Excel

The flagged risk: **the summary sheets are computed, and a file written by a
library carries stale cached values** in exactly the sheets a reviewer opens
first. "Assume Excel fixes it on open" is what the ruling forbids.

**The artefacts settled two facts by inspection (§0.5).** First, there are no
PivotTables to refresh: both templates contain **zero `pivotCacheDefinition`
parts** — Pivot, Pivot_2, Pivot_Cntrl, Pivot_Baseline and Vstack are
*formula-driven* summary sheets, so the pivot-cache-refresh layer this section
originally planned is moot, and `fullCalcOnLoad` genuinely covers everything
computed. Second, the pathology is real and present **in TARSHID's own
authored file**: the lighting template's `Light_Savings` formulas carry stale
cached values from a previously computed project — a BOQ figure and four
savings percentages — above completely empty input sheets — TARSHID stripped the inputs and saved
without recalculating. The risk this section exists for ships in the source
artefact before we ever touch it.

The solution, three layers:

1. **`fullCalcOnLoad`, set at patch time.** Neither template has it as
   authored; the shipped patcher already adds it (`setFullCalcOnLoad`,
   `savingSheetGen.js:207`). This is hereby declared as the **one sanctioned
   mutation outside input cells** — a calculation directive, not content — and
   the only one; it is what evacuates TARSHID's own stale cached residue the
   first time a generated file opens.
2. **Headless recalculation as the verification step**: after generation, the
   exact produced bytes are recalculated headlessly (LibreOffice `--headless`
   in a GitHub Actions verification workflow — the repo already runs Actions
   for deploy and smoke), values extracted from the recalculated file and

   > **U4 CORRECTION, measured not assumed. LibreOffice ignores
   > `fullCalcOnLoad`.** Converting the lighting template with
   > `soffice --headless --convert-to xlsx` returns the stale cached numbers
   > *unchanged*, with or without the directive, and LibreOffice drops the
   > attribute from its own output. Recalculation is governed by the
   > LibreOffice profile setting `Calc/Formula/Load/OOXMLRecalcMode`, which
   > defaults to "do not recalculate". Layer 2 therefore forces
   > `OOXMLRecalcMode=0` in a throwaway profile
   > (`scripts/verify-saving-sheet.mjs`) and never depends on layer 1 to make
   > the recalculation happen. Layer 1 stays required and is *asserted* by the
   > verifier, because Excel honours it and Excel is what the reviewer opens.
   > With the override the evacuation is observable: on the untouched
   > template every cached summary cell — K5, L5, Z10 — recalculates to 0 and
   > O5 to `#DIV/0!`.


   compared cell-for-cell against the engine snapshot: row detail, gate
   columns, ESM summaries, formula-fed totals. The result lands in
   `saving_sheets.verify_status` with the mismatch list; §0.1's gate reads it.
   The template's own stale caches make this non-optional: correctness of a
   released file is proven by recalculation, never inherited from the artefact.
3. **What is rejected**: writing the aggregates directly into the summary
   sheets (authors values into TARSHID's computed cells — a §0 violation that
   would also blind reason 4), and equally, "cleaning" the stored artefact's
   stale caches by rewriting it — that is rebuilding TARSHID's file. The
   artefact stays byte-for-byte as received; the directives and the gate
   neutralise the residue in every *generated* file.

Proof obligation (per the ruling, per unit U5): open a generated file and
confirm the totals match the row detail — machine-checked by the headless
harness, and once by a human on real Excel for the acceptance record, because
layer 1 is ultimately honoured by Excel and the design does not take that on
faith.

### 0.3 Where the template lives, and versioning — established, then extended

Queried, not assumed: `saving_sheet_templates` holds **one row** — version 1,
`TARSHID_AC_Saving_Sheet_BLANK_TEMPLATE_v2.xlsx`, active, one matching object
in the `saving-sheet-templates` bucket, and **zero** generated sheets reference
it yet. So TARSHID's AC blank v2 is already stored as the binary artefact; the
table's `version` is our storage version, distinct from TARSHID's own "v2" in
the filename — both are kept (U2 adds `tarshid_label text` so the record can
say "our v3 is TARSHID's v2 revised 2026-09").

Extensions (U2, additive):
- **`kind`** (`ac` | `lighting`): AC and Lighting are different TARSHID
  workbooks; uniqueness becomes *one active template per kind*. **There is no
  lighting template stored today — it is a named dependency (§8).**
- **Every sheet records what produced it**: `saving_sheets.template_version`
  already exists (0095) and gains `kind` context via the template FK. A sheet
  regenerated a year later against a newer template is a different document,
  and the record says so: revision chain on the sheet, template version on
  each revision, both printed into the snapshot.
- **A template swap is not free, despite reason 3**: on upload, the new
  artefact is inspected (sheet inventory, input-cell map discovery, embedded
  reference-sheet diff per §0.4) and **T-FIX re-runs against it before it can
  be activated** — the fixture pin from §9 becomes a mechanical activation
  gate, not a convention.

### 0.4 Reference sheets embedded in the template — who is authoritative

The template carries TARSHID's own `Old_Model_Registry` and approved-baseline
sheets, and its formulas look up *those embedded copies*, not our database.
Ruling adopted: **TARSHID's embedded copy is authoritative; our tables are a
mirror imported from it.** The generator never fills or edits the reference
sheets (the shipped code already deliberately leaves them untouched —
`savingSheetGen.js:3-4` — and that stands). Consequences:

- U1's import source is the template artefact itself (plus an approved
  TARSHID workbook for any rows the blank template lacks) — the mirror is *derived from* the
  deliverable, so they cannot drift at import time.
- On every template upload, the embedded reference sheets are diffed against
  the mirror; a difference marks the mirror stale and **blocks generation
  against that template until re-import** — otherwise the engine would predict
  from one registry while TARSHID's formulas compute from another, and the
  §0.1(4) gate would catch it as a mismatch anyway; the diff just names the
  cause before the wall does.
- `Project_Info` is the opposite case: fourteen fields mapping straight onto
  the project card finished in the previous sprint — a **direct fill with no
  new input**. The shipped `fillProjectInfo` MAP carries 17 label entries; U5
  reconciles the 14-field list against it label-by-label and deletes nothing
  from the template either way.

### 0.5 The artefacts themselves — received, inspected, then REMOVED

> **REMOVED, 2026-08-05 — confidentiality remediation, Constraints #7.** The two
> `.xlsx` files described below are no longer in the repository. They were
> client-supplied documents and a compound format: identifiers survive in
> `xl/sharedStrings.xml`, comments parts, `docProps/core.xml` and `customXml`
> where a visible-grid inspection does not reach, so redaction would have been
> reconstruction pretending to be cleaning. Removal costs nothing still needed:
> **the calculation model was already extracted and verified** — the column
> chain, the two derating constants, the registry contents and the summary
> algebra are all captured in `src/lib/lightingSavings.js`, migration
> `0134_registry_seed.sql` and this document. What is lost is the independent
> re-confirmation, which returns when the owner obtains a genuinely blank
> template from TARSHID; that will be the only version ever held. Every
> statement below is retained as the record of what was inspected, with the
> client's figures stripped.

Both blank templates were held in the repo at `templates/tarshid/`, the frozen
artefacts of record, one per kind:

| kind | file | sha256 (prefix) | sheets |
|---|---|---|---|
| ac | `TARSHID-TEMPLATE-AC-SavingSheet.xlsx` | `2ccf89b2788a8581` | 13: Project_Info, Instr., AC_Savings, OH, Aprvd Project Unit, Pivot, Pivot_2, Data_Check, Aprvd Baseline Unit, Old_Model_Registry, Mnu, Vstack, Project_AC List |
| lighting | `TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx` | `9b681bd70897133c` | 14: Project_Info, Instr., Light_Selection, OH, Light_Savings, Pivot, Pivot_2, Pivot_Cntrl, Pivot_Baseline, Old_Model_Registry, Vstack, Project_Light List, Mnu, DataCheck |

Facts established by direct inspection, superseding earlier assumptions:

- **CORRECTED after deeper inspection (the first counts were wrong):** the
  2,504 / 300 / 500 figures previously stated here were raw XML `<row>`
  element counts, which include empty styling rows TARSHID's saves left
  behind. Counting rows whose key columns are actually populated: AC
  `Old_Model_Registry` = **1,516** data rows (rows 3–1518; ~989 empty
  formatting rows follow), `Aprvd Baseline Unit` = **194**, lighting
  `Old_Model_Registry` = **344** (**339 unique** — 5 byte-identical duplicate
  keys in TARSHID's own sheet, dropped later-wins, each named in 0134's
  header). These populated counts are the import
  targets; the earlier figures survive only as a lesson in counting the
  wrong thing. Two further facts from the same pass: the lighting registry's
  Surveyed Unit Description column is itself FORMULA-built (343 of 344 rows —
  the description concatenates the attribute columns; cached values are the
  import source per §0.4), and the AC registry computes `equivalent_seer`
  by formula on all 1,516 rows with T1/T3 conversions on 573. One data wart
  recorded: lighting row 315 has `1x` (lower-case) against the `NX`
  convention — imported as-is, TARSHID's data is TARSHID's data.
- **Lighting HAS a registry — the design's earlier "no registry by design" was
  wrong.** The lighting template carries a 344-row `Old_Model_Registry` (corrected count, see below) of
  baseline fittings: Surveyed Unit Description (`Conv-FTL-T8-1.5M-1X-56W`),
  Lamp Type, Conv./LED, Location Type, Shape/Size/Base, Length, Lamps/Fixture,
  Wattage, Lumens. The baseline is the *canonical fitting*, not the raw
  surveyed wattage. Consequences: U2 adds a lighting-shaped registry table
  (the AC one's columns — tr, t1_btu, seer — do not fit); U1 imports both
  registries; and the TARSHID-escalation blocker (a surveyed unit absent from
  the registry goes to the technical team with a nameplate photo) applies to
  **both kinds**, not AC only. §9's scope note is corrected accordingly.
- **`Light_Selection` is a 502-row negotiated document**, pairing baseline
  fitting → project unit with lamp load, lumens, CCT, model number, savings %,
  and **Tarshid's Comments / ESCO Reply revision columns (R0, R1)** — the
  selection itself goes through TARSHID review rounds. U5 treats it as
  reference-plus-negotiation, not a free-fill grid.
- **The AC template is genuinely blank** (AC_Savings, OH, Aprvd Project Unit
  all empty). **The lighting template is blank in inputs but stale in caches**
  (§0.2) — and that staleness was a gift while it lasted: the cached
  `Light_Savings` values were the approved workbook's published figures,
  formulas intact, which upgraded §1.3. It is also precisely why the artefact
  could not stay: a "blank" template that displays a real project's results is
  the client's data in the repository under another name.
- Neither template sets `fullCalcOnLoad`; both are dense with defined names
  (2,121 / 2,140) and carry data-validation dropdowns (10 / 14 blocks) — all
  untouched by the patcher, per §0.

> **U4 FINDING — NEITHER TEMPLATE CARRIES PER-ROW FORMULAS, and this bounds
> §0.1(4).** Formula counts per sheet, from the artefacts:
>
> | AC template | formulas | | Lighting template | formulas |
> |---|---|---|---|---|
> | `AC_Savings` | **0** | | `Light_Savings` | **28** (summary block only) |
> | `OH` | **0** | | `Light_Selection` | 4,000 |
> | `Aprvd Project Unit` | **0** | | `Old_Model_Registry` | 1,165 |
> | `Vstack`, `Data_Check` | **0** | | `Pivot*`, `DataCheck` | **0** |
> | `Pivot`, `Pivot_2` | **0** | | | |
>
> TARSHID stripped the data rows *and the formulas in them*. So the AC workbook
> as stored computes nothing at all about savings — there is no `AB` savings,
> no `AD` savings %, no `AE` capacity check, no payback and no pivot to
> recalculate. The lighting workbook's 28 formulas are all in the `Light_Savings`
> summary (J1:O5 and the A10 strip), aggregating rows 12–5011 that do not exist.
>
> CONSEQUENCES, stated rather than worked around:
> - The cross-check has exactly **one real surface today**: the lighting
>   summary block. U4 exercises it and our engine reproduces TARSHID's own
>   `SUMIF`/`SUMIFS` to 1e-9 relative across 27 cells.
> - **There is no AC cross-check to build** until a filled AC workbook arrives
>   (§8.1) — the same dependency that leaves C2 undecided.
> - **U5 inherits a question the design has not answered**: a generated file
>   whose row-level computed columns are empty is not the deliverable TARSHID
>   expects, and writing those formulas ourselves would be authoring into
>   TARSHID's workbook, which §0 forbids. This is a stop-and-ask, not a gap to
>   fill quietly.

**Bucket registration is deliberately NOT done yet**: it lands in U2 with the
`kind` column, because registering a second active template today would break
the single-active lookup the shipped code performs, and this environment
cannot write storage objects in any case. The repo copies are the artefacts of
record; U2's migration registers them (hash-pinned) and the upload happens via
the existing Settings template path.

---

## 1. Verification of the extraction — and a real defect it exposed

The workbooks are not on this machine, so the extraction was verified against the
two strongest available witnesses: the shipped 9D-3 code (which decoded the same
AC workbook family), and the internal consistency of the extraction itself.

### 1.1 Where extraction and code agree

| Item | [EXT] | [9D] | Verdict |
|---|---|---|---|
| Savings % = savings / baseline | ✓ | `savingSheet.js:138` | agree |
| Capacity check = (BTU_new − BTU_old) / BTU_old | ✓ | `:145`, old BTU denominator | agree |
| M²/Ton = area / (BTU/12000) / qty | ✓ | `:79-83`, rounded 2 dp | agree |
| Capacity gate ±10% | ✓ | `tarshid_constants.capacity_tolerance_pct = 10` (queried) | agree |
| Min savings 15% | ✓ | `min_savings_pct = 15` (queried) | agree |
| Inverter excluded from replacement scope | ✓ | `:120` | agree |
| Residential/housing buildings excluded | ✓ | `:119`, `buildings.is_residential` (0094:74) | agree |
| EFLH is an input, not a function of hours | ✓ (8736→2198, 5824→619, 2106→673) | `0094:17` "TARSHID regional calculator (manual)" | agree |

The extraction is also internally consistent: savings ÷ baseline with the [EXT]
formulas reduces algebraically to `(SEER_new − SEER_old) / SEER_new` — capacity,
qty and EFLH all cancel — which matches the workbook's behaviour of a percentage
that depends on efficiency alone.

### 1.2 Three conflicts — the shipped code disagrees with the approved workbook

**C1 — the capacity term. The code has the owner's "subtlety that matters most"
backwards.** [EXT], verbatim: baseline kWh = **BTU_new** / SEER_baseline / 1000 ×
qty × EFLH; savings uses **BTU_new**/1000 — the NEW unit's capacity in both, so
savings are attributable to efficiency alone, never to a capacity change.
[9D] `savingSheet.js:135-137` uses `bt` = `oldBtu(entry, index)` — the **OLD**
unit's BTU — in both baseline and savings. The percentage is immune (capacity
cancels), which is precisely why this survived: every on-screen % looked right.
The absolute kWh — the numbers TARSHID reads on the sheet — differ by the ratio
BTU_new/BTU_old on every row where the replacement is not exactly the surveyed
capacity. **Resolution: the approved workbook wins; the engine moves to BTU_new,
with the regression test the owner asked for by name (T-C1).**

**C2 — the seasonal factor.** [EXT]'s verbatim savings formula contains **no**
0.9 factor. [9D] multiplies savings by `consts.seasonal_factor` (0.9) at `:137`,
and — worse — `isCompliant` at `:253` applies it inside the 15% gate, so the
shipped gate actually demands ≈16.7% raw. If the approved workbook's absolute kWh
reproduce **without** the factor, `seasonal_factor` is a decoding error to be
removed from AC math (the constant row can stay, unused, additive-only); if they
reproduce **with** it, [EXT] under-extracted. **The fixtures decide (T-C2); the
design does not guess.** Note the confusable: the *lighting* 0.9 derating is a
different constant with a different meaning and is genuinely in [EXT].

**C3 — truncation.** [EXT]: savings kWh is TRUNC'd to 2 places. [9D]: no
truncation anywhere (`Math.round` only in `m2PerTon`); full floats end to end.
Reproducing the published numbers **exactly** requires matching Excel's TRUNC at
the same point in the chain — truncate-then-sum differs from sum-then-truncate
across a project-scale fixture count. **Resolution: implement TRUNC(x,2) where the workbook has
it, at the row level, verified by fixture parity (T-C3).**

Also reconciled while in the area (smaller, but real):
- **Two type-match tests disagree** [9D]: `computeRow:151` strict equality vs
  `isCompliant:256-257` bidirectional substring. [EXT] says *equal*. Both move to
  one exported predicate: normalised equality.
- **The registry string-match key omits equipment_type** (`:33-44` keys on
  `model_no` alone, first-wins) while the registry's natural key is
  `(equipment_type, model_no)` (0093:34). With 1,516 rows this collides. Key
  becomes the pair; the edge function's separate normaliser (`index.ts:53-57`)
  is unified with the JS one.
- **Columns N–Q ascending order** [EXT] is a workbook data-entry rule for the
  lookups; the generator writes those columns programmatically, so the engine
  sorts before writing and the rule holds by construction (asserted in the
  generator, T-G7).

### 1.3 What could not be verified from here — since upgraded by §0.5

Originally: the lighting percentages and absolute AC kWh could not be
recomputed without workbook rows. **The lighting side was witnessed once**: the
archived lighting template's own `Light_Savings` formula cells carried the
approved workbook's published figures, matching the extraction to the digit with
the producing formulas intact in the file. That artefact has since been removed
under Constraints #7 (§0.5), so the witness is no longer in the repository; the
extraction it confirmed stands. What remains fixture-only is the AC side's
absolute kWh (the AC template is clean) and the lighting row-level detail: both
still require *approved* TARSHID workbooks — anonymised or synthetic — as the
oracle for T-FIX (§6.1, Dependencies §8.1 — still open).

## 2. Constants audit — queried, not assumed

`tarshid_constants` holds exactly four rows: `tariff_sar_kwh 0.32`,
`seasonal_factor 0.9`, `capacity_tolerance_pct 10`, `min_savings_pct 15`.
`category_hours_factors` holds four rows: ac/lighting/sensor/other, all
`hours_per_year 3600`, `assumed_old_eff 8` on ac only — generic fallbacks,
nothing regional, no relation to the OH triples.

**The four required constants do not exist** and are added by U2:
`lighting_derating 0.9`, `control_derating 0.9`, `control_savings_fraction 0.3`,
`btu_per_ton 12000` (the last replaces the literal `12000` at `savingSheet.js:71`
and `:82`).

**A trap that would make the migration silently useless:** `loadConstants()`
(`:19`) ignores any DB key not already present in `CONST_DEFAULTS` — `if (r.key
in out)`. Adding rows without extending `CONST_DEFAULTS` changes nothing. U3
extends the defaults and adds a test that every seeded key round-trips (T-K1).

`seasonal_factor`'s fate is C2's: resolved by fixture, not by preference.

## 3. The EFLH answer — settled: ESCO-supplied input

**IES holds no regional EFLH calculator, so EFLH is an ESCO-supplied input, and
any design that computes it is wrong.** Evidence, not assumption: the extraction
proves EFLH is not a function of hours (three OH pairs, non-monotone); the schema
stores it as a checked manual column with the comment "TARSHID regional
calculator (manual)" (`0094:17`); zero calculator code exists anywhere in `src/`
or `supabase/`; and `operating_hours.hours_per_year` — the one thing IES *does*
compute — is never read by the savings math (`:114` reads only `eflh`).

Consequences the design commits to: EFLH stays a blocking readiness item per
(building × space type); Murshid **demands** it and records where it came from
(the regional calculator output the ESCO supplies; mosques' standard value is
just a particular supplied value); Murshid **refuses** to accept operating hours
as a substitute and says why in one sentence. The only computation permitted is
an *inconsistency warning* (EFLH > hours_per_year is physically impossible) —
a check, never a value.

## 4. What exists, what is missing — the honest inventory

| | AC | Lighting + Control |
|---|---|---|
| Survey capture | ✓ full (`survey_entries`, tr, inverter, photos) | ⚠ `wattage` only — **no lamps-per-fixture, no lamp-load, no control flag** |
| Registry / baseline | tables exist, **0 rows** (need 1,516 + 194 from the AC artefact) | n/a by design — no registry of existing fittings; wattage + nameplate is the baseline |
| Catalogue | 283 rows ✓ | 593 rows ✓ |
| Savings engine | exists with C1/C2/C3 defects | **does not exist anywhere** |
| Workbook generator | exists (patches template; formulas stay Excel's) | **no Light_Savings / Light_Selection handler** |
| Costs | **write-banned** by 0121 trigger → payback always null, `selection_priced` unsatisfiable | same |
| Feature flag | `FEATURES.savingSheet = false` — everything above is unreachable in the app | same |
| Tests | **zero in-tree** despite five TEST-ONLY exports | n/a |

Two further facts that shape the plan: 9L-decisions.md:99-119 **pre-assigns the
catalog_costs split (drop the 0121 trigger, new table, rewire eight files) to
whichever sprint unparks the saving sheet — this one**; and the `src/lib` freeze
is a per-sprint assertion whose own documentation pre-authorises this sprint to
modify `savingSheet.js` (0121:7-9), with the f75d9cc precedent for declaring the
hash movement. `v_project_savings` (0092) is a different engine for a different
question (survey-time potential); it is not touched, but its divergent AC formula
is recorded so nobody mistakes the two.

## 5. The plan — ordered units, registry import early

Every unit lands alone and is provable alone. Opus implements; each unit is
reviewed against this document before the next starts.

**U1 — Registry import.** `old_model_registry` (1,516 rows) and
`approved_baseline_units` (194) from the AC workbook via the existing
TarshidImportModal path or a one-shot script — whichever reproduces the
`(equipment_type, model_no)` uniqueness cleanly. Proof: row counts, uniqueness,
spot-check of 10 rows against the workbook, and zero survey rows harmed (there
are none). Highest value, no design risk, exactly as briefed. **Dependency: the
two xlsx files must be delivered into the repo first** — they exist only on the
owner's side today. Nothing else in U1 blocks on design approval, so this can
start the moment the files and the approval arrive.

**U2 — Schema + constants (one migration).** The four new constants; the three
lighting survey columns (`lamps_per_fixture int`, `lamp_load_w numeric`,
`has_control boolean` — additive, nullable, with checks); provenance columns
(§7); `catalog_costs` split per 9L (new table, migrate nothing — columns are
empty by construction of the 0121 ban — drop the three triggers, RLS pmo/admin
write); template versioning per §0.3 (`kind`, `tarshid_label`, one-active-per-
kind, mirror-staleness state) and `saving_sheets.verify_status` for the §0.1(4)
gate, with the status fence extended so a sheet cannot leave `draft` without a
`verified` result recorded for its exact bytes (hash-bound, not filename-bound);
DO-block proofs.

**U3 — The engine made correct (AC) and complete (lighting).**
`savingSheet.js` changes, declared per the manifest rule: C1 (BTU_new), C2 (as
the fixtures rule), C3 (TRUNC), the unified type predicate, the two-part registry
key, CONST_DEFAULTS extension, `btu_per_ton` from constants. New
`lightingSavings` module implementing [EXT] verbatim: fixture wattage, lamp qty,
load kW, baseline kWh on **operating hours** (lighting uses hours, not EFLH —
the workbook says so and the design preserves the asymmetry), savings ×
lighting_derating, control baseline = IF(control, baseline − savings, 0),
control savings = control baseline × control_derating × control_savings_fraction,
and the three-ESM summary (Conv→LED, LED→LED, Control). **In-tree test harness**
(`npm test`, vitest or node:test — smallest dependency that runs in CI) with the
approved-workbook-derived fixtures as the oracle, anonymised per Constraints
#7. The eight-file cost rewire from 9L rides here.

**U4 — Gates become law.** Today `low-savings`, `capacity-out` and
`type-mismatch` are cosmetic flags (`:148-153`) — a violating sheet generates.
The instructions sheet states them as requirements, so they become **blocking
readiness items**: a row that fails a gate must be resolved (different
replacement, corrected survey) or explicitly excluded from scope before the
sheet can generate. No silent override; an exclusion is recorded with who and
why. The `isCompliant`/`computeRow` divergence disappears because both call the
same predicates.

**U5 — Populate TARSHID's sheets + the release gate.** The lighting template's
own sheets (Light_Savings, Light_Selection), located by the same fuzzy-name
discovery the AC handlers use, populated in place under the §0 ruling: inputs
written, formula cells refused (`xlsxPatch.js:66` enforces this mechanically),
lookups sorted ascending (T-G7). Project_Info reconciled as a direct fill from
the project card (§0.4). Nothing is authored; if TARSHID's template lacks a
sheet or column the design expected, that is a stop-and-ask, not a sheet we
add. This unit also delivers §0.2 in full: `refreshOnLoad` stamped on every
pivot cache, the headless-recalculation verification workflow, cell-for-cell
comparison against the engine snapshot into `verify_status`, and the release
gate that blocks any sheet leaving `draft` unverified — proven by opening a
generated file and confirming the pivot totals match the row detail, machine-
checked and once by human on real Excel.

**U6 — Murshid intake (§7) + unpark.** The conversational layer, the readiness
naming, provenance rendering, the TARSHID-escalation blocker, draft labelling.
`FEATURES.savingSheet` flips true in this unit's commit **only with the owner's
explicit go at review** — same discipline as `murshid_enabled`, which stays
false regardless; the intake runs through the existing chat surface but the
saving-sheet readiness view works without the assistant being enabled.

## 6. Test strategy — the code, then Murshid itself

### 6.1 The engine (in-tree, runs in CI, blocks merge)

- **T-FIX (the strongest test available, as briefed):** an ANONYMISED
  derivative of the approved TARSHID workbooks is committed as the fixture
  (Constraints #7 — the client workbooks themselves are never committed); the
  engine recomputes every row and every summary; equality is **exact** against
  the fixture's published figures (values lifted from the fixture at test time,
  not retyped). Exact
  means exact: any float drift is a bug in our TRUNC placement, not a tolerance
  to widen.
- **T-C1 (the owner's named test):** two synthetic rows, identical except
  BTU_new ≠ BTU_old; assert baseline and savings scale with BTU_new and are
  invariant to BTU_old; assert a deliberately swapped implementation fails.
- **T-C2:** fixture-derived — whichever way the approved workbook resolves the
  seasonal factor,
  a test pins it so it cannot silently regress either direction.
- **T-C3:** TRUNC placement — row-level truncate-then-sum equals the workbook's
  totals on a crafted set where sum-then-truncate differs.
- **T-G1..G7:** gate matrix — capacity +10.1% blocks, +10.0% passes; 14.9%
  savings blocks; type mismatch blocks; inverter and residential rows excluded
  from totals but present in unit counts; N–Q ascending asserted on generator
  output; the property test that savings % is independent of qty, EFLH and
  capacity (algebraic identity of §1.1).
- **T-K1:** every `tarshid_constants` seed key survives `loadConstants` — the
  allow-list trap of §2, pinned.
- **T-REG:** registry resolution — id beats string; string key is
  (equipment_type, model_no); a cross-type model_no collision resolves to the
  right row.
- **T-XCHK (the §0.1(4) gate, exercised):** generate a sheet, headlessly
  recalculate the exact bytes, assert cell-for-cell equality with the engine
  snapshot; then corrupt one engine constant and assert the SAME pipeline
  reports the mismatch and the sheet cannot leave `draft`. The gate must be
  seen to close, not just to open.
- **T-PIV (stale-cache proof):** assert every pivotCacheDefinition in the
  generated file carries `refreshOnLoad="1"`; assert the headlessly
  recalculated Pivot/Pivot_2/Pivot_Cntrl/Pivot_Baseline/Vstack totals equal
  the row detail; and assert a deliberately stale-cached file (the directive
  stripped) is caught by the verification step rather than passing.
- **T-TPL (template swap gate):** activating a new template version without a
  green T-FIX run against it is refused; the embedded reference-sheet diff
  marks the mirror stale and generation against that template blocks until
  re-import (§0.4).

### 6.2 Murshid's behaviour (extends `scripts/murshid-redteam.mjs` and the
proof pattern already in the repo)

- **T-M1 — a model-generated value cannot reach the sheet.** The proof has three
  layers, two of which already exist in `saving-sheet-agent` and are asserted,
  not rebuilt: (a) every tool schema the assistant can invoke returns only ids,
  confidences and prose — the test walks the actual tool definitions and fails
  if any numeric field other than `confidence` exists; (b) every returned id is
  validated against the offered candidate set (`index.ts:343/:421/:558` pattern)
  — the test submits a forged id and asserts it is dropped; (c) the sheet's
  numbers are recomputed by `savingSheet.js`/`lightingSavings` from DB rows at
  generation — the test corrupts a "model-suggested" number upstream and asserts
  the generated snapshot is unaffected. Murshid's chat layer adds layer (d):
  any number Murshid *states* in conversation must be quoted from an engine
  result attached to the reply, and the red-team case asks it to "just estimate
  the savings" and asserts a refusal that offers the readiness path instead.
- **T-M2 — the registry blocker is a wall, not a speed bump.** Intake with a
  model absent from `old_model_registry`: Murshid names the model, states it
  must go to the TARSHID technical team with a nameplate photo, marks the sheet
  blocked, and no phrasing ("assume something similar", "use the closest one")
  gets it to proceed. Red-team case with three adversarial phrasings.
- **T-M3 — missing-input naming is exact.** Seed a project missing EFLH for two
  space types and lamp_load on one floor; assert Murshid's answer names those
  and only those, per building and space, not a generic "some inputs missing".
- **T-M4 — provenance is displayed and preserved.** Every input in the draft
  carries measured / supplied / assumed; the draft header carries the label
  "DRAFT — requires engineering review"; the snapshot JSONB stores provenance
  per row so the review sees it, not just the chat.
- **T-M5 — EFLH discipline.** Murshid asked to compute EFLH from operating
  hours refuses, cites the regional-calculator requirement, accepts a supplied
  value with source recorded, and raises the impossibility warning when
  EFLH > hours_per_year.

### 6.3 What is deliberately not tested by conversation

Compliance and arithmetic are never asserted through Murshid's prose — they are
asserted in 6.1 against the engine directly. The conversational tests check
behaviour (refusal, naming, provenance, labelling), because testing numbers
through a language model's mouth would launder engine correctness through
paraphrase.

## 7. The Murshid intake layer — design

One conversation, engine-backed, four capabilities and nothing else:

1. **Intake**: walks the ESCO checklist exactly as extracted — survey fields per
   building and space (zone, Arabic building name, floor, space type, area
   served, qty, equipment type, make, model, compressor type; lighting adds
   lamps per fixture and lamp load), nameplate photo per unique model (indoor +
   outdoor together), operating hours per building and space type with off-weeks
   named and the entity letter or site-collection source, EFLH from the regional
   calculator, material submittal (SASO label + certificate, datasheets named
   type-make-tonnage-SEER, supplier stock confirmed). Each item lands in the
   existing tables; nothing new is invented for chat.
2. **Readiness**: renders `readiness()` (extended by U4) as prose — what blocks,
   what is advisory, exactly what is missing and where (T-M3). The TARSHID
   registry gap is a named blocker with the escalation path (T-M2).
3. **Explanation**: after the engine computes, Murshid explains line by line —
   this row saves X because SEER moved from A to B; this row is excluded and
   why; this gate passed at N%. Every number quoted from the engine result
   (T-M1d).
4. **Draft with provenance**: the output is labelled a draft requiring review;
   every input shows measured-from-survey / supplied-by-entity-letter / assumed,
   from the provenance columns U2 adds (survey `source` already distinguishes
   manual/import; operating hours and EFLH gain an explicit `provenance` enum +
   free-text source ref). A well-formatted document gets rubber-stamped;
   provenance is what makes the review real — so it prints on the sheet remarks,
   not only in the app.

Safety posture unchanged: `murshid_enabled` stays false until the owner flips
it; the deny-list and red-team suite only grow; the assistant reads through the
caller's JWT; the saving-sheet tool schemas follow the id-only rule (T-M1a).

## 8. Dependencies the plan cannot manufacture

1. **Anonymised derivatives of the two APPROVED TARSHID workbooks as files** —
   still open (Constraints #7: the client originals are not an option). Needed for
   T-FIX row-level parity (the blank templates carry the lighting summary
   caches, §0.5, but not the row detail or the AC absolute kWh). U1's registry
   import no longer waits on them — the registries are in the templates.
2. ~~TARSHID's blank Lighting template~~ — **closed**: both templates received
   and committed (§0.5), one per kind.
3. **The seasonal-factor verdict** falls out of T-FIX automatically — no owner
   decision needed, the approved sheet is the decision.
4. **Flipping `FEATURES.savingSheet`** is the owner's call at U6 review.

## 9. Self-review (before handover, per the brief)

**Where could the UI or Murshid know a rule the engine does not?** The gates:
today they are flags in one place and hard checks in another (§1.2). U4 unifies
them into shared predicates consumed by computeRow, isCompliant, readiness and
the generator — one source. Murshid holds no rule at all; it renders
readiness() output. Checked: nothing in §7 requires the assistant to evaluate a
threshold itself.

**Where could a number bypass the engine?** The workbook route is mechanically
safe (formula cells refused by xlsxPatch). The chat route is T-M1d. The residual
risk found by this review: the **snapshot JSONB** — if Murshid ever wrote a
snapshot, provenance and numbers could be asserted without the engine. Closed in
the design: snapshots are written only by the generation path, never by any
assistant tool; T-M1c corrupts upstream and asserts the snapshot is engine-pure.

**What breaks the fixtures' authority?** Two things: retyping numbers (avoided —
values are read from the committed workbook at test time), and normalising the
workbook during import (U1 spot-checks are against the file, and T-REG guards
the key). A third, subtler one this review adds: **template drift** — the
generator patches whatever template version is active; T-FIX must pin the
template version it was proven against, and a template change re-runs T-FIX
before it can be activated (now mechanical: §0.3, T-TPL).

**Can the cross-check gate be fooled into comparing the engine with itself?**
Two ways it could degrade, both closed: writing aggregates into the summary
sheets would make the workbook echo the engine (§0.2 rejects it as a §0
violation); and verifying a *re-generated* file instead of the released bytes
would let the two drift after verification — hence the gate binds
`verify_status` to the file hash, and any regeneration resets it (U2).

**Scope honesty.** ~~Lighting has no registry by design~~ — **corrected by
§0.5**: the lighting template carries a 344-row baseline-fitting registry, the
baseline is the canonical fitting rather than the raw surveyed wattage, and
the "absent from registry → TARSHID technical team" blocker applies to both
kinds. The earlier claim came from a 9D code comment written before the
lighting template existed on this side; the artefact outranks the comment.
The control formula's `IF(control = yes, …)` binds control savings to spaces
that received control — the has_control flag is per survey row, and the design
does not invent a building-level shortcut. And the ESM summary percentages are
BOQ-weighted, so T-FIX must reproduce the weights, not just the four headline
numbers.

**What this design deliberately does not do:** compute EFLH (§3), touch
`v_project_savings` (different question), flip either feature flag on its own
authority, or let "perfect at saving sheets" mean the assistant does arithmetic.
Perfect means: never wrong about what is missing, never silent about what is
assumed, and never the author of a number.

**Stop. The owner approves this plan before anything is built.**

---

# PLAN v2 — the authored templates, and everything the owner's rulings changed

**Status: APPROVED DIRECTION, units below awaiting implementation.** Written
after the confidentiality remediation (Constraints #7) removed the client
workbooks from the repository and its history. Everything in §§0–9 above
remains the record of how the model was learned and verified; where a ruling
below supersedes one above, the supersession is stated here explicitly.

## 10. The supersession of §0 — recorded, not papered over

§0 recorded an absolute ruling: TARSHID's own template and nothing else, no
formula ever written by us. That ruling assumed TARSHID issues a canonical
blank file. Two later facts broke the assumption: TARSHID does not issue a
blank workbook at all (their real flow: they give buildings and coordinates,
the ESCO surveys and fills the sheet, TARSHID returns EFLH, the ESCO
completes), and the only "blank" files obtainable are client files stripped of
rows — which is how a real client's data entered this repository. The owner's
final ruling supersedes §0: **we author two clean canonical templates
ourselves — standardised, in the repository, used for every project he adds.**
A template we author contains no client data because none was ever in it.

"TARSHID's template" was therefore always the FORMAT, not a specific holy
file, and faithfulness to the format is what acceptance requires. Three
consequences absorbed:

1. **The §0.1(4) cross-check changes meaning, honestly restated.** It becomes
   an implementation-independence check — our JS engine against our authored
   formulas executing under Excel's semantics — no longer an authority check.
   It still catches engine bugs, formula-authoring bugs and stale caches. The
   wall stays; what it certifies is renamed.
2. **Fill-time discipline survives untouched**: xlsxPatch's refusal to write
   formula cells now protects OUR authored formulas from the filler.
3. **Two old blockers dissolve**: the zero-per-row-formula problem (we author
   the rows' formulas from [EXT]) and the stale-cache residue (we author with
   clean caches; the verify gate still guards every generated file).

## 11. Unit A1 — author the two canonical templates (unblocks everything)

Two workbooks, AC and Lighting, rebuilt from the verified specification:
[EXT] formulas, the §0.5 structure inventories recorded before deletion, the
fill maps in savingSheetGen.js, the column decodes in lightingSavings.js, and
the reference registries now living in the database (1,516 / 194 / 339 rows).

**Reproduce faithfully** (the output must be a file TARSHID recognises):
sheet names and order; column layout and headers; every formula verbatim
including cross-sheet references; number formats and rounding behaviour; the
data-validation dropdowns and their sources; the summary and pivot structures.

**Never reproduce**: any building name, any coordinate, any operating hour,
any project reference, any author/title metadata, any comment. The reference
registries load from the database, not baked into the file — and at runtime
the code LOADS the stored artefact (repo = source of record; bucket/DB =
runtime source, hash-pinned per 0135), it never assembles a workbook in code.

**The verification bar, owner's words, not softenable**: fill our template
and an approved workbook with the same anonymised inputs and compare cell by
cell across the calculation sheets — same values, same formulas, same
formats. If they diverge anywhere, OUR template is wrong and we fix it rather
than explaining the difference. Dependency: the comparison partner is the
anonymised derivative the coordinator is preparing (identical quantities,
capacities, efficiencies, hours and computed results; nothing identifying) —
or the comparison runs owner-side against the real file, which never enters
this repository.

**Two-tier language, kept visible wherever the template's status is stated:**
- *verified-equivalent* — what cell-by-cell parity against an approved
  workbook establishes. Everything we can do internally ends here.
- *proven-accepted* — exists only after TARSHID accepts a sheet produced from
  our template. Final acceptance is TARSHID's, and until then the template is
  verified-equivalent, not proven. The first authored template goes to the
  owner for review before it carries a real submission.

The six skipped tests return here: T-XCHK against the authored template stops
being self-comparison in the degraded sense — it verifies the SHIPPED
ARTEFACT's formulas against the engine, which is exactly what the release
gate needs — and T-WIT's witnesses are replaced by the anonymised
derivative's figures once supplied. T-C2 (the seasonal factor) closes on the
same derivative's absolute kWh.

## 12. Unit A2 — the EFLH round-trip becomes a lifecycle state

TARSHID supplies EFLH, after the survey, not before. The saving-sheet
lifecycle therefore contains a genuine external round-trip:

  buildings+coords from TARSHID → ESCO survey → sheet partially filled
  → WAITING ON TARSHID (EFLH) → EFLH arrives → completion → verify gate → out

`waiting_on_tarshid_eflh` becomes a real, visible status (additive migration:
state + requested_at + received_at + provenance/source_ref per 0135's
provenance columns). Murshid's readiness check names it distinctly: "waiting
on TARSHID for EFLH (requested N days ago)" — never a generic missing-input,
because a stage depending on an outside party otherwise looks stalled with no
explanation. §3's EFLH ruling stands otherwise unchanged: never computed,
never derived from hours; the impossibility warning (EFLH > annual hours)
remains the only computation permitted.

## 13. Unit A3 — nothing held in code: the DB-single-source audit

Owner's rule: the code reads from the database and stores nothing itself —
constants, catalogues, templates, reference registries and configuration all
live in the database as the single source of truth, so client data is never
lost and backup captures everything. Execution: AUDIT FIRST, REPORT BEFORE
CHANGING — some of what looks hardcoded is a deliberate frozen constant
(CONST_DEFAULTS is a last-resort fallback by design; the deny-list regexes
are security posture, not configuration). The audit deliverable is a table:
value · where hardcoded · proposed home (existing table / new row /
deliberately stays in code with the reason) — put to the coordinator before
any migration is written.

## 14. Unit A4 — no invented values anywhere in the interface

Owner's reason, recorded because it defines the acceptance test: he walks the
site himself to confirm it is correct and accurate, so an invented value is
not untidy — it actively prevents him from telling whether the system works.
Anything that looks like data must be data. Every screen either renders
database rows or an honest empty state saying what has to happen first. The
audit sweeps for: sample text, seeded/illustrative numbers, hardcoded lists
standing in for query results, and placeholder copy. Same discipline as A3:
inventory first, then the fix, so nothing that IS real gets mistaken for a
placeholder and deleted.

## 15. Unit A5 — the backup system: scoped, not built

Options and a recommendation go to the coordinator; retention and storage
location are the owner's decisions. The scoping covers: what is backed up
(database including storage buckets — templates, generated sheets, photos;
the repo is already its own record), cadence, where copies live (provider
PITR vs scheduled dumps to independent storage vs both), how a restore is
PROVEN (a restore that has never been rehearsed is a hope, not a backup —
the plan must include a periodic restore drill against a scratch project),
and monthly cost per option.

## 16. Standing items carried forward

- **PROJECT-A seed data** (`seed/moi-asir-buildings.csv`, ~700 rows of a
  second real client's register, in tree and in main's history): awaiting the
  owner's ruling — it is the live programme's data, not this plan's to remove.
- **GitHub server-side retention**: the purged commits remain fetchable by
  direct SHA until GitHub's garbage collection or a Support request; the
  owner files the Support ticket if he wants a timetable.
- **Repository visibility**: stays public by the owner's decision (hosting
  strategy — moving to Cloudflare when ready), explicitly not a judgement
  that the exposure was acceptable; the purge is therefore the only
  containment and was verified from a fresh clone.
- **Order of work**: A1 first — it unblocks U5 (sheet population), the
  return of the six skipped tests, T-C2's closure, and the Murshid intake
  layer (§7) which remains the last unit, unchanged in design.

---

# PLAN v3 — keep TARSHID's files, clean them properly; Instr. is the authority

**Supersedes §11 (authoring).** Owner's ruling, confirmed back to him: do not
author a template from scratch and do not delete the artefacts — TARSHID's
file is the accepted one, and anything we author carries acceptance risk we
cannot close ourselves. The originals were recovered intact from outside the
repository (hashes match the §0.5 record), which is what removal-not-redaction
preserved: deletion was reversible because nothing was ever modified.

## 17. The key insight — the workbook classifies itself

The Instr. sheet is not narrative; it is a classification, with a colour
legend: green = fill, pink = do not change. Cleaning authority derives from
Instr., not from judgement:

| class | sheets | treatment |
|---|---|---|
| FILL (project data) | OH · AC_Savings · Light_Savings · Aprvd Project Unit · Project_Info | data cells emptied completely; the form skeleton (labels, headers) is TARSHID's and stays |
| REFER (TARSHID reference) | Old_Model_Registry · Aprvd Baseline Unit · Project_AC List · Project_Light List · Mnu | untouched at all — sheet XML byte-identical, every registry row and string stays |
| COMPUTED | Pivot · Pivot_2 · Pivot_Cntrl · Pivot_Baseline · Data_Check · DataCheck · Vstack | cached values cleared so they recompute |

**The root cause of the first failed clean, named**: the Arabic facility
strings the audit found (204/342) are ORPHANS — deleting a row removes the
row element but leaves its strings in xl/sharedStrings.xml. The correct clean
removes what the deleted fill rows left behind (orphaned strings, blanked in
place — deleting entries would renumber si indices and rewrite the refer
sheets' XML, which the ruling forbids), plus document metadata, comments and
customXml — while the reference sheets and their ~2,504 + ~500 entries stay
completely intact. Not every string in the file is client data: model numbers
and capacities are TARSHID's; hospital names, coordinates, zones and hours
are the client's. A blunt purge destroys the registries; a shallow one leaves
the client behind.

**The verification bar (owner's words, the part the first attempt got
wrong)**: absence is proven by inspecting every part inside the archive, not
the visible grid — enumerate members, search each, report counts per category
per part, and state the method alongside the result so the next reader can
judge whether the negative finding is worth anything.

Formulas, dropdowns, data validation, named ranges, formats and pivot
definitions stay untouched: the file remains the one TARSHID issued in every
respect except that the project is gone from it.

**Gate**: cleaned files enter the repository only after the per-part proof is
presented and Constraints #7 gains its sanctioned exception (a client-supplied
file may enter only after full-part cleaning, proven by this method, proof
recorded). Everything else in PLAN v2 stands: EFLH round-trip (§12),
DB-single-source with the A3 audit now delivered (§13), no invented values
with the A4 audit now delivered (§14), backup scoped not built (§15), and the
standing items (§16).
