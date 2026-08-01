# Sprint 9L — «مُرشد» decisions and findings

Decisions that were argued and settled, and findings established against the
live database. Recorded here so they are not re-litigated from memory.

Findings are stated as findings — things that were **tested** — and kept
separate from the judgement calls made on top of them.

---

## D1 · The API key lives in the Edge secret vault, never in `ai_settings`

**Decision.** The Anthropic key for مُرشد is an Edge Function secret
(`MURSHID_API_KEY`, falling back to `ANTHROPIC_API_KEY`). It is **never** a row
in `ai_settings`.

**Why.** `ai_settings` is read straight from the browser — `AiUsageMeter`
queries it through PostgREST on the Settings page. Anything in that table is
shipped to every signed-in device. A key stored there would not be
"server-side" in any sense worth the word, and the sprint's own non-negotiable
was that each company's key is held server-side.

**On "per-company isolation".** There is no company or tenant table anywhere in
this schema — checked. Isolation in this platform is **per deployment**: each
client company gets its own Supabase project and its own Pages deploy. An Edge
secret is scoped to the Supabase project, so *per-project is per-company*. That
is the boundary that actually exists, and it is the one the existing
saving-sheet agent already relies on.

`ai_settings` still carries the **non-secret** knobs, which are safe to read:
`murshid_enabled`, `murshid_model`, `murshid_model_escalated`,
`murshid_escalate`, `murshid_monthly_cap_usd`.

---

## D2 · The flag, not the deploy, is the client-exposure gate

`murshid_enabled` ships as `false` and stays false until the red-team suite has
a **recorded pass against the deployed function**. This lets the code ship,
deploy and be reviewed without exposing any client, and it means a failed
red-team result costs a settings flip rather than a rollback.

`murshid_monthly_cap_usd` is separate from `monthly_cap_usd` so the assistant
cannot drain the saving-sheet agent's budget, or the reverse.

---

## D3 · Task #32 — catalog costs — narrowed to a write ban, temporarily

**Requirement.** Nobody outside pmo/admin may see catalog costs before any
client sees مُرشد.

### Findings (tested against the live database, all rolled back)

1. **A column-level `REVOKE` is a silent no-op while the table grant stands.**
   `revoke select (unit_cost, labor_cost) on lighting_catalog from
   authenticated`, then reading as a projm, returned the column happily:
   `explicit-unit_cost=ALLOWED(0) star-select=ALLOWED(593)`. Table-level
   `SELECT` already covers every column.

2. **Dropping the table grant hides the costs from pmo too.** Supabase runs
   every signed-in user as the single `authenticated` database role; the
   application roles are separated by `auth_role()` inside RLS, which is
   row-level and cannot mask a column. "Deny projm" and "allow pmo" are not
   simultaneously expressible through grants on this stack.

3. **A `security_invoker` view breaks the Tarshid import.** A view with
   `case when is_cost_reader() then unit_cost end` would mask per role with no
   application change — but the catalogues are written by
   `.upsert({ onConflict: 'equipment_type,model_no' })`, which emits
   `ON CONFLICT`, and a view carries no unique constraint for it to bind to.
   Tested with an `INSTEAD OF` trigger in place: *"there is no unique or
   exclusion constraint matching the ON CONFLICT specification"*. Making it work
   would require editing `src/lib/tarshidImport.js`, which is under the frozen
   sha256 manifest — the very thing this narrowing exists to avoid.

4. **`misc_catalog` has no cost columns at all** — it is a no-op in every
   variant. Only `lighting_catalog` and `ac_catalog` carry
   `unit_cost` / `labor_cost`.

### Decision

Forbid the **data** rather than mask it: a `BEFORE INSERT OR UPDATE` trigger
(`catalog_cost_closed`, migration 0121) rejects any non-NULL `unit_cost` or
`labor_cost` on both catalogues. A cost that cannot be stored cannot be read by
anyone, so the requirement holds **by construction** rather than by a filter
that has to be correct on every future query.

The columns stay. All 33 code references stay. Every read path is untouched,
`src/lib` is untouched, and pmo/admin keep reading the columns exactly as
before — they simply stay NULL.

The trigger refuses with a message written to be read by a person mid-import,
naming `catalog_costs` as the intended destination and saying who may see costs,
rather than a bare SQLSTATE.

### ⚠ This is temporary, and the Saving Sheet sprint removes it

**The trigger is scaffolding, not the design.** The permanent design is the
structural split: a separate `catalog_costs` table with pmo/admin RLS, and the
8-file rewire that goes with it.

That work is **deferred, not cancelled**. It lands in whichever sprint unparks
the Saving Sheet feature (`FEATURES.savingSheet`), because that sprint has to
touch `src/lib/savingSheet.js` anyway — 11 of the 33 references live there, in
the compliance and selection math. Doing the rewire now and again then is
exactly the double work this project forbids.

**Backlog item — do not re-litigate:**

> Drop `trg_lighting_cost_closed`, `trg_ac_cost_closed` and
> `public.catalog_cost_closed()`; create `catalog_costs` (pmo/admin RLS);
> migrate `unit_cost`/`labor_cost` off `lighting_catalog` and `ac_catalog`;
> rewire the 8 files that read them — `savingSheet.js`, `SavingSheetTab`,
> `EquipmentCatalogs`, `TarshidImportModal`, `LightingReplacements`,
> `ProjectUnitSelection`, `tarshidImport.js`, `savingSheetGen.js`. Owner of the
> Saving Sheet sprint carries this.

---

## D4 · Launcher position, chat history, and the visual gate

- **Launcher sits bottom-left of the CONTENT area**, not the viewport: the 9J
  shell pins the sidebar to the left edge for its full height, so the true
  corner belongs to the navigation. The dock offsets by the sidebar width,
  follows its collapse transition, and drops to the real corner below 1024px
  where the sidebar becomes a drawer.
- **Chat history is not persisted.** Session memory only. Stored questions and
  answers would be a new sensitive surface nobody asked for; adding retention
  later is a decision with its own RLS, not a default.
- **مُرشد is not visually verified in this environment.** The panel renders only
  inside the authenticated shell, and the egress policy here blocks the Supabase
  host, so no session can reach it — the same blocker as the 9J screenshot gate.
  Everything asserted about it is static analysis plus the build. This is stated
  rather than papered over.
