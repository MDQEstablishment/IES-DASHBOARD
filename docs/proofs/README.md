# De-identification proofs

Required by `docs/Constraints.md` #7, exception condition 5: the proof lives in
the commit that introduces the artefact, and an artefact whose proof has gone
stale is treated as unproven.

## Artefacts covered

| artefact | sha256 | source sha256 (the client-supplied original, never committed) |
|---|---|---|
| `templates/tarshid/TARSHID-AC-SavingSheet-deidentified.xlsx` | `a4042921fe18c95e65df2b91c09db1585dbc1fbacfdfd047d8f6550d0e652546` | `2ccf89b2788a85814ec71c999670e41ac892e54fef06c4a48a2a32a0ef70915f` |
| `templates/tarshid/TARSHID-Lighting-SavingSheet-deidentified.xlsx` | `f471ea4a608b15c56e9d39b547db16e368b1077024ef90d6de443f3e95b129a6` | `9b681bd70897133c6e755d797517c6ac155cb9d4be2c8f2ecc3d18c45b533916` |

The originals are **not** in this repository and never were in this form. They
remain with the owner as reference material, per #7's first paragraph.

## Re-running the clean (condition 4)

```
node scripts/clean-tarshid-template.mjs --in <original>.xlsx --out <out>.xlsx --report <r>.json
```

Deterministic: the same input produces byte-identical output on repeated runs.
Verified by running twice from each original and comparing hashes — both
reproduce the committed artefact exactly. A reviewer holding the original can
re-run and compare rather than take this on trust.

## What the cleaning did, and what it deliberately did not

Authority for the classification is **the workbook's own `Instr.` sheet**,
which specifies what may be touched via a colour legend (green = fill,
pink = do not change). It is a classification, not narrative, and it is why
this clean is bookkeeping rather than judgement:

| class | sheets | treatment |
|---|---|---|
| REFER — TARSHID reference data | `Old_Model_Registry`, `Aprvd Baseline Unit`, `Project_AC List`, `Project_Light List`, `Mnu`, `Instr.` | **untouched — worksheet XML byte-identical**, every registry row and string intact |
| FILL — project data | `OH`, `AC_Savings`, `Light_Savings`, `Aprvd Project Unit`, `Project_Info` | data emptied; the form skeleton (header rows, label columns) is TARSHID's and stays |
| COMPUTED | `Pivot`, `Pivot_2`, `Pivot_Cntrl`, `Pivot_Baseline`, `Data_Check`, `DataCheck`, `Vstack` | cached values cleared so they recompute |

**Root cause of the residue this clean removed**: deleting a row in Excel
removes the row element but leaves its strings in `xl/sharedStrings.xml`. The
facility names found by the audit were orphans of rows deleted long before.
Orphaned entries are **blanked in place, never deleted** — deleting an entry
renumbers every subsequent `si` index, which would rewrite the `t="s"`
references inside the REFER sheets, the very parts that must not change.

## Results

- **P1 — client data, per part.** AC: **zero hits across all 54 XML members**.
  Lighting: three shared strings remain, each traced to its cell — `M1`, `N1`,
  `P1` on the `OH` sheet, TARSHID's own bilingual header row (form skeleton,
  correct to keep). Detector categories: Arabic words, coordinate pairs,
  ministry/entity names, zone labels, SharePoint tenant hosts, filesystem
  paths, person names, client figures.
- **P2 — structural parity.** Defined names 2,121 · formulas 6,432 · cellXfs
  229 · fonts 55 · dataValidation 8 · sheet order · shared-string entry count
  2,706 with `count`/`uniqueCount` attributes — all identical pre/post. The
  five REFER sheets are byte-identical.
- **P3 — recalculation.** Both files open headlessly (LibreOffice with
  `OOXMLRecalcMode=0`, per the finding in the design doc that LibreOffice
  ignores `fullCalcOnLoad`) and recompute without error. The lighting summary
  that previously carried cached project figures now recalculates to `0` and
  `#DIV/0!` on empty inputs: the stale values are gone **and** the formulas
  still work. The recalculated output re-scans clean.
- **P4 — determinism.** Byte-identical output across independent runs from the
  originals.
- **P5 — diff surface.** AC 68 → 62 members. Removed: three comment parts and
  their three VML shape parts. Changed: shared strings, `xl/workbook.xml`,
  three fill-sheet XMLs and their rels, `docProps/core.xml` and `custom.xml`,
  `customXml/item2.xml` and `item4.xml`, `docMetadata/LabelInfo.xml`, printer
  settings. **44 members byte-identical.**

## Method, stated alongside the result (condition 3)

Every archive member was enumerated and read; text members were decoded as
UTF-8, binary members scanned as UTF-8, UTF-16LE and latin1, because an
encoding assumption is exactly how a scan returns a false negative — the
tooling's own scanner did that once during this work (see Constraints #7).
What the scan cannot establish: that a **raster image** carries no identifying
content. `xl/media/*.png` are TARSHID's letterhead and form graphics; they were
cleared by direct visual inspection, not by text search, and the byte-level
"Arabic" hits reported against them are compressed-stream false positives.

## Per-file detail

- `tarshid-ac-deidentification-proof.txt`
- `tarshid-lighting-deidentification-proof.txt`
