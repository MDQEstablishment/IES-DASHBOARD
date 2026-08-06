# Survey Stage — Design

**Status: DESIGN ONLY, awaiting owner approval. No code, no migrations.**

Confidentiality: this design is derived from the *structure* of a real client
survey workbook, as summarised by the owner. No client names, coordinates,
rows or values appear here. All examples use placeholders — `BUILDING-A`,
`ROOM-1`, `MAKE-X`. Aggregate structural statistics (row counts, repeat
distributions) appear because the owner's brief supplied them as the sanctioned
evidence base ("shape and structure only").

Governing law for every decision below, in the owner's words:

1. The ESCO is **obliged to visit every building**. Scope decisions are not
   taken before the survey.
2. A closed / abandoned / handed-over building is a **survey finding**, not an
   intake filter.
3. **There is no completeness denominator.** TARSHID sets a duration, not a
   coverage requirement. No progress percentage, no "rooms expected" manifest.
   Progress = what was captured, by whom, when.
4. **Capture must be cheap and never blocked.** Any validation that stops a
   surveyor recording something they can see is a defect. **Warn, never block.**

---

## 1. Why the last survey attempt was bypassed — the defects this design answers

| # | Evidence (structure only) | Design answer |
|---|---|---|
| B1 | Rooms hold multiple items (lighting max 13 types/room; AC max 9). Current `EntryForm` is one entry = one item and re-asks building, floor, room name, type, width, height, area every time — a 13-type room costs 13 full re-entries. | The entry unit becomes the **room card** (§4): location entered once, N equipment lines added at ~3 interactions each. |
| B2 | Room names are not unique — 1,537 of 6,430 name+floor combinations repeat within the same building/floor (worst 130×), and cross-sheet spelling variants break lighting↔AC joins. | Rooms get a **system code** (§5) as identity; name/number stay free text. Both categories live on one room record, so there is no join to break. |
| B3 | The building name is embedded as section-break rows inside the room column, spelled differently per sheet. | Building is a **column on every row** of the Excel template; separator rows cease to exist (§7). |
| B4 | Headerless Qty column, a header cell containing the literal `4349`, an Arabic remarks header, `#REF!` as a registry header, embedded line breaks in headers. | Template headers are fixed, English, single-line, machine-written and machine-read (§7). |
| B5 | Impossible hand-typed values reached the savings calculation: a watts column holding a BTU-magnitude value, an EER of 19.1 (plausible 6–12), a BTU missing a digit, an EER stored as text with a trailing dot. All in hand-typed computed columns or unvalidated critical fields. | Computed columns become **locked formulas**; nameplate ratings are typed **once per model** under numeric-range validation, then referenced — never re-typed per row (§6, §7). |
| B6 | The ESCO already keeps a per-project model registry (two sheets, project-scoped codes, nameplate-photo hyperlinks) — but both sequences start at 0001 (one code means two things), photo links are Windows filesystem paths, and 436 registered models vs 468 free-typed survey strings reconcile to nothing. | The registry is **formalised** (§6): `AC-`/`LT-` prefixed sequences, nameplate photos in the database, survey lines reference the model row by foreign key so reconciliation is by construction. |
| B7 | "Space Category" in the lighting sheet is room area in m², estimated (values 8…300, a third exactly 20; distribution identical across fixture types, matching the AC sheet's explicit Area Served m²). | Kept, stored as **room area** with provenance `estimated`, fed into **no calculation** (§3.2). Owner will revisit its value later. |

The 97-lighting-types-becoming-468-strings problem is prevented **by
construction**: lighting models are structured attributes with a
system-generated display name (§6.2) — two surveyors in two cities recording
the same fitting produce byte-identical records automatically.

---

## 2. Data-model archaeology — what exists, what it was built for, what happens to it

Everything below was verified against the live database on 2026-08-06, not
against migration files alone.

### 2.1 Existing tables (verified live)

| table | live shape | built for | disposition |
|---|---|---|---|
| `rooms` (mig. 0002) | `id, building_id, name, floor, created_at, updated_at` — 0 rows | Install-phase location entity; Sprint 9D-5 linked `survey_entries.room_id → rooms.id` (FK live, `ON DELETE SET NULL`) but the duplication never left | **THE room representation.** Extended additively (§3.1). No second or third representation is created. |
| `room_items` (mig. 0004) | `room_id, scope_id, expected_qty, note`; UNIQUE(room_id, scope_id) — 0 rows | **Installation-scope manifest**: expected quantities per room for the install phase | **Untouched.** Explicitly *banned* as a survey denominator — it is precisely the "rooms expected" manifest the owner forbade for survey. Survey code never reads it. |
| `survey_entries` | **40 columns live** (the brief's "33" predates the scope-exclusion and lighting columns added since) — 0 rows | Flat one-row-per-item capture; carries its own copy of room fields | **Becomes the room equipment line table.** Kept, not replaced; nine columns become redundant (§2.2). |
| `old_model_registry` (0129) | 1,516 rows; UNIQUE(equipment_type, model_no); T1/T3 rating columns; **no project_id** | TARSHID's *baseline reference* registry, imported from the de-identified saving-sheet REFER data — the saving-sheet stage's authority for baseline ratings | **Untouched.** It is *not* the survey registry: it is global TARSHID reference data, while the survey registry is per-project ESCO practice (B6). Confusing the two would put TARSHID's baseline table in the surveyor's picker. |
| `model_aliases` | UNIQUE(raw_normalized) → `old_model_registry`, confidence, source — 0 rows | Reconciling free-typed model strings to the TARSHID baseline registry | **Untouched.** Operates at the saving-sheet stage. The survey stage *feeds* it cleaner input: matching a `project_models` row (one canonical string per model) to the baseline is one alias lookup instead of 468. |
| `survey_entries.catalog_item_id / registry_id / match_source / match_confidence` | FKs live (`registry_id → old_model_registry`) | Match plumbing: proposed replacement (catalog) and baseline identity (registry) per survey line | **Kept as-is.** Populated later by the saving-sheet matching pass, not by the surveyor. |
| `space_types` (0139) | 15 rows | DB-backed room-type list (E: nothing inlined) | **Reused** for the room card's Space Type picker; gains a `code_token` column for room codes (§5.2). |
| `photos` | `building_id, install_log_id, room_id, storage_path, gps, taken_at, caption` | Generic photo attachment — **already has `room_id`** | **Reused** for per-room survey photos (bucket `survey-photos`, mig. 0141). No new photo table. |
| `building_photos` | building-level photos | building documentation | **Reused** for BLOCKED-building evidence photos (§8). |
| `buildings` | 40 columns incl. `code, name, name_ar, region, city, location_lat/lng, elec_meter_no, remarks, status_override*` | The building master | Extended additively for the TARSHID hand-over fields and the field status (§3.3, §8). |

### 2.2 `survey_entries`: the nine columns that become redundant

The new app path writes equipment lines with `room_id` **required in
practice** (still nullable in DDL — legacy rows exist in history and imports
must degrade gracefully; the app path always supplies it). These columns stop
being written and are declared redundant, retained read-only for any legacy
data:

1. `floor` — lives on `rooms.floor`
2. `room_name` — lives on `rooms.name`
3. `room_type` — lives on `rooms.space_type_id`
4. `room_width` — room geometry belongs to the room
5. `room_height` — same
6. `room_area` — lives on `rooms.area_sqm` (with provenance, §3.2)
7. `photo_room_path` — room photos live in `photos` rows keyed by `room_id`
8. `photo_indoor_path` — same (a second room photo, not an item property)
9. `photo_nameplate_path` — nameplate photos live on the **model** (§6.4), once per unique model, not per entry

No column is dropped (Constraints #5 — additive only). A follow-up
`COMMENT ON COLUMN` migration marks each as
`DEPRECATED: superseded by rooms/project_models — not written after survey-stage v2`,
and a test asserts the new insert path leaves all nine NULL.

What `survey_entries` keeps as its live purpose: `project_id, building_id,
room_id, category, qty, remarks, source, created_by/at, updated_by/at`, the
lighting per-line fields (`lamps_per_fixture, lamp_load_w, has_control`), the
scope-exclusion group (a later-stage concern, untouched), the match plumbing
(§2.1), and a new `project_model_id` FK (§6.5).

### 2.3 What is genuinely new

Only three tables: `project_models`, `code_blocks`, `floor_labels`.
Everything else is additive columns on existing tables. There is **no new
room-shaped table** and no new photo table.

---

## 3. Additive schema changes (summary — DDL belongs to the implementation units)

### 3.1 `rooms` — extended to carry room identity

New columns:

- `code text` — the frozen room code (§5.2), `UNIQUE (building_id, code)`
  (codes embed the building code, so per-building uniqueness suffices and the
  index stays small; the code string itself is globally unique by
  construction).
- `room_no text` — free text, no format imposed (C1).
- `space_type_id uuid REFERENCES space_types` — nullable; a surveyor may skip it.
- `area_sqm numeric` — nullable.
- `area_provenance text CHECK (area_provenance IN ('estimated','measured'))` —
  nullable; B7 values arrive as `estimated`.
- `created_by uuid REFERENCES profiles(id)` — nullable (legacy rows), always
  set by the app path; C9's "who recorded this room, when" reads straight off
  `created_by / created_at`.

**Deliberately absent:** any UNIQUE constraint on
`(building_id, floor, name, room_no)`. Duplicate room identity is a
**warning**, never a block (C1) — two corridors may legitimately share a name.
The DB must not enforce what the UI is only allowed to warn about. A test
asserts this constraint does *not* exist (§9.4).

### 3.2 B7 landing spot

The mislabelled "Space Category" value is stored as `rooms.area_sqm` with
`area_provenance = 'estimated'`. It feeds **no calculation** — the saving-sheet
engine has no reader for room area today, and this design adds none. The
provenance flag exists so that if the owner later decides to use area, the
estimated values are distinguishable from measured ones.

### 3.3 `buildings` — TARSHID hand-over fields

TARSHID's list carries: entity, region, city, building name, coordinates,
ownership (owned/rented), electricity meter, notes. Already present:
`region`, `city`, `name_ar`, `location_lat/lng`, `elec_meter_no`. New:

- `entity text` — the owning entity as supplied (free-text content; may be
  Arabic, pass-through per C6, displayed like `name_ar` as a data identifier).
- `ownership text CHECK (ownership IN ('owned','rented'))` — nullable.
- `ownership_raw text` — the verbatim supplied value when it maps to neither
  (import warns, keeps the truth, invents nothing).
- `tarshid_notes text` — the hand-over notes column preserved **verbatim as
  data** (D5). Deliberately separate from `remarks`, which is the ESCO's own
  operational field; the two must never merge.
- Field status columns — §8.

`buildings.name` (NOT NULL, English) receives the **building code string** at
import (e.g. `PROJECT-B0001`), since TARSHID supplies only a free-Arabic name,
which lands verbatim in `name_ar`. The English "name" of an imported building
*is* its identifier — inventing a translation would violate the no-invented-
values rule. The card shows the code with the Arabic name as the RTL subtitle
(existing pattern, Constraints #1 sanctioned exception). Editable later if the
owner wants friendlier English display names.

### 3.4 `space_types` — code tokens

New column `code_token text` (e.g. `COR`, `OFF`, `STO`) — DB-backed per
constraint E, used only at room-code mint time (§5.2). Backfilled for the 15
existing rows in the same migration.

### 3.5 `floor_labels` — new small table

`(id, label text, token text, ordinal int)` — e.g. `Ground Floor / GF`,
`Mezzanine / MZ`, `First Floor / F1`, `Basement 1 / B1`, `Roof / RF`. The room
card's floor picker reads it (sticky, picked once per floor walked).
`rooms.floor` keeps accepting free text — a surveyor typing something outside
the list is capture, and capture is never blocked; unmapped floors take the
fallback token (§5.2).

---

## 4. The room card (D2) — the entry unit is the room

### 4.1 Mobile first (the surveyor is on a phone inside a building)

Single-column card, thumb-reach order:

```
┌─────────────────────────────────────┐
│ BUILDING-A (PROJECT-B0042)   [pin]  │  ← sticky context strip: building +
│ Floor: GF ▾                  [pin]  │    floor, set once, persists across
├─────────────────────────────────────┤    "Save & next room"
│ Room name  [____________]  (free)   │
│ Room no    [____]          (free)   │
│ Space type [Corridor ▾]  (optional) │
│ Area m²    [___] (est.)  (optional) │
│ ⚠ A room named ROOM-1 / 003 already │  ← duplicate warning: appears when
│   exists on this floor (recorded by │    floor+name+no matches; the Save
│   USER-X, 2 Aug). You can continue. │    button NEVER disables because of it
├─────────────────────────────────────┤
│ 📷 Room photos   [ + take photo ]   │  ← per ROOM, not per item; 0..n allowed
│ [thumb] [thumb]                     │
├─────────────────────────────────────┤
│ LIGHTING                            │
│  LED PANEL 60×60 18W ×12   [edit]   │  ← equipment lines; display name comes
│  TUBE T8 CONV 36W ×4       [edit]   │    from the model, only qty is per-line
│  [ + Add lighting ]                 │
│ AC                                  │
│  MAKE-X MODEL-Y SPLIT ×2   [edit]   │
│  [ + Add AC ]                       │
├─────────────────────────────────────┤
│ Remarks [_______________] (free,    │
│          Arabic accepted)           │
│ [ Save & next room ]  [ Save ]      │
└─────────────────────────────────────┘
```

- **Sticky behaviour:** "Save & next room" clears room fields and equipment
  lines only. Building and floor persist. Changing floor is one tap on the
  strip. A surveyor walking a floor never re-selects the building.
- **Both categories on one card** — the surveyor does not know in advance
  which a room has. An empty category section is simply left empty; a room
  with zero equipment lines can still be saved (a room can legitimately be
  recorded as seen-and-empty — capture is never blocked).
- **Nothing on the card is required** except building and floor (which are
  sticky and therefore free). Room name empty? Warn ("unnamed room"), save
  anyway.

### 4.2 "+ Add" is a picker, not a form

Tapping **+ Add lighting** / **+ Add AC** opens a bottom sheet:

1. Search field — matches against the project registry (`project_models`):
   display name, make, model number, code.
2. Result rows show the model's display name + code; tap one.
3. Qty stepper (default 1), optional per-line fields (lighting:
   lamps-per-fixture override only if it differs from the model; AC: none).
4. Done. Three interactions for the common case.

All specification fields (wattage, type, make, ratings) come **from the
model**. The line stores `project_model_id + qty` and nothing the model
already knows.

**The "new model" path** is the last row of the search results ("＋ New model
'MAKE-X …'"), and only there does the full specification form appear — §6.

### 4.3 Desktop

Same card, max-width ~720px, centred; equipment lines render as table rows.
The consolidation surfaces (building room list §4.4, merge suggestions §7.5,
import reports §7.4) are desktop-first — they are the project engineer's
screens, not the field surveyor's. All tables asserted to fit **inside their
cards** at 1366 and 1280 (constraint E — card-level assertion, not body-level).

### 4.4 Resuming a building (C9)

Opening a building's survey tab shows the rooms recorded so far — floor,
name/no, equipment-line count, **recorded by X on date** (from
`rooms.created_by/created_at`) — plus "Add room". There is no completion
state, no percentage, no denominator anywhere on the screen. A building is
never "complete"; it is "surveyed by X on day 1 and Y on day 3". Sorting is
by floor then created_at, so yesterday's trail is visible and whoever
continues today sees exactly where the last person stopped.

---

## 5. Codes — generated once, frozen forever (D3)

### 5.1 Formats (owner-fixed)

| entity | format | assigned |
|---|---|---|
| Project | `<PROJECT-CODE>` | exists on the project card today |
| Building | `<PROJECT-CODE>-B0001…B9999` | at TARSHID-list import, in the order of TARSHID's list |
| Room | `<PROJECT-CODE>-B0042-GF-COR-003` | at room creation (app) or upload (Excel) |
| Model | `<PROJECT-CODE>-AC-0024` / `<PROJECT-CODE>-LT-0024` | at model creation (app) or block reservation (Excel) |

A code is an **identifier, not a description**. If a room's space type is
later corrected from corridor to store, the *column* changes and the *code
does not* — codes may already be printed on issued documents and can never
move. Codes are never derived from building names (free Arabic text with
entity variants — any derived code inherits that instability). TARSHID
supplies no serial, so the sequence is ours, minted at import, frozen.

### 5.2 Room-code components

`building code + floor token + space-type token + 3-digit sequence`, where the
sequence is per `(building, floor, space-type token)`. Tokens come from
`floor_labels.token` and `space_types.code_token` — both DB tables, nothing
inlined. Free-text floor or absent space type take fallback token `XX` /
`GEN`; uniqueness never depends on the tokens because the sequence is scoped
to the token tuple and `UNIQUE (building_id, code)` backstops everything.
The tokens are frozen into the string at mint time; correcting the room's
space type later does not touch the code (C2).

### 5.3 Allocation machinery — collision impossible by construction

New table `code_blocks`:

```
id, project_id, category ('ac'|'lt'), range_start int, range_end int,
issued_to uuid (profiles), issued_at, purpose ('app'|'template'),
status ('active'|'released'), released_at
```

- **Exclusion constraint**: `EXCLUDE USING gist (project_id WITH =, category
  WITH =, int4range(range_start, range_end, '[]') WITH &&)` — two overlapping
  blocks for the same project+category **cannot exist**, enforced by the
  database, not by application discipline.
- `project_models` carries `UNIQUE (project_id, code)` — the second,
  independent fence. Two surveyors producing the same model code is impossible
  at the DB level twice over; §9.1 proves both fences from the `authenticated`
  role.
- **App path**: a SECURITY DEFINER RPC `claim_model_code(project, category)`
  takes a transaction-scoped advisory lock on `(project, category)`, reads the
  high-water mark across `code_blocks` and `project_models`, inserts a
  single-code block (`purpose='app'`), and returns the code. Serialised,
  gap-free-ish, race-free.
- **Template download**: RPC `reserve_code_block(project, category, size)`
  claims the next free contiguous range of **200 codes** (owner's own example
  figures: engineer A 0001–0200, engineer B 0201–0400) under the same advisory
  lock. The template embeds only that block. 2,000 per category is the
  pre-generated ceiling the owner set — ten concurrent 200-blocks; the block
  size (and 4-digit padding) live in `tarshid_constants`-style DB config, not
  code (constraint E).

### 5.4 Abandoned reservations

Codes from an abandoned block are **burned, never reissued** — gaps are
harmless, the code is an identifier, not a counter (owner's words). A block
whose upload never arrives is marked `released` after a housekeeping period
(proposed: 30 days, DB-configured) *purely to tidy the engineer's "outstanding
downloads" list*; releasing a block does **not** return its range to the pool,
because the exclusion constraint keeps the row and the range forever. A late
upload against a released block is still **accepted** (its codes were reserved
to that engineer and were never given to anyone else — accepting it is safe by
construction; the import report notes the block was stale).

Room codes have no reservation problem: the app mints at creation; the Excel
path leaves Room Code **blank for new rooms** and the server mints at upload
(§7.3), so offline actors never mint room codes at all.

---

## 6. The per-project model registry (C3)

### 6.1 `project_models` — new table

```
id, project_id, category ('ac'|'lt'), code text (frozen),
block_id uuid → code_blocks,
-- lighting (structured attributes, C3):
lt_type_id uuid → DB list, lt_size text, lt_wattage numeric,
lt_base text, lt_colour_temp text, lt_lamps_per_fixture int,
-- ac (nameplate, C3):
make text, model_no text, equipment_type text, inverter boolean,
t1_btu numeric, t1_w numeric, t1_eer numeric,
t3_btu numeric, t3_w numeric, t3_eer numeric,
-- both:
display_name text (SYSTEM-GENERATED, always),
nameplate_photo_path text (survey-photos bucket, DB-held — never a filesystem path),
merged_into_id uuid → project_models (null unless merged),
source ('app'|'import'), created_by, created_at, updated_by, updated_at
UNIQUE (project_id, code)
```

Per-project **only** — the model code derives from the project code, and the
owner explicitly ruled out a company-wide registry. `old_model_registry`
remains what it is: TARSHID's global baseline reference for the saving-sheet
stage (§2.1). The two meet later, when the saving-sheet matching pass
reconciles `project_models` rows to baseline entries through the existing
`registry_id / match_source / match_confidence / model_aliases` plumbing —
one lookup per *model* instead of per free-typed *string*.

### 6.2 Lighting: the user never types a name

The new-lighting-model form is all pickers and numbers: type (DB list), size,
wattage, base, colour temperature, lamps per fixture. `display_name` is
generated from the attributes (e.g. `LED PANEL 60×60 18W 6500K`), previewed
live, **not editable**. Identical fittings recorded in two cities produce
byte-identical registry rows — the 97→468 string explosion is impossible by
construction. Near-duplicate attribute sets surface as merge suggestions
(§7.5), never auto-merged.

### 6.3 AC: the nameplate is the source

`make` + `model_no` are read off the nameplate and typed **once**, with the
T1/T3 ratings, under numeric-range validation (DB CHECK constraints carrying
the plausible ranges — EER 4–15, W 100–100,000, BTU 3,000–120,000, ranges
DB-configured — plus form-level warnings *below* the hard bounds). B5's
EER 19.1 cannot enter the registry. Thereafter the model is *selected*, never
re-typed: a nameplate value is typed exactly once per unique model for the
whole project. (These CHECKs guard the **registry**, not capture: a surveyor
facing a nameplate the form refuses records the room with a remark and a
photo — nothing about the room is blocked; the odd nameplate becomes a
photo-backed model created later by the engineer.)

### 6.4 Nameplate photo — once per unique model

TARSHID's own rule: nameplate picture of each **unique model**. On the app's
new-model path (AC) the camera step is part of the form. On this project's
scale that is ~500 photos instead of the 12,000+ the current per-entry
requirement implies. The photo is stored in the `survey-photos` bucket with
the path held on the model row — **never a filesystem path** (B6's broken
hyperlinks). DDL keeps the column nullable for one honest reason: models can
arrive photo-less via the Excel path (a workbook cannot carry the photo), and
refusing the upload would block capture. The debt is surfaced, not hidden: a
per-project **"models missing nameplate photo"** worklist on the engineer's
consolidation screen, and the model picker marks such models with a warning
badge until the photo lands.

### 6.5 `survey_entries` gains `project_model_id`

`project_model_id uuid REFERENCES project_models(id)` — nullable (legacy rows;
plus `category='sensor'|'other'` lines have no registry). New lighting/AC
lines always carry it. The free-text `make`/`model` columns stop being written
on the registry path (they remain for the two non-registry categories), which
is what makes registry↔survey reconciliation automatic — B6(c) closed by
foreign key.

### 6.6 Merging (never automatic)

A merge marks the loser with `merged_into_id`; its **code stays alive and
resolvable forever** (frozen means frozen — it may be printed somewhere).
Pickers hide merged models; existing survey lines keep their original
`project_model_id`, and readers follow `merged_into_id` when aggregating.
No rows are rewritten, no codes reused.

---

## 7. The Excel path (C4, C5, D4)

### 7.1 Two first-class modes

(i) direct mobile entry on site; (ii) download template → fill during the day
→ upload at end of day — multiple surveyors, multiple buildings, one project
engineer consolidating. Neither is a second-class citizen.

### 7.2 The template — four sheets plus a hidden manifest

Generated **per download** (it embeds the download's reserved code blocks and
the project's current model registry, so it cannot be a frozen artefact like
the saving-sheet templates):

1. **AC Models** — the download's reserved 200 `PROJECT-AC-xxxx` codes
   pre-printed in a locked column; the engineer fills make / model no /
   equipment type / inverter / T1-T3 ratings beside a code only when
   registering a new model. Numeric-range data validation on every rating
   column. Existing project models are listed above the blank block,
   read-only, so the filler can see what already exists.
2. **LT Models** — likewise with `PROJECT-LT-xxxx`; attribute columns (type /
   size / wattage / base / colour temp / lamps per fixture) with list and
   range validation. Display name column is a locked formula.
3. **AC Survey** — columns exactly as the owner fixed them:
   `# | Building Code | Building Name | Floor | Room Code | Room Name | Room No | Space Type | Area Served (m2) | Model Code | Equipment Type | Make | Model No (ID/OD) | Qty | Inverter (Y/N) | Operating Hours Ref | Start | End | T1 BTU | T1 W | T1 EER | T3 BTU | T3 W | T3 EER | Remarks`
4. **LT Survey** —
   `# | Building Code | Building Name | Floor | Room Code | Room Name | Room No | Space Type | Area (m2) | Lux (Before) | Model Code | Fixture Description | Lamp Type (LED/CONV) | Fixture Qty | Lamps per Fixture | Lamp Load (W) | <Fixture Load (W)> | <Lamp Qty> | <Room Load (W)> | <Total Load (kW)> | Remarks`

`< >` = **locked formula, never typed** (owner's list: Fixture Load, Lamp
Qty, Room Load, Total Load). Model Code on both survey sheets is a **dropdown
(data validation list) referencing the corresponding model sheet** — reserved
codes plus pre-existing models. Building Code is a dropdown of the project's
buildings **on every row** — the section-break separator rows disappear
entirely. Dropdowns also cover equipment type, make (from the model sheet),
inverter, space type, lamp type. Numeric-range validation on BTU / W / EER.
No embedded line breaks in headers. T1 = 35 °C rating, T3 = 46 °C; TARSHID
computes on T3.

**One deliberate extension of the owner's lock list, flagged for approval
(§11):** the AC Survey spec columns (Equipment Type … T3 EER) are proposed as
locked **lookup formulas** keyed on Model Code, so a nameplate rating is typed
only on the Models sheet (once, under validation) and can never be hand-typed
per row — B5's exact failure path. The owner's C5 list does not mark these
columns locked; this follows C5's *principle* ("every impossible value in B5
was in a hand-typed computed column or an unvalidated critical field") beyond
its letter, so it stops for sign-off rather than reinterpreting.

A hidden `_meta` sheet carries project id, block ids, template version and
generation timestamp — the importer refuses a workbook whose blocks belong to
a different project (refusal with a reason, not silent misfiling).

### 7.3 Room codes on the Excel path

Room Code is **blank for new rooms** and filled only for rooms that already
exist in the DB (re-survey / continuation). At upload the server groups new
rows by `(Building Code, Floor, Room Name, Room No)` within the file and mints
codes per §5.2. Offline actors never mint room codes; the room-code collision
class therefore does not exist. Within-file grouping is exact-match on the
tuple; near-miss spellings across two uploads become two rooms and surface in
the duplicate-room warning view — a visible, mergeable outcome, never a silent
join guess (B2's lesson: the system must not *guess* which rooms are the same).

### 7.4 Round-trip import — every row accounted for

The importer produces a **per-row accepted / accepted-with-warnings /
rejected report** — the standing rule: *an import that silently drops rows is
worse than one that refuses the file.* Every row of both survey sheets appears
in the report with its disposition and reason. Rejections are narrow and
structural (unknown Building Code; Model Code outside any block of this
project and not an existing model; unreadable row). Everything else is
accepted with warnings — out-of-range typed values are imported **flagged**,
not corrected and not dropped (the DB CHECK guards the *registry*; survey-line
oddities land in the row's warning list for the engineer). Uploads are
idempotent-safe: re-uploading the same file reports "already imported" per row
(matched on block + code + row identity) instead of duplicating.

### 7.5 The safety net — merge suggestions

After import, if the same normalised `make + model_no` (AC) or identical
attribute tuple (LT) appears under **two different codes** (two engineers, two
reserved ranges, same physical model), the pair enters a **merge-suggestion
queue** for the project engineer: side-by-side, one tap to merge (§6.6), one
to dismiss ("genuinely different"). **Never auto-merged** — model numbers one
character apart are frequently genuinely different units.

### 7.6 The openpyxl lesson — proved, not assumed

Excel dropdowns are Data Validation, and this project has already paid for a
library silently dropping them. The generator uses ExcelJS (which preserves
them and is already in the toolchain) or writes the XML directly; either way
the proof is **behavioural, two independent methods** (§9.2), never "the write
call succeeded".

### 7.7 Where the generator lives

`src/lib` is frozen under the sha256 manifest and this feature does not touch
it. The template builder is a new module under `src/features/survey/`
(bundle-split, dynamically imported), used by the browser at download time and
by the node test harness for the round-trip proofs — one builder, two
consumers, no drift between what is tested and what is shipped.

---

## 8. Building field status — BLOCKED (C7)

New columns on `buildings`:

- `field_status text CHECK (field_status IN ('blocked'))` — nullable; null =
  no field finding. (An enum-of-one on purpose: TARSHID may later cause more
  finding kinds; the CHECK extends additively.)
- `field_status_remark text` — **free text, no reason list** (owner explicit);
  Arabic accepted (C6).
- `field_status_by uuid`, `field_status_at timestamptz`.
- Attribution CHECK in the 0132 idiom: either all four NULL or all four set
  (with non-blank remark).

Evidence photos attach through the existing `building_photos` table. The
existing `status_override*` columns are **not** reused: they force a pipeline
status, and the owner is explicit that BLOCKED is a survey **output** reported
to TARSHID — it does not remove the building from the project, excludes
nothing, and decides nothing. TARSHID rules on the building's fate; when they
do, the ESCO clears or keeps the flag (audit trail via the existing audit
trigger). The building keeps appearing everywhere it appeared before, with a
BLOCKED badge and the remark.

No access-control layer comes with any of this: **no team assignment, no
building locking, no check-out** (C8). Accounts are the only distinction; the
reserved ranges in §5.3 are for code uniqueness, not work allocation.

---

## 9. Test strategy (D6)

All DB proofs run as the `authenticated` role with exact-count cleanup
(0128/0131 idiom). Every negative claim states its method (Constraints #7
discipline applies to test claims, not only to files).

### 9.1 Same-code impossibility — database-level, both fences

1. Two `reserve_code_block` calls for the same project+category → assert the
   ranges are disjoint; then a hand-crafted overlapping `code_blocks` INSERT →
   assert the **exclusion constraint** rejects it.
2. Two sessions attempt `INSERT INTO project_models` with the same
   `(project_id, code)` → second fails on the **unique constraint**.
3. Concurrency: two parallel `claim_model_code` calls (advisory-lock RPC) →
   two distinct codes, both inside recorded blocks.

### 9.2 Validation survives generation — two independent methods

Build a template via the shared builder in the node harness, then:
(a) re-open with ExcelJS and assert the expected count of dataValidation
objects per sheet with their exact ranges and list sources; (b) unzip and
assert `<dataValidation` occurrences in the raw worksheet XML. Two parsers,
because a single tool's blind spot cannot be allowed to pass for presence —
the de-identification scanner failure is the precedent. Same dual method for
the locked-formula cells (`<f>` present, cell locked, sheet protection on).

### 9.3 Round-trip

Builder → programmatic fill with synthetic rows (`BUILDING-A`, `ROOM-1`,
`MAKE-X`) → importer → assert: every input row appears in the report; room
grouping mints one room for N same-tuple rows; new models land in
`project_models` with their reserved codes; a deliberately out-of-range typed
EER arrives **flagged, not dropped, not corrected**; a code outside the block
is rejected **with its reason**; re-upload reports duplicates instead of
double-inserting; a cross-range duplicate make+model produces a merge
**suggestion** and no automatic merge.

### 9.4 Warn-never-block, asserted both ways

- Schema test: **no** unique constraint exists on room identity
  `(building_id, floor, name, room_no)` — the DB cannot block what the UI may
  only warn about.
- Harness test: saving a duplicate-identity room succeeds while the warning
  renders; saving a room with zero equipment lines succeeds; saving with empty
  room name succeeds with warning.
- Grep-level gate for the review: no `required` on room-card capture fields
  except the sticky context.

### 9.5 The rest

- Coordinate normaliser: table-driven — DMS (`17d45'03.6"N` and the °/′/″
  variants, mixed spacing), decimal, Arabic-Indic digits normalised, junk →
  `null` + warning (never a rejected building; the crew must still visit it).
- RLS on `project_models`, `code_blocks`, `floor_labels`, extended columns:
  A-cannot-read-B DO-block proofs per the standing idiom.
- Redundant-column freeze: the app insert path leaves the nine §2.2 columns
  NULL and always sets `room_id`.
- Card-level fit at 1366 and 1280 for every new table surface.
- `ui-census.mjs --check` green on every unit — `src/lib` hashes unmoved.

---

## 10. Ordered commit plan (D7) — one reviewable unit each

The standing cadence applies: Opus implements, Fable reviews, I verify
independently against the live DB/artifacts, tests green before "done",
deploy-green means green on main, live smoke after deploy.

| # | Unit | Contents | Proof gate |
|---|---|---|---|
| 1 | Schema: rooms & buildings | §3.1–3.5 columns, `floor_labels`, `space_types.code_token`, B7 landing, field-status columns; RLS; column deprecation COMMENTs | DO-block RLS proofs; schema diff; no-unique-on-room-identity assertion (§9.4) |
| 2 | Schema: registry & codes | `project_models`, `code_blocks`, `survey_entries.project_model_id`, the two RPCs, exclusion + unique constraints, range CHECKs | §9.1 in full, run as `authenticated`; RLS proofs |
| 3 | TARSHID building-list import | Parser, dual-format coordinate normaliser, building-code minting in list order, per-row report UI, `tarshid_notes`/`entity`/`ownership` landing | §9.5 normaliser table; synthetic-file import report showing accepted/warned/rejected; zero silent drops |
| 4 | Room card | §4 complete: sticky context, free-text identity, duplicate warning, per-room photos, picker + new-model paths (incl. nameplate camera step), save-and-next | §9.4 harness tests; redundant-column freeze test; card fit 1366/1280; live smoke on main |
| 5 | Template generation + download | §7.2 builder, block reservation wiring, hidden manifest | §9.2 dual-method validation proof; reserved ranges recorded in `code_blocks` |
| 6 | Round-trip import + merge queue | §7.3–7.5: upload, per-row report, room minting, model landing, merge suggestions UI | §9.3 in full |
| 7 | Resume & BLOCKED | §4.4 building room list (who/when, no denominator), §8 flow with photo evidence | Harness tests; grep gate: no percentage/complete-state strings on survey surfaces; live smoke |
| 8 | Docs & backlog | Design doc marked as-built per unit deltas; Backlog updates | Doc diff review |

Units 1–2 are pure additive migrations (Constraints #5). Nothing destructive
anywhere in the plan; no unit touches `src/lib`.

---

## 11. Questions held for the owner (nothing proceeds on these without a ruling)

### Q1 — Do the AC Survey specification columns become locked lookups?

**Where:** §7.2, the AC Survey sheet, columns `Equipment Type · Make ·
Model No · Inverter · T1 BTU · T1 W · T1 EER · T3 BTU · T3 W · T3 EER`.

**The situation.** C5 marks four LT columns as locked formulas and lists no
AC column as locked. But every impossible value in B5 was an AC nameplate
rating (W = 21800, EER = 19.1, BTU = 2300, EER as the text `"7.2."`), and all
of them were hand-typed into a survey row. The Model Code column already
identifies the model, and the AC Models sheet already holds that model's
ratings under validation. So the ratings can be *looked up* rather than
*typed*.

| option | what happens | cost |
|---|---|---|
| **A — locked lookups (recommended)** | The ten columns become locked formulas keyed on Model Code; the rating is typed once, on the Models sheet, under range validation. | The sheet looks slightly less like the one field teams know: those cells become uneditable and show a formula result. A genuinely per-unit deviation cannot be recorded on the survey row. |
| **B — as C5 literally says** | Columns stay hand-typed with numeric-range validation only. | Range validation catches EER 19.1 but **not** a plausible-but-wrong rating, and not the same model typed with different ratings on different rows. B5 recurs in quieter form. |
| **C — locked with an explicit override column** | Lookups by default, plus one `Rating Override (reason)` column for the genuine exception. | An extra column, and an override path that will get used for convenience unless the report flags it. |

**Recommendation: A.** The whole reason a per-model registry exists is that a
model's ratings are a property of the model, not of the room it sits in.
Option C is the fallback if field teams object during the first round —
adding it later is additive and costs nothing now. Flagged rather than
assumed because it extends the owner's own lock list beyond its letter.

### Q2 — What is the English `name` of an imported building?

**Where:** §3.3. `buildings.name` is NOT NULL and English-only per
Constraints #1. TARSHID supplies a free-text Arabic building name and no
serial, no code.

| option | what happens | cost |
|---|---|---|
| **A — name = the minted code (recommended)** | `name = 'PROJECT-B0042'`, Arabic original verbatim in `name_ar`, shown as the RTL subtitle under the code (the existing sanctioned pattern). | Lists read as codes, which is less friendly than a name until the user reads the subtitle. |
| **B — transliterate the Arabic** | An English-looking name is generated. | **Invents data.** Arabic→Latin has no single correct mapping (the point already recorded in `docs/Backlog.md`), so it manufactures a name TARSHID never issued and that no two tools would spell alike. Contradicts the no-invented-values rule. |
| **C — leave name blank** | Not available — the column is NOT NULL, and relaxing it touches every consumer. | Rejected on those grounds. |
| **D — engineer types an English name at import** | A human supplies each name. | ~200 manual translations before the survey can start, blocking the import on data entry. |

**Recommendation: A**, with the code editable afterwards so an engineer *may*
set a friendlier English display name per building, but is never required to.
That keeps the system honest by default and improvable in place.

### Q3 — Where is the nameplate photo actually required?

**Where:** §6.4. TARSHID's rule is "a nameplate picture of each unique
model". The current form demands one per *entry* — 12,000+ photos on a
project this size instead of ~500.

The tension: "required" pulls one way, "capture must never be blocked" pulls
the other, and the Excel path cannot carry a photo at all.

| option | what happens | cost |
|---|---|---|
| **A — required in-app, worklisted on the Excel path (recommended)** | The app's new-AC-model form will not complete without the photo. Excel-created models land photo-less, are badged in the picker, and appear on a "models missing nameplate photo" worklist. | Two different standards for the same field, which must be visible in the UI or it reads as a bug. |
| **B — required everywhere** | Excel-created models cannot be used until a photo is attached. | Blocks capture — a surveyor's uploaded day of work stalls on a photo the workbook was never able to carry. Contradicts A-4. |
| **C — never required, always a worklist** | Uniform, never blocks. | The photo is a TARSHID approval requirement; making it optional everywhere means discovering the gap at approval time, which is the expensive place to discover it. |

**Recommendation: A.** It costs nothing where the camera is in the surveyor's
hand and blocks nothing where it isn't. Worth the owner's explicit ruling
because it is the one place this design says "required" at all.

### Q4 — How long before an unused code block is tidied away?

**Where:** §5.4. A downloaded template reserves a block of 200 codes. Some
downloads are never uploaded.

To be precise about what is being asked: **codes are never reissued under any
option** — the exclusion constraint keeps the range forever and gaps are
harmless. The only question is when a stale block stops cluttering the
engineer's "outstanding downloads" list. A late upload against a released
block is still accepted in every option.

| option | effect |
|---|---|
| **A — 30 days, DB-configured (recommended)** | Comfortably longer than any real fill-and-upload cycle; the list stays short. |
| **B — 7 days** | Tidier list; more blocks marked stale while a surveyor is still working through a slow building. Harmless but noisy. |
| **C — never auto-release; manual only** | Nothing is ever wrongly marked stale; the list grows and stops being read. |

**Recommendation: A**, with the period in DB config so changing it is a
settings edit, not a migration. This is the lowest-stakes of the four — it
affects one list's tidiness and nothing about data integrity.

---

## 12. Self-review (F) — run against the six named hazards

**F1. Any validation that blocks a surveyor from recording something they can
see?** Sweep of every hard stop in the design: room save — nothing required,
duplicates warn (§4.1, §9.4); zero-equipment rooms save; empty names save.
Registry CHECK constraints (§6.3) block *registry rows*, not room capture —
the escape (record room + remark + photo, model created later) is stated in
§6.3. Import rejects only structurally unusable rows (wrong project, unknown
building, code outside any block) and every rejection is itemised with a
reason; out-of-range values import flagged (§7.4). Nameplate photo: required
only on the app new-model path; Excel path degrades to a worklist (§6.4) —
and item §11.3 asks the owner to confirm even that. **One fix made during
this review:** the first draft required room *name* to save a room; removed —
name empty now warns.

**F2. Any progress metric implying a required total?** The resume view (§4.4)
shows only what exists — rooms recorded, by whom, when. No percentage, no
"complete", no expected count anywhere. `room_items` (the one table in the
schema shaped like a denominator) is explicitly banned from survey reads
(§2.1), and unit 7's proof gate includes a grep for percentage/complete-state
strings on survey surfaces. TARSHID's ~200-building list defines *visits
owed*, not a survey-completeness denominator; the buildings screen gains no
"X of Y surveyed" figure from this design.

**F3. Any hand-typed value reaching a savings calculation without
validation?** Nameplate ratings enter once, on the registry, under DB CHECK
ranges (§6.3); survey lines reference the model and carry no rating fields on
the app path. Excel: the four computed LT columns are locked formulas; AC
spec columns are proposed as locked lookups (§7.2, pending §11.1) — if the
owner declines, they remain under numeric-range validation, and either way
the importer flags out-of-range values on arrival (§7.4). B7's estimated
area feeds **no calculation** (§3.2). Residual risk, stated honestly: typed
values *inside plausible ranges* (a wrong-but-possible EER) are not
detectable by structure; the nameplate photo on the model is the audit trail
for exactly that case.

**F4. Any path where two surveyors mint the same code?** Model codes: two
independent DB fences (exclusion constraint on block ranges + unique on
(project, code)), proven from the authenticated role (§9.1); app path
serialised by advisory lock. Room codes: only the server mints them — app at
creation, importer at upload; the Excel path carries no room-minting ability
at all (§7.3). Building codes: minted once, inside the single import
transaction, in TARSHID list order. Burned codes never return (§5.4).

**F5. Any third representation of a room?** The design *removes* one:
`survey_entries`' embedded room copy is deprecated down to a foreign key
(§2.2), leaving `rooms` as the single representation. New tables are
models/codes/floor-labels — nothing room-shaped. `photos` reuses its existing
`room_id`. `room_items` is untouched install-phase scope. Rooms in the Excel
file are rows-in-transit keyed to DB rooms by code (existing) or minted at
upload (new) — no persistent second store.

**F6. Any client data in this document?** Re-scanned the full text: no
entity names, no coordinates, no model strings, no room names, no person
names; all examples are `BUILDING-A` / `ROOM-1` / `MAKE-X` / `USER-X` /
`MODEL-Y`. Retained aggregate structural statistics (row counts, repeat
distributions, the B5 value classes) are exactly the evidence the owner's
brief supplied under its own "shape and structure only" rule — nothing here
exceeds what the brief itself states. Method: manual re-read plus grep of
this file for Arabic script (0 hits), digit-pair coordinate patterns (0 hits
outside the DMS *format example* copied from the brief), and the client-name
detector categories from the #7 tooling.

**Checked beyond the six:** (a) constraint E — no constants inlined: block
size, padding, ranges, tokens, floor labels, space types all DB-backed;
(b) `src/lib` untouched by every unit; (c) additive-only across all
migrations; (d) C8 honoured — no assignment/locking/check-out anywhere;
(e) C6 honoured — every free-text field passes Arabic through, every
structural string is English; (f) conflicts with shipped behaviour
(per-entry nameplate requirement, per-entry room fields) are the brief's own
corrections, not reinterpretations — where genuine ambiguity remained it
landed in §11 rather than in a decision.

**STOPPED HERE.** No code, no migrations. The owner approves this design —
and rules on §11 — before anything is built.
