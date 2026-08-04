# COC Builder — concept and plan

**Status: CONCEPT — awaiting owner approval. Nothing here is built, no migration applied.**

Owner's goal, verbatim: *"a flexible system so the client can generate the certificates
easily."* And the composition model, verbatim: *"design it like a pool — he selects the
ESMs first, ticking ESM1 and ESM2, then selects the buildings that go in the COC, then
the attachments."*

Everything below is grounded in the live schema and the shipped code as of `fd43947`;
every claim about an RPC or table was read from `pg_proc` / `information_schema` on the
production project, not from memory.

---

## 0. What the archaeology found (and how it changes the plan)

The feature is smaller than the brief feared, because the hard part half-exists:

1. **`generate_cocs(p_project_id, p_rows jsonb)` already accepts arbitrary composition.**
   Each row is `{building_ids[], esm_codes[]}`. The wizard already calls it with explicit
   rows (`CocGenerateWizard.jsx:107`); what is rigid is only the *plan* that feeds it —
   `coc_plan_preview` expands `layout_mode × esm_groupings` into rows the user can tick
   but not compose. The builder replaces the plan, not the pipeline.

2. **`coc_plan_row` already computes `mixed_beneficiary` and `exists_coc_id`.** The
   beneficiary conflict and exact-set duplicate checks exist server-side. But the
   duplicate check only matches an *identical* set: `{B1,B2}×{E1}` then `{B1}×{E1}`
   passes silently. Pair-level overlap is the genuine hole.

3. **`coc_buildings` vs `coc_covered_buildings` — solved.** They FK different parents.
   `coc_covered_buildings → cocs` is the live one, written by `generate_cocs`.
   `coc_buildings` and `coc_esms` FK `project_documents` — the pre-0079 document model,
   0 rows on both sides, written by nothing. Dead. (One zombie consumer:
   `v_project_doc_progress` still reads them, which is why the Dashboard "COCs Signed"
   card can never move — §8.)

4. **Readiness is genuinely expressible.** `building_item_scope` holds `planned_qty`
   per (building × project_esm × sub_type); `install_log.scope_id` FKs it; since 0100
   the QA gate is off and the canonical rule is **count everything not rejected**
   (column comment, 0100:64). No proxy needed.

5. **The generator is frozen and single-building-biased.** `cocPdf.js:131`:
   `single = covered.length === 1 ? covered[0] : null` — a multi-building certificate
   prints project-level fallbacks and **blank meter/subscription/account fields**. The
   builder must surface this at preview (the `notices` channel already exists); it must
   not try to fix it.

6. **`coc_beneficiary_assignments` has 0 rows and no writer** ("reserved for a future
   TARSHID-side feature", 0087). The conflict guard is designed now, enforced now, but
   will not fire until that feature lands. `cocPdf.js` never reads beneficiaries at all.

7. **The fence (0114) covers INSERT and UPDATE, not DELETE**, and `cocs_write` is a
   role-wide ALL policy — any manager can `delete from cocs` directly, including a sent
   certificate. That is an audit hole this feature should close while it is in the area.

8. **Two layout columns, two bundling shapes** — `projects.coc_layout` (legacy, form
   control already removed) vs `coc_project_settings.layout_mode` (the live toggle);
   `coc_bundle_key` (Edit-Project editor, dead w.r.t. the live pipeline) vs
   `esm_groupings` (live, but auto-derived with no UI). The builder retires all four as
   *drivers*; §3.4 says what survives as a shortcut.

---

## 1. The concept: the pool

The unit of certification is the **pair** — one building × one ESM. The pool is the set
of pairs that are *eligible*; a certificate consumes a rectangle of that pool (its
chosen ESMs × its chosen buildings); and coverage is the pool with its consumed pairs
marked. Every scenario in the brief is a statement about pairs:

```
                         THE POOL  (building × ESM pairs)
            E1        E2        E3
   B01   [ready]   [ready]   [ 62% ]        ready      → offerable in the builder
   B02   [ready]   [ready]   [  0% ]        NN %       → installation incomplete
   B03   [COC-001] [COC-001] [ 41% ]        COC-nnn    → claimed by that certificate
   B04   [draft]   [ready]   [  —  ]        draft      → claimed by an ungenerated draft
   B05   [ready]   [ready]   [  —  ]        —          → no scope: nothing planned here
```

**The builder** composes one rectangle per run:

```
  Step 1 · ESMs          Step 2 · Buildings         Step 3 · Attachments & preview
┌───────────────┐      ┌────────────────────┐      ┌──────────────────────────────┐
│ ☑ E1 Lighting │  ──▶ │ only buildings     │  ──▶ │ per-certificate attachment    │
│ ☑ E2 Controls │      │ with ALL selected  │      │ set, seeded from the project  │
│ ☐ E3 AC  (2)  │      │ ESMs ready; search,│      │ default · near-full-screen    │
│               │      │ filter, select-all │      │ PDF preview · notices         │
└───────────────┘      └────────────────────┘      └──────────────┬───────────────┘
        │ counts show how many buildings              Generate ───┘
        │ each ESM choice would admit                 (numbers allocated here,
        ▼                                              never earlier)
   "E3 (2)" = only 2 buildings ready for E3
```

**State transitions** (unchanged — the existing fence and RPCs own them):

```
 builder ──generate_cocs──▶ draft ──mark_coc_generated──▶ generated ──mark_coc_sent──▶ sent
                              │                                                          │
                              │ delete (drafts only, §5)                          log_coc_feedback
                              ▼                                                          ▼
                        (pairs released)                       approved / accepted_with_comments / rejected
                                                                                          │
                                              superseded ◀──create_coc_revision── (rejected | awc)
                                              (claim stays with the lineage: same root_coc_id)
```

## 2. Eligibility — the rule, stated exactly

Pair (building **B**, ESM **E**) of project **P** is **in the pool** when:

- `B.project_id = P`, `B.status_override` is not `archived`, `B.scope_status = 'in_scope'`
  (candidates and surplus buildings are not certifiable);
- E is in `project_esms(P)` and not archived;
- **scope exists**: Σ `planned_qty` over `building_item_scope` rows for (B, E) > 0
  — lines with `planned_qty = 0` neither block nor qualify;
- **installation is complete**: for *every* scope line s of (B, E),
  Σ `install_log.qty` where `scope_id = s` and `qa_status <> 'rejected'` ≥ `s.planned_qty`
  (the 0100 rule: not-rejected counts, `pending_qa` counts).

It is **offerable** when additionally no live claim exists on it (§3.2).

This is the strictest rule the data supports and it needs no proxy. What the data
**cannot** express — said plainly rather than invented: *delivery* completeness per
building (0066 moved deliveries to the warehouse pool; per-building draw is exactly
`install_log`, so installation completeness already subsumes it) and *inspection or
handover* status (no table carries it). If certification is ever meant to wait on a
signed WIR or handover record, that is new data, not a new query — flagged, not faked.

## 3. Data design

### 3.1 What already carries the feature (no change)
`cocs` (numbering, revision chain, status), `coc_covered_buildings` (which buildings a
certificate covers — stays at building grain because every certificate is a rectangle;
its ESM set is `cocs.esm_codes`), the fence trigger, and all six workflow RPCs.

### 3.2 One new table — the claims ledger

```sql
create table coc_claims (
  project_id  uuid not null references projects(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  esm_code    text not null,
  root_coc_id uuid not null references cocs(id) on delete cascade,
  primary key (building_id, esm_code)          -- THE invariant: a pair is claimed once
);
```

- Written **only** by `generate_cocs` (one row per pair of the new certificate's
  rectangle), inside the fence GUC. RLS: select via `can_read_project`; no
  insert/update/delete policy for clients at all — RPC-only, definer.
- Keyed by **root_coc_id**, not coc_id: `create_coc_revision` keeps `root_coc_id`, so a
  revision inherits the lineage's claim with **zero writes** — the chain in scenario 6
  is intact by construction.
- Deleting a draft root cascades its claims → the pairs return to the pool. Deleting a
  draft revision goes through `restore_prior_coc_revision` as today; the claim stays
  with the lineage.
- The primary key **is** the double-counting proof: two certificates claiming one pair
  is a unique violation no UI, no race, and no direct-SQL caller can get past.

Why not re-grain `coc_covered_buildings` to pairs instead? Because per-certificate
coverage is always rectangular (the builder composes rectangles), the array + buildings
representation is already consumed by `cocPdf.js`/`coc_plan_row`, and a second purpose
(cross-certificate uniqueness) deserves its own table rather than overloading theirs.

### 3.3 One new read RPC — the pool

`coc_pool(p_project_id) → table(building_id, building_code, building_name, esm_code,
planned bigint, installed bigint, ready bool, claim_root uuid, claim_coc uuid,
claim_status text)` — stable, definer-free, one query joining scope, install sums,
claims and lineage-head status. Single source of truth for: Step 1's per-ESM counts,
Step 2's building list, the coverage view, and the empty states. The UI never computes
eligibility itself — it renders what this RPC says (see self-review, §9).

### 3.4 Extended RPC — `generate_cocs` learns to say no

Same name, same fence, extended body (an RPC change is inside the constraint —
"extend through the RPCs"):

- verifies **every pair** of every row against the same eligibility predicate the pool
  uses — a non-ready pair fails the row with
  `{row: i, error: 'not_ready', pairs: [...]}` rather than a silent skip (scenario 5);
- refuses a row whose buildings span more than one distinct non-null
  `beneficiary_name` — `{error: 'mixed_beneficiary', names: [...]}` (scenario 7;
  guard live now, firing only when TARSHID data arrives, §0.6);
- inserts the claims; a unique-violation (concurrent generate) is caught and returned
  as `{error: 'already_claimed', pairs: [...]}` — the loser of the race gets told
  exactly which pairs, not an exception;
- per-row results in the return jsonb; valid rows still succeed when other rows fail.

### 3.5 What becomes dead — named, not dropped (Constraint 5: additive only)

| Object | Why dead | Action now | With owner sign-off later |
|---|---|---|---|
| `coc_project_settings.layout_mode` + CocHome toggle | the builder is the layout decision | toggle removed from UI | column stays |
| `coc_plan_preview` / `coc_plan_row` | replaced by `coc_pool` + builder rows | no callers left | drop |
| `projects.coc_layout`, `default_coc_plan` | legacy path, form control already gone | untouched | drop with view fix |
| `coc_buildings`, `coc_esms` (→ `project_documents`) | pre-0079 model, 0 rows, no writer | untouched | drop |
| `coc_bundle_key` + EsmBundles editor (`ProjectModals.jsx:534`) | dead w.r.t. live pipeline (R19) | editor removed from UI | column stays |
| `esm_groupings` | no longer *drives* anything | **kept** — becomes Step 1's quick-pick chips |

Bundling, answered per the brief's "only if it removes clicks": Step 1 renders the
auto-derived groups (`defaultEsmGroupings`: lighting pack, each AC standalone) as one-tap
chips above the ESM checkboxes. One tap replaces N ticks; no new persistence, no new
concept to explain; the chips are seeded from data that already exists. No saved-bundle
editor — the field nobody understands stays unbuilt.

## 4. Numbering, revisions, supersession — stated exactly

- **A number is allocated at Generate** — `seq = max(seq)+1`, `code = <PROJ>-COC-nnn`,
  inserted as `draft` — and never during builder composition. An abandoned builder
  session costs nothing and leaves nothing.
- **An abandoned draft**: deleting the newest draft frees its seq for natural reuse
  (`max+1`); deleting a mid-sequence draft leaves a permanent gap, **and the gap is
  auditable** — `audit_cocs` fires on DELETE, so "what was COC-007?" has a recorded
  answer. That is the honest trade; renumbering existing certificates to close gaps
  would be worse than the gap.
- **Revision keeps `seq`/`code`/`reference_no`**, increments `revision`, supersedes the
  source, copies coverage, inherits the claim (§3.2). Unchanged from today; the builder
  adds nothing to this path and takes nothing from it.

## 5. The DELETE fence (defect fixed while in the area)

`cocs_state_fence` handles INSERT/UPDATE only and `cocs_write` is FOR ALL — today a
manager can `delete from cocs where status='sent'` and history is gone; claims would
cascade with it. Extend the fence with a DELETE branch: outside the GUC, only
`status = 'draft'` rows may be deleted. Drafts remain deletable exactly as the UI does
now; issued certificates become supersedable-only. This is protective, one commit,
proven by DO-block.

## 6. The ten scenarios, expressed

1. **One ESM, all buildings** — tick E1, select-all in Step 2, one certificate.
2. **All ESMs, one building** — tick all in Step 1; Step 2 shows buildings where *all*
   are ready; pick the one.
3. **Two ESMs bundled, subset of buildings** — the owner's own example; or one tap on
   the lighting-pack chip.
4. **Progressive certification** — Step 2 defaults to *uncovered* pairs; after each
   run the pool shrinks; the claims PK makes double-counting impossible rather than
   merely discouraged.
5. **Mixed readiness** — a not-ready pair is *visible but not offerable* in Step 2
   (shown with its %, unticked and untickable), and `generate_cocs` re-verifies, so
   even a stale client gets a named refusal, never a silent skip.
6. **Revision** — untouched path; claim inherited via `root_coc_id`; chain provably
   intact (test T4).
7. **Different beneficiaries** — Step 2 annotates each building's beneficiary once
   data exists; a mixed selection blocks the footer with the names in conflict; the
   RPC refuses regardless of the UI (test T3).
8. **Single-building project** — a forced choice is no choice: steps with exactly one
   option auto-select and collapse to a summary chip; the user lands on attachments +
   preview directly. Near-zero ceremony without a special code path.
9. **Large project** — Step 2: search box, region/status filter, select-all-in-view,
   live "N of M selected" count, virtualized list. ESM columns are naturally few.
10. **Nothing eligible** — the empty state names the *cause* per the pool: "No
    buildings are in scope yet" / "No installation scope has been planned" / "Closest:
    B03 × E1 at 62% installed" — what has to happen first, not "no certificates".

## 7. UI

### 7.1 Where it lives
`CocHome` keeps the pipeline (needs-action / waiting / done) and gains the **coverage
view** above it — the pool matrix of §1, rendered as rows = buildings, columns = ESMs,
cells linking to their certificate or showing % / —. Collapsible; summary line always
visible: "**14 of 36 pairs certified · 6 in drafts · 9 ready · 7 not ready**" — the
"what is left?" answer at a glance. The layout-mode toggle goes; "Generate" opens the
builder.

### 7.2 The builder
One modal, three steps along the top as plain step indicators (not tabs — you cannot
jump ahead past an invalid step), Back/Next, existing tokens throughout, no grey helper
paragraphs — each control's state carries the explanation (a not-ready pair shows
"62%", which *is* the reason it cannot be ticked).

### 7.3 The preview (the owner: "the preview page is small, make it bigger")
Step 3 replaces the 920px modal with a near-full-screen surface: `position: fixed;
inset: 16px`. Left rail fixed 300px (certificate list for multi-run, attachments,
notices); the right pane is the PDF `<iframe>` filling the remainder.

- **At 1366×768**: preview pane ≈ 1366 − 32 − 300 − 16 = **1018px wide × ~660px tall**.
- **At 1280×800**: ≈ **932px × ~690px**.
- An A4 page at 96dpi is 794px wide — both breakpoints show a **full page at ≥100%
  width**, versus ~560px (≈70%) today.
- Page navigation and zoom come free: the iframe hosts the browser's native PDF viewer
  (blob URL, as today). The iframe **scrolls internally**; the fixed-inset container
  cannot grow past its bounds — asserted at card level in the harness shots.
- No dedicated route needed at these numbers; if the owner wants edge-to-edge we can
  revisit, but a route adds navigation state for no width we lack.
- Multi-building notice surfaces here (§0.5): "This certificate covers 4 buildings —
  meter and subscription fields print blank (single-building template)." The generator
  stays frozen; the person signing knows before signing.

### 7.4 Attachments (defaults vs this-certificate, made obvious)
Step 3 lists the 8 attachment ids seeded from `default_attachments`. Edits apply to
**this certificate** (`attachments_checked` — client-writable by design, 0114). A
separate, unticked-by-default "Save as project default" writes the upsert the wizard
today performs silently. Two facts, two controls, no sentence needed.

## 8. Out of scope but flagged (found during archaeology, not this feature)
- Dashboard "COCs Signed" card reads `v_project_doc_progress` → legacy
  `project_documents` (0 rows): the card can never move. Fix candidate next sprint.
- `Reports.jsx:17` and `ManageEsms.jsx:30` count rejected install rows (query drops
  `qa_status`), inconsistent with the other five call sites and 0100's rule.
- `DISABLED_MESSAGE`-style drift risk: `coc_plan_preview` becomes uncalled but keeps
  compiling; §3.5 marks it for a signed-off drop rather than leaving it half-alive.

## 9. Test strategy — what proves each rule

DB-level (DO-blocks in the migrations, run as `authenticated`, fixtures created and
deleted inside the block; the pattern proven in 0119/0126/0128):

- **T1 uniqueness (the one that matters):** generate COC over {B1,B2}×{E1}; attempt
  {B1}×{E1} — must fail `already_claimed` naming the pair; then attempt via **direct
  SQL insert** into `coc_claims` — must fail on the PK. Both paths, because the brief
  is right that hiding used pairs in the UI is not enforcement.
- **T2 eligibility:** pair at 90% installed → `generate_cocs` refuses `not_ready`;
  complete the install rows → succeeds.
- **T3 beneficiary:** seed two assignments with different names; mixed selection →
  `mixed_beneficiary` with both names; identical names → passes.
- **T4 revision chain:** generate → reject → revise; assert claim count unchanged,
  `root_coc_id` constant, source `superseded`, pair still absent from the pool.
- **T5 release:** delete the draft root → claims gone → pair offerable again.
- **T6 DELETE fence:** delete on a `sent` row → exception; on a `draft` → allowed.
- **T7 zero-planned:** scope line with `planned_qty=0` neither blocks nor qualifies.

UI-level: census regen (`9J-acceptance.md`), harness screenshots at 1366/1280 of the
three steps + coverage view + empty state, build + live smoke on main.

## 10. Ordered commit plan

| # | Unit | Proof | Risk |
|---|---|---|---|
| 1 | `coc_claims` + RLS + backfill (trivially empty: `cocs` has 0 rows) | T1-direct, T5 | none — additive, nothing reads it yet |
| 2 | `coc_pool` RPC | T2 fixtures, T7 | none — read-only |
| 3 | `generate_cocs` extension + DELETE fence branch | T1-RPC, T2, T3, T6; re-run red-team-adjacent DO-blocks | medium — touches the fenced workflow; mitigated: same GUC, all existing tests re-run, revision path untouched (T4) |
| 4 | Builder UI + coverage view + preview enlargement; layout toggle and EsmBundles editor removed; census regen; screenshots | build, census, harness at both widths | medium — largest diff; `src/lib` untouched by assertion |
| 5 | Docs: this file updated to as-built; dead-object drop list handed to owner for sign-off | grep gates | none |

Each commit lands alone, provable alone; the feature is inert until commit 4 (nothing
calls the new surface before the UI does).

---

## 11. Self-review (per the brief, before handover)

**Any place the UI knows a rule the database does not?**
Found one and fixed it in the design: the *first* draft had eligibility only in
`coc_pool`, with `generate_cocs` trusting the rows it was sent — a stale or hostile
client could generate over a non-ready pair. §3.4 moves the same predicate inside the
RPC. Beneficiary blocking likewise exists in both places. The one rule that remains
UI-only is *cosmetic*: which pairs are ticked by default. Uniqueness never depended on
the UI at all — it is a primary key.

**Any scenario that only works if the user behaves?**
Progressive certification (4) leaned on the user selecting the right remainder; the
coverage view plus default-to-uncovered removes the reliance, and the claims PK makes
misbehaviour impossible rather than unlikely. Attachments (silent default drift in the
shipped wizard) became an explicit opt-in. The residual behavioural surface: a user can
still *choose* not to certify something that is ready — that is judgement, not error.

**Anything that would let two certificates claim the same pair?**
Adversarial walk: (a) two tabs generating concurrently — second insert hits the PK,
returns `already_claimed`; (b) direct SQL insert into `coc_covered_buildings` widening
a draft's coverage — **caught**: that table has no fence… but widening coverage without
a claims row changes nothing in `coc_claims`, so the *claims* invariant holds while
*coverage* could lie about it. Closed by adding the same GUC fence trigger to
`coc_covered_buildings` (insert/delete outside RPC → exception) in commit 3 — this
sentence exists because the self-review caught it; (c) revision — inherits, inserts
nothing; (d) delete-and-regenerate — claims cascade first, PK free again, sequence
audited. No path found with the fence addition in place.

**Honest limits:** the mixed-beneficiary guard protects a future that has no data yet
(§0.6); multi-building certificates print blank meter fields and this feature only
*warns* (frozen generator, Constraint: stop-and-ask if a scenario needs it changed —
none does, the warning suffices); eligibility equals *installed*, not *delivered and
inspected*, because installation is the only completeness the schema records (§2).

**Stop.** The owner approves this concept before anything is built.
