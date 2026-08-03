# Add Project — implementation plan

**Decision (owner, at the live form): concise, no duplication.** The flow
question is closed. This plan turns that decision into concrete changes for
implementation; `docs/Project-Lifecycle-Design.md` §B/§E stays as reference
(register + integration map), not as open questions.

**Scope: the Add Project flow only** — `ProjectFormModal` (add mode), its
inline buildings block, and the reads that must change so nothing asks twice.
No schema changes in this unit. No `src/lib` edits — all 19 modules are under
the sha256 manifest (`node scripts/ui-census.mjs --check` must stay green).

---

## Changes

**C1 — Beneficiary defaults to client, for real.**
`ProjectModals.jsx:71` writes `null` when Beneficiary Entity is blank while the
placeholder claims "Defaults to Client". Make the payload write `client` when
blank. Field stays for the override case.
*Accept:* create with blank beneficiary → `projects.beneficiary_entity = client`.

**C2 — Weeks derived, not typed.**
`total_weeks` (`ProjectModals.jsx:201`) auto-computes from start/end dates when
both are set; field becomes read-only-when-derived, editable only if dates are
absent. Blank + dates present ⇒ payload writes the derived value.
*Accept:* dates 2026-01-01→2026-06-30 ⇒ weeks 26 without typing.

**C3 — Inline buildings inherit; blank means inherited.**
The "Buildings (you can add now or later)" block (`ProjectModals.jsx:266-288`)
currently re-asks contractor name/phone per building and writes `null` when
blank. Change: placeholders show the project's contractor ("inherited"); blank
stays NULL in the DB; **display resolves NULL to the project contractor
labelled "(project)"** at the three read sites — `BuildingDetail.jsx:108`,
`BuildingsMap.jsx:61-62`, `ProjectDetail.jsx:354`. Same rule in
`BuildingModals.jsx` (Add building) since it's the same duplication.
*Accept:* building saved with blank contractor renders the project contractor
"(project)" on card, map popup, and list; a typed one overrides.

**C4 — One contractor write, not two.**
`BuildingModals.jsx:36` and `ProjectModals.jsx:108` write the same string into
`buildings.contractor` **and** `buildings.contractor_name`. Stop writing legacy
`contractor`; readers already coalesce (`contractor_name || contractor`).
Column drop is a later migration unit — this unit only ends the dual write.
*Accept:* grep — no `contractor:` key in any insert/update payload in `src/`.

**C5 — Engineer name never stored from the form.**
`BuildingModals.jsx:32,38` copies the picked profile's name into
`buildings.engineer_name`. Stop writing it; render via the picked profile
(id → profiles join/embed) at `ProjectDetail.jsx:90,355` and
`BuildingDetail.jsx:107`, falling back to the stored text for legacy rows.
*Accept:* new building rows have NULL `engineer_name`; UI shows the name from
profiles; renaming a profile updates the display.

**C6 — ESMs attached at create.**
A manually created project has zero `project_esms` (nothing in the UI writes
that table), so progress is 0/0 and Manage ESMs shows Empty. Add an "ESMs"
row of checkboxes (the three reference `esms`) to the add form; on create,
insert `project_esms` rows (`project_id, esm_id, ordinal`). Default: all
checked. Uses existing tables and the import's own shape — no new concepts.
*Accept:* form-created project shows its ESMs in Manage ESMs immediately.

**C7 — Form regrouped, nothing asked twice.**
Order: Identity (code, name, status) · Client (client; beneficiary collapsed
as "differs from client?"; entity_name_ar stays in TARSHID block) · Dates
(start, end, derived weeks; contract dates in the same section) · People
(PM, engineer — ids only) · Contractor (name/phone/email, once) · TARSHID INFO
(existing collapsible, unchanged) · Location · Buildings (inline, per C3) ·
Items & Replacements (existing collapsible, unchanged). Labels/grouping only;
no field added, none removed except what C1–C5 make redundant to *ask*.
*Accept:* every `projects` fact appears exactly once on the form; screenshots
at 1366 and 1280, cards contain their tables; Latin digits, local dates.

## Out of scope (explicitly)

- Column drops (`contractor`, `engineer_name`, `pm_name`, `gps`) — later
  migration unit per the design study's 3-step ladder.
- Import RPC/template parity (v5) — follow-up unit; C1's default belongs there
  too when it runs.
- RLS/UI permission alignment (create is pmo-only in RLS, UI shows admin/ceo)
  — pre-existing, not widened or fixed here; do not touch policies.
- Survey, scope, freeze, COC wiring — separate units in the design study §H.

## Hard constraints for the implementer

1. `src/lib/**` byte-identical — run `node scripts/ui-census.mjs --check`
   before claiming done.
2. Additive only; no migrations in this unit.
3. Zero dead buttons; zero Arabic in source; existing modal titles/labels
   conventions kept.
4. `npm run build` clean; branch builds only — deploy-green means `main`.

## Review checklist (post-implementation)

- [ ] Census 19/19 unchanged; build clean.
- [ ] Grep: no writer sets `buildings.contractor`, `buildings.engineer_name`.
- [ ] Blank-beneficiary create writes client; blank-contractor building
      renders "(project)" at all three read sites.
- [ ] Derived weeks correct across month/year boundaries (local dates).
- [ ] Form-created project: ESMs present, progress no longer 0/0 pathology.
- [ ] 1366/1280 screenshots attached; Latin digits only.
- [ ] No `src/lib`, no migrations, no RLS diffs in the changeset.
