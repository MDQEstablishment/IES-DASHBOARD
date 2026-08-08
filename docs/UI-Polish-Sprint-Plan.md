# UI polish sprint — plan and self-review

**Status: PLAN. No code written. Stops for the owner's approval.**

Four items from the owner walking the live site. Two are composition, two are
design defects with a data component. Nothing here adds capability.

---

## Item 1 — One dialog, two ways in

### What is there today

`ProjectDetail.jsx:213` carries three sibling controls: **Add building**,
**Download template**, **Import Excel**, plus **Edit project**. Four buttons in
one header row, three of which are the same task at different scale.

### Recommendation: a segmented control inside one dialog

One dialog, titled **Add Buildings**, with a two-option segmented control at the
top: **One Building** | **From Excel**.

**Why segmented rather than tabs**, and rather than a primary panel with the
bulk path demoted:

- **Not tabs.** Tabs read as peer *sections of a page*. At a 560px dialog width
  they look like a mini-page pasted into a modal, and they invite a third and
  fourth tab later. A segmented control reads as *"same task, choose your input"*,
  which is exactly the relationship: both segments end in the same
  `import_buildings()` call and produce the same row.
- **Not bulk-as-secondary.** The owner's own framing rules this out — the Excel
  path with its template *is the guide ESCOs are handed*. Demoting it to a link
  under the form contradicts the thing the last sprint was built for.
- Segmented also keeps the dialog honest about state: the footer button changes
  with the segment (**Add Building** / nothing until a file is chosen), so there
  is never an enabled action that does not apply to what is on screen.

### Layout

```
┌─ Add Buildings ─────────────────────────────────┐
│  ( One Building | From Excel )   ← segmented    │
│                                                 │
│  ONE BUILDING                                   │
│    Building Name        [________________]      │
│    Latitude  [________]  Longitude [________]   │
│    Notes                [________________]      │
│                                                 │
│  FROM EXCEL                                     │
│    [ Download Template ]   ← step 1, an action  │
│    [ Choose File… ]        ← step 2             │
│    …then the per-row report, in place           │
│                                                 │
│                        [ Cancel ] [ Add Building ]
└─────────────────────────────────────────────────┘
```

Template download moves **inside** the Excel segment, immediately above the file
picker — download, fill, upload, in the order they happen. It stops being a
header button competing with Add.

Project header goes from four controls to two: **Add Buildings**, **Edit
Project**. Edit project stays exactly where it is, as instructed.

### Data layer

Unchanged. `AddBuildingModal` and `BuildingImportModal` already exist and both
call `import_buildings()`. This is composition: the two bodies move into one
shell and the shell owns the segment state. No migration, no RPC change.

---

## Item 2 — Capitalisation

### The rule

**Title Case** — every word capitalised except minor words (a, an, and, as, at,
but, by, for, in, of, on, or, the, to, vs) which stay lowercase **unless first or
last**:

- page titles and kickers
- tab and segment labels
- button labels
- card and section headers
- table column headers
- KPI / stat labels
- modal titles
- form field labels

**Sentence case** — first word capitalised, everything else as written:

- helper and descriptive text
- empty states
- validation messages and toasts
- placeholder text
- tooltips and `title` attributes
- `aria-label` (not visible text; excluded from the audit entirely — 11 in the
  tree, and auditing them would generate false findings)

**Exempt, never re-cased:**

- acronyms — ESM, COC, BOQ, TARSHID, PMO, IES, SKU, SASO, SEER, IEER, EER, BTU,
  TR, PO, AC, LED, CCT, DIP, TDS, WIR, MIR, ID/OD, AI, PDF, KSA
- SI and currency units — kWh, m², W, K, lm, SAR (`kWh` never becomes `Kwh`)
- codes and identifiers — `MDQRE-B0001`, `T1`, `T3`, `Rev`
- brand and product names
- **status chips** — `STATUS` in `src/lib/constants.js` is already Title Case
  (`Active`, `On-Hold`, `In Progress`) and lives in `src/lib`, which this sprint
  must leave byte-identical. Compliant and untouched.

### The check that decided the rule

Before treating ALL-CAPS as a defect I checked whether it was a deliberate
typographic device, because flattening a designed micro-label would make the
product worse — the owner's own warning.

It is not a device. **Both conventions are rendered with identical styling:**

| | `ProjectDetail.jsx:346` | `Settings.jsx:153` |
|---|---|---|
| style | `fontSize: 10, fontFamily: var(--mono), color: var(--text-3)` | `fontSize: 10.5, fontFamily: var(--mono), color: var(--text-3)` |
| text | `CODE`, `BUILDING`, `CONTRACTOR` | `User`, `Role`, `Status` |

Same micro-label treatment, two different text conventions. A compliant
rendering therefore **already exists in the product** — Settings, Tasks, Main
Warehouse and Project Warehouse all read Title Case at mono 10px and look
correct. Converting the rest matches something real rather than guessing.

**One genuine exception found:** annotation chips rendered in mono at ≤9px —
`PROPOSES · YOU DECIDE`, `FROM MEMORY`, `CACHE READ`, `VIEWING`,
`RESIDENTIAL · EXCLUDED`, `ASSISTANT · VERIFIED`. These are status *badges*, not
headers or labels, and their caps is doing the same job as the status pill's.
**Proposal: exempt badges, and list them so the exemption is explicit rather
than a judgement call at edit time.**

### The inventory

**247 ALL-CAPS violations across 28 files**, plus **17 concepts written two ways**.

**Same concept, two spellings — a finding in its own right:**

| concept | ALL-CAPS in | Title Case in |
|---|---|---|
| Status | ManageEsms, ProjectDetail, ProjectDocuments, SavingSheetTab | DesignSystem, Settings, Tasks |
| Material | DailyProgress, ManageEsms, MaterialDeliveries | MainWarehouse, ProjectWarehouse |
| Qty | DailyProgress, InspectionFormModal, MaterialDeliveries | ManageEsms |
| Building | DailyProgress, ProjectDetail | CocCoverage, DesignSystem |
| By | AiUsageMeter, ReportTemplate, SavingSheetTab, SavingSheetTemplate | ManageEsms |
| Actions | EquipmentCatalogs, SavingSheetTab, SavingSheetTemplate | ReportTemplate |
| Category | BuildingMaterialsPlan | MainWarehouse, ProjectWarehouse |
| Role | Reports | Settings, Tasks |
| When | AiUsageMeter | ManageEsms, MurshidFeedback |
| Type | Dashboard, ProjectDocuments | MurshidFeedback |
| Version | SavingSheetTemplate | ReportTemplate |
| Uploaded | SavingSheetTemplate | ReportTemplate |
| Received | ManageEsms | ProjectWarehouse |
| Consumed | ManageEsms | ProjectWarehouse |
| Progress | BuildingDetail, ProjectDetail | DesignSystem |
| Code | ProjectDetail | DesignSystem |
| Time | DailyProgress | Settings |

**`ManageEsms.jsx` disagrees with itself** inside one table area: `MATERIAL`,
`SKU`, `IN STOCK`, `CONSUMED`, `REQUESTED`, `RECEIVED`, `SHORTAGE`,
`THRESHOLD`, `STATUS` beside `By`, `Kind`, `Note`, `Qty`, `When`.

**Page kickers** are split too: `Administration`, `Hierarchy chain`, `My queue`
against `RETROFIT PROGRAMME`, `STOCK · ALL PROJECTS`.

**Field labels** mix three conventions: `Building name` (sentence),
`Beneficiary Entity` / `Delivery Note No` / `Project Reference No` (Title), and
`BUILDINGS SURVEYED` / `ENTERED TODAY` / `ENTRIES` / `LAST ACTIVITY` (caps KPI
labels).

**Per screen** (violation counts, full list generated by the audit script):
ProjectDetail, DailyProgress, ManageEsms, ProjectDocuments, InspectionFormModal,
ProjectUnitSelection, MaterialDeliveries, BuildingDetail, BuildingMaterialsPlan,
LightingReplacements, AiUsageMeter, AiAssistPanel, SavingSheetTab,
SavingSheetTemplate, Dashboard, Reports, CocDetailDrawer, OperatingHours,
BuildingChat, MurshidSettings, ProgressReportCard, EquipmentCatalogs,
BuildingModals, Login, EntriesTable, ReportTemplate, CocCoverage, DesignSystem.

`DesignSystem.jsx` is a developer route. **Proposal: in scope but last**, since
it is the one screen where sample strings are illustrative rather than product
copy.

### Keeping it fixed

A rule in a document is enforced by whoever remembers it — the lesson already
paid for twice this month. `tests/capitalisation.test.mjs` extracts the same
classes this audit extracted and fails on a violation, with the acronym, unit
and badge exemptions as explicit lists.

---

## Item 3 — Project card image position

### What is wrong, precisely

`Projects.jsx:227` renders the cover photo as:

```js
style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
```

There is **no `objectPosition`**, so the browser defaults to `center center`. A
photo composes acceptably by luck; a **logo** does not — its centre is usually
whitespace and its mark sits off-centre, which is exactly the "IES logo lands
badly" the owner saw. Nothing in the code lets him move it.

### A premise I should correct

The card **already has a scrim**, and a carefully measured one: `SCRIM` at
`Projects.jsx:207` is a six-stop gradient whose stops were placed against
measured text pixel positions, with worst-case contrast recorded per zone
(code .788, pill .799, edit .786, name .794, ring .812, meta .829) — all
computed **over a pure-white photo** and all clearing AA.

So the legibility problem is **not a missing scrim**, and adding a second one
would darken a card that was deliberately tuned. What the owner is seeing is a
*composition* failure — the crop — not a contrast failure. **Recommendation: do
not add a scrim. Fix the crop, which is the actual defect.** If after
repositioning any specific image still reads badly, that is a measurable
contrast question and I will measure it rather than guess.

### The control

**Data.** Two columns on `projects`:

```
photo_pos_x smallint not null default 50 check (photo_pos_x between 0 and 100)
photo_pos_y smallint not null default 50 check (photo_pos_y between 0 and 100)
```

Two validated smallints rather than one `'50% 50%'` text: the database rejects
nonsense, and no string parsing sits between storage and CSS. Default 50/50 is
exactly today's behaviour, so every existing project renders unchanged.

**Applied** as `objectPosition: \`${x}% ${y}%\`` wherever the card renders —
`PanoramaCard` today, and any future surface reading the same two fields.

**Editor.** In the project edit modal the photo preview becomes directly
draggable: grab the image, move it, the focal point follows, saved with the
modal. The affordance is the drag itself plus `cursor: grab` — **no helper
paragraph**, per the standing instruction. A small **Reset** control returns it
to 50/50.

### Edge cases

- **No image** — unchanged: `background: var(--track)` behind the scrim. The
  focal control is not rendered, because there is nothing to position.
- **Tiny image** — `cover` upscales and blurs. This is a defect the focal point
  cannot fix, so it is handled at upload: images narrower than 800px are
  **refused at upload with a reason** (a validation message, sentence case).
- **Very wide image** — `cover` crops left and right; the X axis is exactly what
  the drag controls. This is the case the feature most obviously fixes.
- **Very tall image** — same on the Y axis.

### Year-two test

- **Different accent colour** — `--accent` is one token, `src/index.css:45`.
  One line, but it still needs **us**, because it needs a deploy. Making it
  client-changeable means a DB-backed theme row injected as CSS variables at
  runtime. Out of scope here; naming it so it is not mistaken for solved.
- **Different card aspect** — `height: 420` is **hardcoded** in `Projects.jsx`.
  Today that needs a code edit in a component. **Proposal: lift it to
  `--card-h` in `index.css`** alongside the other tokens, so the aspect becomes
  a one-token change like every other visual constant. Still needs a deploy —
  but it stops needing someone to find the number inside a component.

---

## Item 4 — The search bar

### What is wrong, precisely

`Shell.jsx:280` places `GlobalSearch` as the **first child of the
`marginLeft: 'auto'` group** that also holds Live, the clock and the bell. It is
therefore pushed right with that group and sits right-of-centre, exactly as the
owner describes.

**A correction on "unstyled":** it is not literally unstyled —
`GlobalSearch.jsx:79` uses `--radius-s` and `--line-ctrl`. What makes it *read*
as a default input is that it has a hairline border, **no fill**, and no weight
against a `--surface-1` header, so it disappears into the bar. The fix is
contrast and presence, not "add styling where there was none".

### Design

**Centring, robustly.** Make the header a three-column grid rather than a flex
row:

```css
grid-template-columns: 1fr auto 1fr;   /* left | search | right */
```

The search is centred **against the viewport**, not against whatever the
breadcrumb and the right-hand group happen to measure. A flex approach with
`margin: auto` drifts as soon as the breadcrumb grows — which is precisely how
it ended up off-centre in the first place. Left and right columns get
`min-width: 0`; the breadcrumb gets `overflow: hidden; text-overflow: ellipsis`
so it truncates **before** the search moves.

**Presence.** Fill `var(--surface-2)`, 1px `var(--line)`, `--radius-m`, height 36,
search icon at `--text-3`. On focus: border `--accent`, ring
`0 0 0 3px var(--accent-tint)`. Tokens only — no new colours.

**Behaviour by width:**

| width | search | Live + clock |
|---|---|---|
| **1366** | centred, `width: min(420px, 100%)`, full placeholder | both visible, right column |
| **1280** | centred, same width; breadcrumb truncates first | both visible |
| 1024–1279 | centred, width 280, placeholder shortens to "Search…" | both visible |
| 768–1023 | collapses to an icon button (existing `.ies-search-field.expanded` pattern), expanding over the breadcrumb | `.ies-topmeta` still shows |
| **< 768** | icon only | already hidden by `.ies-topmeta` (`index.css:189`) |

**Collision is structural, not tuned.** Grid columns cannot overlap, so Live and
the clock cannot be reached by a growing search field — which a flex row does
not guarantee.

### Year-two test

Same answer as item 3: accent is one token and honestly still needs us for a
deploy. Search **width** should become `--search-w` rather than a literal, for
the same reason as `--card-h`.

---

## Commit plan, with the proof for each

| # | commit | proof |
|---|---|---|
| 1 | Merge the three header controls into one **Add Buildings** dialog | census drift declared; test asserts both segments mount and both reach `import_buildings`; card-level width assertion at 1366 and 1280; `src/lib` unchanged (hash check) |
| 2 | Capitalisation **rule** + audit script (reporting only, no strings changed) | script reproduces 247/28 and the 17 conflicts; main stays green because nothing is asserted yet |
| 3 | Apply the rule across 28 files; flip the script into a failing gate | gate green after, and a negative control (revert one label to caps) turns it red; census declared; `src/lib` byte-identical |
| 4 | Card focal point: migration, drag editor, `objectPosition`, `--card-h` | DB proof that 0–100 persists and 101 is refused by the CHECK; existing projects still render at 50/50; no-image / tiny / wide cases exercised |
| 5 | Search: grid centring and themed field, `--search-w` | layout assertion at 1366, 1280, 1024, 768; Live/clock present and non-overlapping at each |

Every commit: `npm test`, `npm run build`, census check, and **deploy green
asserted on `ref == main`** with a duration floor, per the rule that came out of
the cancelled-deploy failure.

---

## Adversarial review of this plan

**1. The riskiest claim is that Title Case will look right at mono 10px, and I
have evidence rather than taste for it** — Settings and Tasks already render
that way with identical styling. But the evidence covers *table headers*. It
does **not** cover the 8–9px KPI labels (`BUILDINGS SURVEYED`, `ENTERED TODAY`).
At that size, caps genuinely aid scanning. I have proposed converting them.
**I could be wrong, and this is the one place I would accept being overruled by
eye** — recommend the owner looks at one converted KPI row in commit 3 before
the rest lands.

**2. Commit 3 touches 28 files and no test can prove it looks good.** The gate
proves *conformance to the rule*, not that the result is attractive. That is a
real limit, stated rather than papered over. Mitigation: commit 3 is ordered
after the rule is approved, and it changes only string literals — the census
gate will prove no control or query moved.

**3. "247 violations" is a count from my extractor, and my extractors have been
wrong twice today** — once reporting an empty tree because a heredoc ate stdin,
once with a vacuous shared-strings assertion. This number should be treated as
*approximately right and independently reproducible*, which is why commit 2
lands the script before any fix: the owner can run it and get the same number,
or a different one, before a single string changes.

**4. The focal-point drag has an accessibility gap.** Drag alone is not
keyboard-operable. The plan as written would ship a control a keyboard user
cannot reach. **It needs arrow-key nudging when the preview is focused**, which
I have not costed above — adding it to commit 4.

**5. The three-column grid changes the header for every screen**, not just the
ones the owner walked. Breadcrumbs on deep routes (project → building → daily)
are the longest strings in the product, and they now truncate earlier because
the centre column reserves space. That is a deliberate trade — the search is
centred at the cost of breadcrumb length — and the owner should know it is a
trade, not a free win.

**6. Item 1 removes a button the owner may be used to.** "Download template"
disappears from the header into the dialog. That is correct information
architecture and it is also a thing he will look for and not find on the first
day. Worth confirming he wants it fully inside rather than left in the header.

**7. What this plan does not do:** it does not address the pale-logo contrast
case beyond repositioning. If a logo is uniformly pale across the whole frame,
repositioning cannot help and the measured scrim is already at AA. If that turns
out to be his actual case, the honest fix is a per-project scrim strength — and
I would rather discover that from his image than build it speculatively.
