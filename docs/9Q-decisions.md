# Sprint 9Q — decisions and findings

---

## Q1 · The Dashboard layout was wrong twice, and the gate only caught it once

9P(B) promoted the S-Curve into the large bottom-left panel and pushed the
Attention List into the one-third column. The owner rejected it on sight and was
right on both counts: the curve sat in a ~550px panel with the line in the lower
third and a void beneath the shorter left column, and the Attention List — a
**table** — was crushed into a third of the width, wrapping its item text to two
lines, pushing AGE out of view, and growing a horizontal scrollbar inside its
card.

**The corrected shape (9Q(1)):** S-Curve is a full-width row of its own at a
~300px panel; below it, Attention List at `2fr` and Recent Activity at `1fr`.
A curve reads wide and short — the emptiness was height, not missing data — and
the table gets back the width in which all five columns fit.

### The gate was structurally blind, and that is the durable lesson

`ui-shots.mjs` asserted `documentElement.scrollWidth <= innerWidth` and nothing
else. When the table stopped fitting, `.ies-table-wrap` did exactly what it was
built to do — it scrolled **inside** the card — so the page never overflowed and
the gate reported `ok` at all three viewports while the defect shipped.

**A body-level overflow check cannot see this class of defect, because a
correctly working scroll container is precisely what hides it.**

The rig now measures every `.ies-table-wrap` against its own `clientWidth` and
fails the run if a table cannot fit its card, naming the card and both numbers.
Applied at ≥768px only: at 390 a wide table is *supposed* to scroll in its card.

Proven to have teeth rather than merely added — run against the rejected commit
`7380ba3`, it fails exactly where it should while the body check still says ok:

```
OVERFLOW 1366x768 dashboard  (body scrollW 1366 vs 1366 — body says OK)
  -> TABLE DOES NOT FIT ITS CARD: "Attention List" 520 vs 362
OVERFLOW 1280x800 dashboard  (body scrollW 1280 vs 1280 — body says OK)
  -> TABLE DOES NOT FIT ITS CARD: "Attention List" 520 vs 330
ok       390x844  dashboard  (scrolling in-card is correct here)
```

---

## Q2 · Global search inherits permissions by construction

Owner scope: projects, buildings, materials, documents, COCs.

**There is no access-control logic in the search code, deliberately.** Every
query runs through the shared `supabase` client — the same one `useLiveQuery`
uses — carrying the signed-in user's JWT. The frontend bundle contains no
service-role key (`grep -rn "service_role" src/` → 0), so search has no way to
see more than the person typing could already reach by navigating. RLS answers:

| entity | SELECT policy |
| --- | --- |
| `projects` | `can_read_project(id)` |
| `buildings` | `can_read_building(id)` |
| `project_documents` | `can_read_project(project_id)` |
| `cocs` | `can_read_project(project_id)` |
| `materials` | **`true`** — see Q3 |

An application-code filter that has to be correct on every future query is
exactly what this project keeps refusing. The policy is the fence.

### The two-stage query, and its honest cost

The tokeniser cannot be expressed in PostgREST, so: **server** runs one coarse
`ILIKE` across the entity's text columns capped at **40 rows** (this is what
stops a two-letter query pulling 815 buildings over the wire); **client** ranks
what came back with the tokenised, numeric-aware matcher and keeps **5 per
group**. Input debounced at 200ms, and a slow response that lands after a newer
one is discarded rather than allowed to overwrite it.

The cost: recall is bounded by the coarse filter, so a row the matcher *would*
rank can be missed if its raw string never contains the longest token. Stated
rather than papered over — it is the price of not pulling the catalogue.

### One matcher, not two

The tokeniser, the unit-word list and the ±10% TARSHID numeric tolerance were
inline in `OldUnitPicker` inside `components/survey/EntryForm.jsx` (9D-6),
exported nowhere. They are now `src/lib/search.js` and **`EntryForm` imports
them**, so the two call sites cannot drift. `src/lib` goes 18 → 19 modules and
the manifest in `9J-acceptance.md` was regenerated in the same commit, so the
next byte-identical check has a correct baseline instead of a false alarm.

### On "transliteration-aware", precisely

`toLatin` folds Arabic-Indic (٢) and Persian (۲) **digits** to Latin. It is
**not** Arabic-letter→Latin transliteration: `masjid` will not find `مسجد`.
Arabic queries match because the Arabic **columns** are searched directly
(`buildings.name_ar`, `projects.entity_name_ar`) — verified live, `عسير` returns
three buildings by their Arabic names. Both scripts are searchable; neither is
converted into the other. True cross-script matching is logged as
`SEARCH_CROSS_SCRIPT` in `docs/Backlog.md` and deliberately not built.

---

## Q3 · `materials` is global in search on purpose — a decision, not an oversight

Every other searchable entity is RLS-scoped to what the caller may reach.
`materials` is not: its SELECT policy is `true`, so any signed-in member of
staff sees all 56 rows, and **search reflects that faithfully rather than
narrowing it**.

That is the existing and intended design. The material catalogue is a **shared
reference list**, not project data — a storekeeper needs to look up "LED
Floodlight 100W" without belonging to a project. A later reader who finds
material results from outside their own projects is looking at correct
behaviour, and should not "fix" it.

### The column allow-list is the only thing keeping cost out of those rows

This is worth stating exactly, because the obvious assumption is wrong.

`materials.cost_per_unit numeric(12,2)` exists — added in migration 0063. The
0121 write-ban trigger **does not cover it**: `trg_lighting_cost_closed` and
`trg_ac_cost_closed` are attached to `lighting_catalog` and `ac_catalog` only.
Nothing at the database level stops a cost being written to a material row. It
is NULL on all 56 rows today, but that is a fact about the current data, not a
guarantee about future data.

So the explicit column list in `search.js` is **not** defence in depth layered
over a trigger — for this table it is the *primary* defence, and the only reason
a cost cannot reach a search result. `materials` is selected as
`id, code, name, unit, esm:esms(code)` and nothing else. Never add a cost column
to any list in that file, and never use `*`. The suite asserts both.

---

## Q4 · The permission test, and why the converse assertion is half of it

`scripts/search-rls-test.mjs`, run against the live project with real JWTs.
**26 assertions, 26 passed.**

**A1 — static audit (17):** the module can only reach the five scoped tables;
never `ai_settings`, `ai_runs`, `profiles`, `audit_log`, `catalog_costs` or
`murshid_feedback`; no wildcard and no empty column list; no `unit_cost`,
`labor_cost`, `cost_per_unit`, `cost_usd`, `price` or `salary` in any allow-list;
no service-role reference; the client comes from the shared session rather than
a freshly minted key.

**A2 — the leak test (4).** Scope on the live database: the `proje` holds 2
projects, 4 buildings and 26 documents; **811 buildings and 3 documents are out
of reach.** Each out-of-scope row was searched *by its exact code or reference*
— the strongest probe available, because an exact-code query is what would slip
through a filter that was merely sloppy rather than absent. Every one returned
**zero rows**.

**A3 — the converse (3).** *A search that returns nothing is not a secure
search, it is a dead one.* If A2 had passed because the queries were broken,
this fails: the `proje` searching for its **own** building `DEMO-001` (code
neutralised, Constraints #7), its own
project `PROJECT-A` and its own document each returns exactly one row.

**A4 — materials (2).** A `proje` sees the same 56-row catalogue a `pmo` does
(intended, per Q3), and no cost field is present on any returned row.
