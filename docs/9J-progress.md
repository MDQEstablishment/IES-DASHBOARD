# 9J progress & acceptance ticks

The machine-generated inventory lives in `9J-acceptance.md` and is rewritten by
`scripts/ui-census.mjs` on every run, so the human record — ticks, whitelists,
deferred gates — lives here where a regeneration cannot erase it.

**The sprint does not close while any row below is unticked or any gate is still
marked pending.**

## The iron rule

> "المهم ما تتغير أي وظيفة أو يضيع شيء، أنا أغير سكين فقط" — skin only. Zero
> functional change, zero feature loss, zero data-flow change.

Enforced mechanically, per commit:

| gate | how |
| --- | --- |
| build clean | `npm run build` |
| census freeze | `node scripts/ui-census.mjs --check` — empty diff, or a hand-whitelisted move named in the commit message |
| generators untouched | sha256 manifest of all 18 `src/lib` modules, inside the census |
| generator behaviour | the 9H (6 files) + 9F harnesses re-run green |
| deploy | green before the next commit starts |
| screenshots + overflow | **DEFERRED — pending credential** (see below) |

## Deferred gate: screenshots

The rig (`scripts/ui-shots.mjs`) is built, committed and working — it drives the
preinstalled Chromium, captures full-page PNGs at 1366×768 and 390×844, and
asserts `scrollWidth ≤ innerWidth` per page so a wide table can never push the
page body.

It cannot sign in. `VITE_DEMO_PASSWORD` is deliberately never committed, so
without a credential the rig reaches the login screen and nothing beyond it.
Creating an auth user was considered and **rejected**: it writes to a live
production database during a sprint whose whole premise is changing nothing.

**This gate is deferred, not waived.** The pre-restyle tree is tagged
**`9j-before`**, so the complete before/after set is reproducible retroactively:
check out the tag, run `ui-shots.mjs before`, check out the tip, run it `after`.
Every commit below records `shots pending credential` until that happens.

| viewport | before | after |
| --- | --- | --- |
| 1366×768 login | ✅ captured | ✅ captured |
| 390×844 login | ✅ captured | ✅ captured |
| all authenticated screens, both viewports | ⏳ pending credential | ⏳ pending credential |

## Commits

### 9J(0) — census + rig · `622ff71` · deploy-green (run 168)
Baseline: 49 files · 528 controls · 266 database touches. No app code touched.

### 9J(1) — tokens + shell + Dashboard
| item | state |
| --- | --- |
| `src/index.css` — token sheet, Inter, shell layout | ☑ |
| `src/components/ui.jsx` — shared primitives | ☑ |
| `src/components/Shell.jsx` — sidebar, header, right panel | ☑ |
| `src/pages/Dashboard.jsx` — reference page | ☑ |
| build clean | ☑ |
| census freeze (whitelist below) | ☑ |
| lib manifest — 18/18 unchanged | ☑ |
| harnesses green — 134 assertions across 9H(1,2,3,4,6,7) + 9F assembly | ☑ |
| screenshots + overflow | ⏳ pending credential |

**Whitelisted census additions — all in `Shell.jsx`, all new chrome the approved
design introduces, none of them a change to existing wiring:**

| addition | why it is sanctioned |
| --- | --- |
| `onClick:toggleCollapse` ×1 | the sidebar's collapse control (plan §2, "collapsible to icon-only") |
| `onClick:setDrawer` 1→2 | mobile drawer scrim added alongside the hamburger |
| `onClick:setOpen` 1→2 | the notifications panel gained an explicit close button |
| `onMouseDown:setOpen` ×1 | click-outside scrim for that panel |
| `read:audit_log` ×1 | the right-panel activity feed — decision (c), SELECT-only on an existing table, the same query the Dashboard already runs |

**Proved additive, not substitutive:** every handler and query present in the
pre-9J `Shell.jsx` is still present at the same or higher count — the removed/
decreased set is empty. Routes, the role→nav map, and the lib manifest are
byte-identical. 48 of 49 files show no change in control or query counts at all.

### 9J(2) — Projects group
`Projects` · `ProjectDetail` · `ProjectModals` · `ProjectItems` ·
`ProjectUnitSelection` · `ProgressReportCard` · `TarshidImportModal` ·
`BuildingModals` · `LightingReplacements`

| item | state |
| --- | --- |
| 9 files restyled via the shared token pass | ☑ |
| build clean | ☑ |
| census freeze — **empty diff, no whitelist needed** | ☑ |
| lib manifest — 18/18 unchanged | ☑ |
| harnesses green — 179 assertions | ☑ |
| diff audit — 140 insertions / 140 deletions, zero non-styling lines | ☑ |
| screenshots + overflow | ⏳ pending credential |

Defect caught and fixed before this commit: the first pass mapped every radius
above 12 onto the 16px card radius, which turned `borderRadius: 20` **pills**
(status badges, ring buttons) into rounded rectangles. The rule now sends >= 20
to a true pill and leaves 2-4px hairline notches alone.

### 9J(3) — Survey / field group
`survey/EntryForm` · `survey/OperatingHours` · `survey/EntriesTable` ·
`survey/DailyLog` · `SurveyTab` · `BuildingDetail` · `DailyProgress` (page +
component) · `BuildingChat` · `BuildingPhotos` · `BuildingMaterialsPlan`

| item | state |
| --- | --- |
| 11 files restyled via the shared token pass | ☑ |
| build clean | ☑ |
| census freeze — empty diff, no whitelist | ☑ |
| lib manifest — 18/18 unchanged | ☑ |
| harnesses green — 179 assertions | ☑ |
| diff audit — 117 insertions / 117 deletions, zero non-styling lines | ☑ |
| **tap targets preserved (sprint rule 5)** — every `minHeight`/`height`/control padding byte-identical before and after | ☑ |
| screenshots + overflow at 390×844 | ⏳ pending credential |

These are the field team's daily tools, so the restyle deliberately touched no
sizing at all: the pass rewrites colour, radius, shadow, border and font only.
The measured proof is above — the full multiset of tap-target dimensions is
unchanged, not merely "no smaller".

### 9J(4) — Materials group
`ManageEsms` · `EquipmentCatalogs` · `MaterialDeliveries` · `AiAssistPanel` ·
`AiUsageMeter`

| item | state |
| --- | --- |
| 5 files restyled | ☑ |
| build clean · census empty · manifest 18/18 · 179 assertions | ☑ |
| diff audit — 54/54, zero non-styling lines | ☑ |
| **dense-table structure preserved** — every `ies-table-wrap` scroll container and every sticky header still present, same counts | ☑ |
| screenshots + overflow at 1366×768 (the 593-row catalog) | ⏳ pending credential |

`EquipmentCatalogs` carries the 593-row catalogue with 100-row pagination. The
restyle changed only its chrome; the scroll container and sticky header that
keep it usable are untouched, verified by count rather than by eye.

### 9J(5) — Documents / COCs group
`ProjectDocuments` · `CocHome` · `CocGenerateWizard` · `CocDetailDrawer` ·
`CocFeedbackModal` · `InspectionFormModal`

| item | state |
| --- | --- |
| 6 files restyled | ☑ |
| build clean · census empty · manifest 18/18 · 179 assertions | ☑ |
| diff audit — 58/58, zero non-styling lines | ☑ |
| **live PDF preview panes untouched** — every pane dimension (`flex: 0 0 410px`, `0 0 360px`, `minHeight 420/540`, `height 520`) identical, same line numbers | ☑ |
| screenshots | ⏳ pending credential |

The plan flagged this group as risky because the COC wizard and the inspection
modal embed LIVE PDF previews of generator output. The generators are untouched
(manifest), and the panes they render into keep their exact geometry, so the
previewed document cannot reflow. Only the chrome around the iframe changed.

### 9J(6) — Tasks / Escalations
`Tasks` · `Escalations`

| item | state |
| --- | --- |
| 2 files restyled + 13 labels sentence-cased (decision b) | ☑ |
| build clean · census empty · manifest 18/18 · 179 assertions | ☑ |
| diff audit — 47/47, zero non-styling lines | ☑ |
| screenshots | ⏳ pending credential |

The 9G status controls are untouched: the select still offers exactly the moves
migration 0102/0103 will accept from the signed-in person, and the census proves
no handler moved.

### 9J(7) — Reports
`Reports` · `ReportTemplate`

| item | state |
| --- | --- |
| 2 files restyled + 9 labels sentence-cased | ☑ |
| build clean · census empty · manifest 18/18 · 179 assertions | ☑ |
| diff audit — 22/22, zero non-styling lines | ☑ |
| **`SavingSheetTab` / `SavingSheetTemplate` NOT individually restyled (sprint rule 4)** — zero diffs; they inherit the tokens through the shared primitives only, and the feature flag is untouched | ☑ |
| screenshots | ⏳ pending credential |

Report *generation* is untouched — only the card chrome around it changed.

### 9J(8) — Settings
`Settings`

| item | state |
| --- | --- |
| restyled + 12 labels sentence-cased | ☑ |
| build clean · census empty · manifest 18/18 · 179 assertions | ☑ |
| diff audit — 33/33, zero non-styling lines | ☑ |
| **user-administration guard unchanged** — `canAdminUsers = ['pmo','admin']`, and the 9G(4) rank rules behind it are untouched | ☑ |
| screenshots | ⏳ pending credential |

## Remaining commits

☐ ☐ 9J(9) Login + close-out (dead-token purge, zero-hex
assertion, and the full screenshot set once the credential lands).
