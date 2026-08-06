# Backlog — named items awaiting an owner decision

Items that were **found and measured** but deliberately **not changed**, because
the change is the owner's call rather than the sprint's. Each entry states what
was measured, why it was not acted on, and what deciding either way would cost.

Named so they can be referred to without re-deriving them. Nothing here is a
commitment to build; some of these should stay unbuilt.

---

## BRANCH_WORK_READS_AS_DONE — green on a branch is not visible to the owner

**Status:** open · **process defect, not a one-off** · owner decision on the
remedy · raised after it cost three round-trips on the Add Project sprint

**The defect.** Work that lands on a feature branch is reported as complete —
truthfully, by every measure a report has — while being invisible in
production. Build green, census clean, commits pushed, proof documents
written: all real, none of it in front of the owner. The gap is silent because
nothing in the branch's own signals is wrong.

**The three instances, as evidence.**

1. Sprint 9Q(3) — `40d67ab4`, *"a deployed build that no open tab ever
   receives"*. A deploy that had genuinely landed was invisible because
   HashRouter fetches `index.html` once per tab. Cost, per the comment now in
   `src/components/BuildWatcher.jsx`: four hours and an accusation that the
   deploy had lied.
2. The `deploy` job guard — the comment in `.github/workflows/deploy.yml`
   records that every `claude/**` push produced a deploy job that failed in
   about two seconds, and that this *"was invisible for months"* because
   `concurrency: cancel-in-progress` cancelled the branch run whenever a main
   push followed it.
3. The Add Project card, this sprint. Purge and card reduction were both
   implemented, reviewed and reported complete across three exchanges. All
   four commits sat on `claude/fable-5-plan-mode-design-fa5ipe`. The owner
   opened Add Project, screenshotted an unchanged card, and was right. Worse
   than a no-op: migration 0126 had already been applied to the **live**
   database, so he was looking at an emptied dashboard wearing the old form.

**Correction to the proposed remedy — the guard already exists.** It was
recorded as *"proposed and never built"*; it is built and live.
`.github/workflows/deploy.yml` carries `if: github.ref == 'refs/heads/main'`
on the `deploy` job. So gating deploy on main is not the missing piece, and
building it again would fix nothing.

**Why that guard cannot fix this, and mildly makes it worse.** It was written
to stop branch pushes producing *failing* deploy jobs, and it succeeds: branch
runs are now build-only and **green**. A green check is exactly what reads as
"done" in a report and in a glance at the branch. The guard removed a false
red and left a true-but-misleading green. The deploy comment even says so —
*"a red X on a branch means the BUILD is broken"* — which is correct and is
also the whole trap: green means the build passed, never that anything
shipped.

**What would actually close it.** Two candidates, not equivalent:

- **A standing reporting rule** — no sprint, unit or commit is described as
  complete until it is on `main` and the deploy run is green, quoted by run
  number. Costs nothing to adopt, catches every instance above, and is the
  only one of the two that addresses the reporting behaviour rather than the
  tooling. Weakness: it is a discipline, and disciplines are what failed here.
- **Mechanical enforcement** — for example a branch run that ends by printing
  that it deployed nothing, or a required post-merge live smoke. Partly built
  as of this sprint: `.github/workflows/live-smoke.yml` now fetches the served
  bundle and asserts markers against it, which is what finally proved the card
  reduction reached production. It is dispatch-only, so it is available rather
  than automatic.

**Recommendation:** adopt the standing rule, and make the live smoke a
post-deploy step on `main` rather than a manual dispatch. The rule is the fix;
the smoke is the proof that the rule was honoured.

**Cost of deciding.** The rule is free. Wiring the smoke to run automatically
after a `main` deploy is a few lines in `deploy.yml`, plus a decision about
whether a failed smoke should mark the deploy red — which is the part worth
thinking about, since a smoke with no teeth becomes another green that means
nothing.

---

## CARD_NEGATIVE_WEEKS — a works-end before the signature computes negative weeks

**Status:** open · logged, not built · owner decision · raised by the Add Project
card reduction (Unit 2)

**Measurement.** `weeksBetween()` in `src/components/ProjectModals.jsx` returns
`Math.round(ms / (7 * 86400000))` over the contract pair, and the schedule
write-through copies that value into `total_weeks` along with
`start_date`/`end_date`. Enter a works completion date earlier than the contract
signature date and the read-only Total weeks field displays a negative number,
which is then stored. Downstream, `ProjectDetail.jsx:157` divides by
`total_weeks` for the timeline percentage and the frozen
`progressReport.js:48-56` guards with `weeks <= 0` and returns an empty
estimated completion — so nothing crashes, but the header maths goes
meaningless.

**Why it was not built.** The sprint spec defined no behaviour for an inverted
pair, and inventing validation is exactly the kind of unrequested addition the
owner's "the template is complete" instruction rules out. There is also more
than one honest fix and they are not equivalent: block the save, clamp the
display to blank, or accept the value and let a later review catch it. The
first two change what the form will accept.

**Cost of deciding.** Any variant is a few lines in one file — a guard in
`weeksBetween` or a validation branch in `save()`. Deciding whether an inverted
pair is a data-entry error worth refusing, or a legitimate intermediate state
while someone fills the form, is the owner's judgement about how the card is
used.

---

## TARSHID_PANEL_ARABIC_PLACEHOLDER — an Arabic placeholder outside the sanctioned list

**Status:** open · logged, not changed · pre-existing · surfaced by Unit 2

**Measurement.** The edit-mode TARSHID INFO panel carries
`placeholder="اسم الجهة"` on the Entity name (Arabic) input in
`src/components/ProjectModals.jsx`. `docs/Constraints.md` #1 requires zero
Arabic in component source and names exactly two sanctioned exceptions —
`src/lib/docPdf.js` (COC bilingual labels) and `public.buildings.name_ar` (a
data identifier). A UI placeholder is neither, so this reads as a standing
violation of the repo's first constraint.

**Provenance — it is inherited, not introduced.** `git log -S` places it in
`97afc96` (9J(4), 2026-08-01), before this sprint. Unit 2 only gated the panel
to edit mode; it did not add, move or edit the string.

**Why it was not changed.** It is outside the sprint's scope (the card
reduction touched add-mode gating, not the panel's contents), and the fix is
not purely mechanical: the field's whole purpose is to capture the Arabic
entity name, so the honest options are an English instruction ("entity name in
Arabic"), a Latin-script example, or adding this input to the sanctioned
exceptions with a reason. That is a constraints decision, not a typo fix.

**Cost of deciding.** One string, or one line in `docs/Constraints.md`. What is
not cheap is discovering later that the exception list and the source disagree
and having to re-derive which is authoritative.

---

## ROLE_AVATAR_CONTRAST — role-coloured avatar initials fall short of AA

**Status:** open · logged, not changed · owner decision

**Measurement.** `Avatar` (`src/components/ui.jsx`) paints white initials
(`--surface-1`, `#FFFFFF`) on a solid role colour from `ROLE_COLOR`
(`src/lib/constants.js`). Contrast, WCAG 2.1 relative-luminance formula, white
against each role colour as shipped:

| role | colour | white-on-colour | AA normal text (4.5:1) |
| --- | --- | --- | --- |
| `progm` — Program Manager | `#0891B2` | **3.68:1** | ✗ |
| **`pmo` — PMO** | **`#A0762B`** | **4.10:1** | ✗ |
| `plane` — Planning Engineer | `#DB2777` | 4.60:1 | ✓ |
| `projm` / `proje` | `#B45309` | 5.02:1 | ✓ |
| `proco` | `#9333EA` | 5.38:1 | ✓ |
| `ceo` | `#0F766E` | 5.47:1 | ✓ |
| `procm` | `#6D5A8E` | 5.99:1 | ✓ |
| `admin` | `#56534B` | 7.68:1 | ✓ |
| *(no role — `--avatar-bg` default)* | `#666670` | 5.68:1 | ✓ |

Two of the nine fail AA for normal text: **PMO brass at 4.10:1** — the one the
owner sees on his own avatar in the shell every session — and **Program Manager
cyan at 3.68:1**, which is actually the worse of the two. Both clear AA-large
(3:1); neither clears 4.5:1.

Whether 4.5:1 is even the right bar is part of what there is to decide. The
initials are 700-weight at `size × 0.38` — 11px at the 28px avatar, 15px at the
40px Settings avatar. AA-large's 3:1 applies at 18.66px bold and up, so the
large-text exemption does **not** cover these at any size the app actually uses.
The 4.5:1 bar is the applicable one, and both colours miss it.

**Why it is not being changed here.**

1. **It is inherited, not introduced.** `ROLE_COLOR` has carried these exact nine
   hexes since v1.5, where the comment records them as *"identical to the
   design's `people{}` colors (and our DB profiles)"*. 9J recoloured the whole
   application and did not touch this map — verified: the map is unchanged
   across every 9J commit. So this is not a regression the reskin introduced,
   and fixing it is not reskin clean-up.

2. **The colours are load-bearing outside the avatar.** They are the design's
   people palette and are mirrored in the DB profiles. Darkening PMO brass to
   reach 4.5:1 moves it away from `--accent` (`#A0762B` — the same brass), which
   is the application's primary accent. The avatar and the accent are currently
   the same value on purpose.

3. **There is more than one honest fix, and they are not equivalent.** Darken
   the two failing colours; or keep the colours and change the initials (a dark
   ink on a tinted fill, which is the 9K(3) H3 move applied a second time); or
   accept the ratio and record the exemption. The first changes brand colour,
   the second changes the avatar's visual weight everywhere, the third changes
   nothing. That is a design call.

**Deliberately not conflated with 9K(3) H3.** That defect was different in kind:
`Avatar` was defaulting its fill to `--text-3`, a **40 %-alpha** ink meant for
de-emphasised text, so the fill composited against whatever was behind it and
the result was unpredictable. It was fixed with a solid `--avatar-bg` at 5.68:1
and it is fixed. This item is about the *role* colours passed explicitly at 11
call sites, which H3 never touched.

**Call sites affected** (11, all passing `roleColor(...)` explicitly):
`Shell.jsx` ×2, `Settings.jsx` ×4, `Escalations.jsx` ×2, `Tasks.jsx`,
`BuildingChat.jsx`. The three `<Avatar>` uses that pass no colour take
`--avatar-bg` and are not affected.

**Cost of deciding.** Option 1 is a two-hex edit in `ROLE_COLOR` plus a check
that nothing else keys off those literals. Option 3 is a comment. Neither is
large. What is not cheap is doing it twice because the palette was changed
without the owner.

---

## ESCALATION_AGE_VISIBILITY — an old escalation should get louder, not quieter

**Status:** open · logged, not built · owner decision · raised by 9N

**The problem.** An escalation that has been open a long time is the most
important row on the Attention List and on the Escalations page, and today it is
presented identically to one raised an hour ago. `Dashboard.jsx` colours the AGE
cell by **severity** (`critical` red, `high` amber, everything else grey) and
orders escalations by severity descending. Age is rendered as text and is
otherwise inert: nothing sorts by it, nothing marks it, nothing escalates it.
So a `medium` escalation open for six weeks sits below a `critical` raised this
morning, in grey.

**Why this is logged rather than built.** It came out of 9N as the *correct*
answer to a problem whose *incorrect* answer — auto-closing escalations by age —
was refused outright (`docs/9N-decisions.md` N4). Auto-closing by age deletes
precisely the signal the escalation exists to raise. Making it more visible is
the opposite move and the right one, but it is a presentation change with real
design questions the schema sprint has no business answering:

- **What threshold?** Flat (e.g. 7 days), or per severity — a `critical`
  unanswered for 24 hours is arguably worse than a `low` unanswered for a month.
- **Sort, badge, or both?** Sorting by age subordinates severity, which is the
  current primary key of the list and was chosen deliberately. A badge preserves
  the severity order and adds a second axis. Both is possible and busier.
- **Which surfaces?** The Dashboard's Attention List, the Escalations page, or
  both. The Escalations page is tabbed by status and has its own conventions.
- **Does it feed notifications?** A threshold crossing is a natural notification
  trigger (`escalation_ageing`), which would be a seventh notification type and
  needs its own opinion about who is told and how often.

**Not the same as the escalation chain.** `escalations_derive_chain` (0015) and
`level` already model escalating *up the hierarchy*, which is a person's
deliberate act. This item is about time passing while nobody acts, which is the
thing nothing currently represents.

**Cost of deciding.** Any variant is a small change confined to `Dashboard.jsx`
and/or `Escalations.jsx` — the age is already computed and rendered at both
sites, so it is a threshold constant plus a style branch, and a comparator if
sorting changes. Deciding the threshold is the expensive part, and it is a
judgement about how this programme is actually run, which is the owner's.

---

## SEARCH_CROSS_SCRIPT — `masjid` does not find `مسجد`

**Status:** open · logged, not built · owner decision · raised by 9Q(2)

**What works today.** Global search matches Arabic **and** English, because it
searches the Arabic columns directly — `buildings.name_ar` (92 of 815 rows carry
one) and `projects.entity_name_ar` — alongside the Latin ones. Someone who typed
the data in Arabic finds it in Arabic; someone who typed it in English finds it
in English. Digits fold both ways already: `toLatin` normalises Arabic-Indic
(٢) and Persian (۲) numerals, so `١.٥` and `1.5` are the same query.

**What does not work.** There is no letter-level transliteration between the
scripts, so a Latin spelling of an Arabic word will not match the Arabic string
and vice versa: `masjid` does not find `مسجد`, `Asir` does not find `عسير`.

**Why it is not built.** People search in the script they entered the data in,
so the gap is narrow in practice — and closing it properly is not a small
change. Arabic↔Latin transliteration has no single correct mapping (`ق` is q/k/g
by dialect; short vowels are unwritten and must be guessed; `ع` has no Latin
letter at all), so any implementation is a table of judgement calls that will be
wrong for some names and will need tuning against real data. That is a piece of
work with its own acceptance criteria, not a helper function.

**If it is ever built,** it belongs in `src/lib/search.js` beside `toLatin` and
must serve the survey catalogue picker too — both call sites share one matcher
and that must not be forked to add this.

---

## MYTASKS_EMAIL_NOTIFICATIONS — the bell rings, the inbox does not

**Status:** open · logged, not built · owner decision · deferred at 0104, re-affirmed by 9R

**What exists.** Six notification types fire today, all written by SECURITY
DEFINER triggers so nothing depends on a client remembering to write them:
`task_assigned`, `task_blocked`, `task_done`, `escalation_raised`,
`escalation_acknowledged`, `escalation_resolved` (`0104`). They land in
`notifications` and surface on the bell in the top bar. Verified live at 9R(1):
a reassignment inside a rolled-back transaction produced the `task_assigned` row
for the new assignee, written by `tasks_notify()`, with no client involvement.

**What does not exist.** Any of it reaching a person who is not looking at the
application. There is no mail provider configured on this project, no adapter,
and — deliberately — no stub. A stub would be a dead button under
Constraints.md #2, and a half-wired mail path is worse than an absent one
because it looks delivered.

**Why it is not built.** Standing up a mail provider is an owner decision with a
cost and a vendor attached, not a side effect of a UI sprint. It also carries
questions no sprint should answer alone: which of the six types are worth an
e-mail at all (`task_assigned` almost certainly; `task_done` to the raiser,
probably not every time), whether they batch or send immediately, whether people
can opt out per type, and what the from-address and reply behaviour should be
for a programme where the recipients are the owner's own staff.

**Why deferring costs nothing later.** Every `notifications` row already carries
the full payload an e-mail would be rendered from — recipient, actor, type, body
preview, and the task / escalation / project / building links. Nothing has to be
re-modelled when the decision is made; the work is a sender that reads rows that
already exist.

**Cost of deciding.** The provider choice and the per-type policy are the
expensive parts. The implementation is a scheduled function over
`notifications`, plus a `sent_at` column so a row is not mailed twice — additive,
and small.

---

## MYTASKS_ENGINEER_READ_WIDENING — a site engineer cannot see tasks on their own building

**Status:** open · logged, **explicitly not built** · owner decision · raised by 9R

**What `tasks_read` does today** (live, verified 9R(1)):

```
auth_role() in ('ceo','pmo')
  or assigned_to_id = auth.uid()
  or created_by_id  = auth.uid()
  or is_in_subtree(auth.uid(), assigned_to_id)
  or is_in_subtree(auth.uid(), created_by_id)
```

Reach is the **reporting tree**, plus a two-role programme-wide carve-out. 9R
adds one more clause (0125, amendment D): a project's `pm_id` may read tasks
carrying that `project_id`. That is responsibility-based reach, and it is
**read-only** — no write, reassign, status or edit authority widens with it.

**The gap.** A proje at the bottom of the tree sees their own tasks and nothing
else. If a task is raised on a building they are the assigned engineer for, but
assigned to someone outside their (empty) subtree, they cannot see it exists.
`building_engineers` already models that relationship and is already the basis
of building-level scope elsewhere in the schema, so the widening is mechanically
available: add a clause for `building_id in (select building_id from
building_engineers where engineer_id = auth.uid())`.

**Why it is deliberately not built.** Three reasons, none of them "it is hard".

1. **It is a different axis of authority from the one 9R is conforming.** The
   whole sprint's governance story — proved end to end in `docs/9R-conformance.md`
   — is subtree-based, and amendment D widened it along exactly one axis the
   owner named. Adding a second, unrequested axis in the same sprint means the
   next person cannot tell which widening was asked for.

2. **Read is not where it would stop.** An engineer who can *see* a task on
   their building will reasonably expect to comment on it, mark it blocked, or
   be assigned it. Each of those is a separate fence, and none of them is
   subtree-shaped. Opening the read without deciding the rest invites a UI that
   shows work nobody can act on — the exact failure mode 9R exists to prevent.

3. **The blast radius is not obviously small.** `building_engineers` is a
   many-to-many; an engineer on several buildings across several projects could
   gain visibility of a wide set of tasks at once. That is possibly correct and
   possibly a surprise, and the difference is a judgement about how this
   programme is actually staffed — the owner's, not a sprint's.

**Not the same as amendment D.** D is `projects.pm_id` — one named person with
programme responsibility for one project. This is a per-building assignment
table with a much broader membership. Conflating them would smuggle the second
in under approval given for the first.

**Cost of deciding.** The read clause itself is a few lines in an additive
migration, verifiable the same way 9R verifies everything else. What is not
cheap is deciding whether visibility implies any authority, and reversing it
afterwards: a widened read that people have started relying on is politically
hard to narrow again, even when narrowing is correct.

---

## MYTASKS_DEMO_CREDENTIAL_ROTATION — a shared password that three proofs now depend on

**Status:** open, owed. Raised 9R(7e), and deliberately raised *after* the thing
that made it urgent went away.

**What happened.** Three proofs in sprint 9R — realtime propagation under two
seconds, the full-page screenshot rig, and the truncation banner rendering —
were recorded as blocked because no user password was available to sign in with.
The refusal to mint one was correct on the information held at the time, but it
rested on a factual premise that was wrong: the objection assumed a production
project holding real client programme data. The owner corrected it. This is a
demo instance, the accounts are the `ies.demo.local` set, and the content is
demo data. On that basis the owner authorised using the existing shared demo
credential to unblock the three proofs, with rotation to follow.

**The obligation.** The credential is rotated after 9R. It has not stopped being
worth doing merely because it stopped being urgent — a shared password that
several people know, that now has a written record of being used to unblock a
test, is exactly the kind of item that survives on a backlog precisely because
nothing is currently failing because of it.

**What rotation touches.** The credential lives only in a git-ignored env
(`.env.local`, matched by `*.local`) and in whoever holds it. It is not in the
repository, not in `.env.production`, and not injected by `deploy.yml` — so
rotation is changing the password on the demo accounts and redistributing it,
not a code change. The scripts that consume it (`scripts/ui-shots.mjs`,
`scripts/tasks-governance-test.mjs`, `scripts/tasks-realtime.mjs`) read it from
the environment and need no edit.

**Why it is named rather than assumed.** If this instance ever stops being a
demo — real buildings, real people, real programme data — the risk calculus that
made using a shared credential reasonable inverts, and the rotation stops being
hygiene and becomes a prerequisite. Naming it keeps that reversal visible
instead of leaving it to be rediscovered.

---

## ESM_PROGRESS_VS_PLAN — the report that was a card advertising itself

**Status:** open · **an idea, kept; the card that carried it, removed** · owner
decision on whether it is ever built · raised by the A4 invented-value audit

**Where it came from.** `src/pages/Reports.jsx` shipped a panel reading
`[ DESIGNER SUGGESTION ] · ESM Progress vs Plan` on the live Reports screen,
below the two working report builders. It described a feature that does not
exist, in the same visual language as the ones that do.

**Why it was removed rather than left.** The owner walks the site to confirm the
system is correct. A styled card on a shipped screen is a claim that something
is there. This one had no control, so it also failed Constraints #2 in spirit —
not a dead button, but a dead card, which is the same lie with fewer moving
parts. A design idea belongs in a backlog, not in the product.

**The idea itself, preserved verbatim from the card.** *"Per-ESM planned vs
actual installed quantities over time, with delay attribution by building.
High-value for the Planning Engineer's delay analysis."*

**What building it would actually cost, now that the arithmetic exists.** The
portfolio S-curve landed in this same commit as `sCurveSeries()` in
`src/lib/progressReport.js` — cumulative capped installs by `entry_date` against
planned quantity spread over `projects.start_date .. total_weeks`. Per-ESM is
that same function partitioned by `building_item_scope.project_esm_id`, and
per-building delay attribution is the same partition by `building_id`. So the
data layer is no longer the hard part; the open questions are presentational
(how many series read on one chart before it stops being legible) and semantic
(what "delay" means when a project's plan is a linear ramp rather than a real
resource-loaded schedule — a linear ramp can call a team late in week 2 for
reasons that have nothing to do with the team).

**Why that second question is the real blocker.** Attribution asserts fault. A
linear distribution of planned quantity is a fair enough shape for a programme
S-curve, where the errors average out, and a poor basis for telling a specific
building it is behind. Building this on the current plan model would produce
confident per-building delay figures derived from an assumption nobody
approved — the same defect class this audit exists to remove. If it is built,
it needs a real per-building schedule first, or it needs to describe itself as
variance-from-linear rather than delay.
