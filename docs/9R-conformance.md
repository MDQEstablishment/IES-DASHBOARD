# 9R — My Tasks conformance: what is already true, proven before anything is built

Sprint 9R adds edit, trash, reassignment, a project/ESM picker and a nine-column
performance widget to a page that has been in production since 9G. Every one of
those is a **control rendered on top of a fence** — a button that offers an
action the database is supposed to permit, or withhold.

The inverted risk of this sprint is therefore not that the backend is weak. It is
that the UI ends up quietly **disagreeing** with a backend that is sound: a
control shown to an actor the trigger will reject, or a scope label claiming a
reach that RLS does not grant. Both failures look fine in a screenshot and are
only discovered by a user being told "no" after being shown "yes".

**This document is the sprint's complete record.** It began as the 9R(1)
pre-flight — sections 0 to 3 are that original work, unchanged: the drift check,
what was found true of the live database before anything was built, and the six
proofs run against it. Sections 4 onward were written at the end of the sprint
and cover what was actually delivered: the amendments' disposition, the commit
ledger, a verification table marking every claim measured, proven or blocked,
and what an owner should know that is not obvious from the diff.

The method throughout was the same one section 0 establishes: read the live
database rather than the migration file, push on the fence rather than describe
it, and never write down a number that was not observed. Sections 7 and 8 are
where that discipline costs something — three proofs are blocked and deploy is
pending, and none of them is softened.

Everything below was executed on 2026-08-03 against project `mzuyvajefqkmaxludijm`.

---

## 0. Drift check — is the repo still describing the live database?

**Ruling: this is a hard pre-flight, and nothing about the five triggers is
assumed beyond their existence and wiring.** The reason is precedent: at 0122
the live database was found to be *ahead* of the repository, so a migration file
is evidence of intent, not evidence of state. Reading 0102 and concluding that
`tasks_reassign_guard` behaves a certain way is a guess until the live body is
read back.

`pg_get_functiondef` was pulled for all five and diffed against the repo source.
`pg_get_functiondef` reconstructs from the catalog and drops comments, so the
comparison is over executable logic only — which is the thing that matters.

| function | repo source | live body vs repo |
| --- | --- | --- |
| `is_in_subtree(uuid,uuid)` | `0010_security_helpers.sql` | **identical** — same recursive CTE over `profiles.manager_id`, same `p_manager is distinct from p_report` tail, `stable security definer set search_path=''` |
| `tasks_status_guard()` | `0102_task_governance.sql` | **identical** — same three legal-edge clauses, same assignee-only-done / creator-only-cancel pair, same `me is not null` skip, same `done_at` coalesce on both branches |
| `tasks_reassign_guard()` | `0102_task_governance.sql` | **identical** — same no-op-when-unchanged short circuit, same `me is null` service-role skip, same null-assignee refusal, same `= me or is_in_subtree(me, NEW.assigned_to_id)` test |
| `tasks_notify()` | `0104_notifications_tasks_escalations.sql` | **identical** — insert→`task_assigned`, assignee-changed→`task_assigned`, status→`task_blocked` / `task_done` |
| `audit_trigger_fn()` | `0011_audit_trigger_fn.sql` | **identical** — same generic summary construction, same best-effort IP sub-block |

**Result: no drift.** The repository is a faithful description of live for every
guard 9R will build on. Nothing is blocked; the sprint proceeds.

Trigger wiring was read back from `pg_trigger` in the same pass, because a
correct function attached to nothing is the failure mode a body diff cannot see:

```
audit_tasks               AFTER INSERT OR DELETE OR UPDATE ... EXECUTE FUNCTION audit_trigger_fn()
tasks_notify_trg          AFTER INSERT OR UPDATE        ... EXECUTE FUNCTION tasks_notify()
tasks_reassign_guard_trg  BEFORE UPDATE                 ... EXECUTE FUNCTION tasks_reassign_guard()
tasks_set_updated_at      BEFORE UPDATE                 ... EXECUTE FUNCTION set_updated_at()
tasks_status_guard_trg    BEFORE INSERT OR UPDATE       ... EXECUTE FUNCTION tasks_status_guard()
```

---

## 1. Findings verified live

### 1.1 There is no DELETE policy on `tasks`, and that is load-bearing

`pg_policy` for `tasks` returns exactly three rows — `tasks_read` (`r`),
`tasks_ins` (`a`), `tasks_upd` (`w`). **Zero** with `polcmd = 'd'`.

The `DELETE` *grant* to `authenticated` is present. That combination is the
whole design: the statement is syntactically permitted and matches no rows, so
it silently affects nothing rather than erroring. Amendment A depends on this
absence — Trash is a soft delete precisely because a hard one is unreachable,
and rows plus their audit history survive forever.

**This is why 9R must never seed throwaway rows into the live database.** There
is no way to remove them afterwards.

### 1.2 Both halves of §7 enforcement are live

The spec asks for two things that are easy to conflate: a legal status *graph*,
and *per-actor authority* over particular edges. Both exist, in one trigger:

- graph — `open → {in_progress, blocked, cancelled}`, `in_progress → {blocked,
  done}`, `blocked → {in_progress, cancelled}`; `done` and `cancelled` are
  terminal. Anything else raises `check_violation`.
- authority — `done` requires `auth.uid() = NEW.assigned_to_id`; `cancelled`
  requires `auth.uid() = NEW.created_by_id`. Both raise
  `insufficient_privilege`.

`Tasks.jsx`'s `EDGES` map (line 47) and `nextStates()` (line 57) already mirror
both halves, which is why the page has not been offering illegal moves. Keeping
that mirror exact is a standing obligation for the rest of the sprint.

### 1.3 §8 guards are live, including the one that closes the policy's own gap

`tasks_reassign_guard` enforces down-only assignment. It matters that this is a
**trigger** and not a policy clause: `tasks_upd`'s `USING`/`WITH CHECK`
expression is

```
assigned_to_id = auth.uid() OR created_by_id = auth.uid() OR is_in_subtree(auth.uid(), assigned_to_id)
```

and the middle branch passes **regardless of who the new assignee is**. The
policy cannot be tightened, because it is simultaneously the read-gate for the
row. Proof (f) below exercises exactly this.

The service-role convention holds in both guards: every actor check sits behind
`if me is not null`, so maintenance and service-role contexts are unaffected.
Any guard added in 9R(3) must preserve this.

### 1.4 Zero client-side audit writes

`audit_log` carries two policies, both `SELECT`, both `auth_role() = any
(array['pmo','ceo'])`. There is **no INSERT policy**, so the table is
append-only by trigger and unforgeable from a session.

Every reference to `audit_log` in `src/` is a read:
`Shell.jsx:113`, `Settings.jsx:68`, `Dashboard.jsx:52`, `BuildingDetail.jsx:61`
(all `useLiveQuery`), plus `search.js:131` where it appears in the *forbidden*
table list. No write path exists in the client, and proof (g) in the harness
asserts one cannot be improvised.

Today's summary is the generic form — `USER-A update on tasks
#40c36e66`, captured live in §2b. Amendment B requires summaries that **name
what changed**; that is 9R(3)'s `audit_tasks_fn()`, and this line is the
before-picture it will be measured against.

### 1.5 The Delegated tab already exists

`SCOPES.delegated` (`Tasks.jsx:23-27`) filters server-side with
`.eq('created_by_id', me).neq('assigned_to_id', me)` — tasks you raised and gave
to someone else. It is a real server-side scope, not a client filter over a
wider fetch. Nothing in 9R needs to add it; 9R(2) only changes *when* it renders
(subtree non-empty), per D4.

### 1.6 Realtime publication includes `tasks`

`pg_publication_tables` shows `supabase_realtime` carrying `public.tasks`,
`public.notifications` and `public.escalations`. The <2s cross-session
propagation target in 9R(7) is therefore a measurement, not an integration —
the transport already exists.

---

## 2. Proof transcript

Executed via Supabase MCP `execute_sql`. Each proof is one transaction that sets
`role authenticated` and a `request.jwt.claims` GUC, performs the mutation
inside a `DO` block that traps the error into a custom GUC, reads it back, and
ends in `ROLLBACK`. **Nothing persisted.**

The GUC shape was verified before any proof was trusted:

```sql
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','57f8003a-…','role','authenticated')::text, true);
select auth.uid(), auth.role(), public.auth_role();
→ 57f8003a-75ff-4df0-992f-0b34ad887bb6 | authenticated | projm
```

`auth.uid()` reads `request.jwt.claims->>'sub'` on this project, so the
simulated actor is the real one.

**Actors** (live `profiles`, live org chart):

| | uuid | position |
| --- | --- | --- |
| USER-A · projm | `57f8003a-…` | the actor in every proof |
| Yousef Al-Maliki · proje | `3670a4ab-…` | strictly below Majed — `is_in_subtree` → **true** |
| Adnan · procm | `17ff4613-…` | sibling branch under pmo — `is_in_subtree` → **false** |
| Jehad · progm | `7d1419cc-…` | Majed's own manager — strictly above |

**Fixtures**, both pre-existing rows, borrowed not created:

- `40c36e66` "Client sign-off walk-through — MOI-001" — created by Majed,
  assigned to Majed, `open`.
- `a18ce5b0` "Approve MIR — Floor 1 brackets (MOI-001)" — created by **Yousef**,
  assigned to Majed, `open`.
- `7e0411f1` "Submit Method Statement — MOI-002" — created by Majed, assigned to
  **Yousef**, `in_progress`.

### (a) Manager reassigning outside their subtree → REJECTED

`a18ce5b0`, Majed → Adnan (procm, sibling branch).

```
REJECTED — sqlstate 42501 —
You can only assign work to yourself or to someone who reports to you
```

Raised by `tasks_reassign_guard`. The trigger is `BEFORE UPDATE`, so it fires
ahead of the `WITH CHECK` evaluation and is demonstrably the thing that refused.

### (b) Manager reassigning to their subordinate → ACCEPTED

`40c36e66`, Majed → Yousef.

```
ACCEPTED — 1 row(s) updated
assigned_to_id in-transaction = 3670a4ab-ba98-4bda-b0cf-82f35533d4b7
```

The converse matters as much as the refusals: a guard that rejects everything is
an outage, not a fence. Down-the-tree reassignment is exactly what the control
9R(2) adds is for, and it works.

Two side effects were read back inside the same rolled-back transaction, which
is where §1.4's before-picture comes from:

```
audit_log  → USER-A | projm | update | tasks | "USER-A update on tasks #40c36e66"
notifications → recipient 3670a4ab-… | task_assigned | "Client sign-off walk-through — MOI-001"
```

Both written by triggers, neither by a client. Rolled back.

### (c) Non-assignee marking done → REJECTED

`7e0411f1` (assigned to Yousef), Majed sets `status = 'done'`. Majed is the
creator *and* the manager above the assignee — the most privileged actor who is
still not the assignee.

```
REJECTED — sqlstate 42501 — Only the assignee can mark a task done
```

### (d) Non-creator cancelling → REJECTED

`a18ce5b0` (created by Yousef, assigned to Majed), Majed sets
`status = 'cancelled'`. `open → cancelled` is a legal edge, so the graph half of
the guard passes and only the authority half can refuse:

```
REJECTED — sqlstate 42501 — Only the person who raised a task can cancel it
```

### (e) DELETE as authenticated → 0 rows

```
DELETE returned 0 row(s) affected
rows_visible_to_majed  = 5   (unchanged)
delete_policies_on_tasks = 0
delete_grant_present   = true
```

No error, no rows. Grant present, policy absent — the intended combination.

### (f) The `tasks_upd` creator branch is not a back door → REJECTED

`7e0411f1`, Majed (its creator) → Jehad, his own manager. **Upward.**

First, the policy expression was evaluated for the proposed post-update row:

```
branch_assignee                 = false
branch_creator                  = true      ← passes here
branch_subtree                  = false
tasks_upd_with_check_would_pass = TRUE
```

RLS would have allowed it. Then the update itself:

```
REJECTED — sqlstate 42501 —
You can only assign work to yourself or to someone who reports to you
```

This is the single most important line in the transcript. It shows the trigger
catching a reassignment that the row-level policy, on its own, permits — which
is precisely why 0102 added a trigger instead of editing the policy. Any future
"simplification" that removes `tasks_reassign_guard_trg` on the theory that RLS
already covers reassignment reopens an upward-delegation hole.

### Summary

| # | assertion | outcome |
| --- | --- | --- |
| a | manager → peer/outside subtree | REJECTED · 42501 · reassign guard |
| b | manager → subordinate | **ACCEPTED** (rolled back) |
| c | non-assignee → done | REJECTED · 42501 · status guard |
| d | non-creator → cancelled | REJECTED · 42501 · status guard |
| e | DELETE as authenticated | 0 rows, no error |
| f | creator → upward reassign | REJECTED · 42501 · trigger, past RLS |

Six for six. The fences hold.

`scripts/tasks-governance-test.mjs` is the repeatable form of the same six,
driven through real signed-in sessions rather than simulated GUCs, for a CI that
has credentials. It reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
`IES_TEST_PASSWORD` from the environment, hardcodes no secret, and exits 78
(`EX_CONFIG`) with a "credentials missing" message when they are absent — so an
un-credentialled run is legible as *not run*, never as passed.

---

## 3. Deviations recorded

Recorded rather than removed, per amendment F. Both are prior deliberate
decisions, not defects discovered here.

### 3.1 `task_blocked` is a third notification event

The spec names two task notifications. The live system raises three:
`task_assigned`, `task_done`, and `task_blocked` → the person who raised the
task, added by 0104.

It stays. Blocking is the event a task-raiser most needs to hear about — it is
the trigger for the escalation bridge that `Tasks.jsx` already renders on a
blocked row ("Raise an escalation about this"). Removing the notification to
match a count would break the loop that feature depends on.

### 3.2 E-mail notifications are deferred, with no stub

0104's header states it: there is no mail provider on this project and standing
one up is the owner's decision, not a side effect of a sprint. Every
`notifications` row already carries what an e-mail would be built from
(recipient, actor, type, body preview, and the task/escalation/project/building
links), so nothing has to be re-modelled when that decision is made.

No provider, no adapter, no stub — a stub would be a dead button under
Constraints.md #2. Logged as `MYTASKS_EMAIL_NOTIFICATIONS` in `docs/Backlog.md`.

---

## 4. Amendments A–F — final disposition

The owner's amendments override the spec. Each row states what was built and
where the enforcement actually lives, because "the UI does it" is not an answer
when the UI is the thing that can be wrong.

| | amendment | disposition |
| --- | --- | --- |
| **A** | Soft delete into Trash; rows and audit stay forever; hard delete stays impossible | **Built.** `deleted_at` / `deleted_by_id` (0124); Trash view + Restore in the status filter (9R(4)). **No DELETE policy was added** — §1.1 remains true, which is what makes the soft delete safe rather than what obstructs it |
| **B** | Editable after creation by creator or manager-above-assignee; every edit audited with a summary naming what changed | **Built.** `tasks_edit_guard` (0124) splits content authority from status authority; `audit_tasks_fn` emits field-level old→new prose. The assignee is deliberately excluded from content edits — holding a task does not let you rewrite the brief you are judged against |
| **C** | Cancel ≠ Trash, separate controls; every trash audited naming actor, task and prior status; trashed-30d count on the Team widget | **Built.** Cancel stays a status transition on the creator-only path; Trash is a separate button. Audit reads `moved '…' to trash (was in progress)`. The widget's trashed counter is the only place a trashed row is counted — it is excluded from every other metric, which is the anti-gaming design |
| **D** | Subtree + responsibility | **Built, read-only.** 0125 adds one branch to `tasks_read` via `is_project_pm()`. `tasks_upd` and all guards are untouched: a pm who is not creator, assignee or manager-above-assignee reads such a task and changes nothing. Proven both halves (proof ix) |
| **E** | Create-modal targeting: Project · filtered Building · filtered ESM; programme-level is valid; links survive edit and appear in audit | **Built.** `useTargeting` / `TargetFields` shared by both modals (9R(6)). Project-with-no-building renders as "programme-level", not as missing data. Link changes produce named audit sentences (§5) |
| **F** | E-mail out of scope; record the deviations | **Honoured.** No provider, no adapter, no stub. Deviations recorded in §3; `MYTASKS_EMAIL_NOTIFICATIONS` and `MYTASKS_ENGINEER_READ_WIDENING` in `docs/Backlog.md` |

---

## 5. The commit ledger

| commit | what it changed |
| --- | --- |
| `a117014` | **9R(1)** — proof harness + this document + two backlog items. No behaviour change |
| `7bda783` | **ci** — regenerated the census manifest. Inherited failure from 9Q(3), which added `BuildWatcher.jsx` without regenerating; raised rather than absorbed into a sprint commit |
| `570c0ab` | **9R(2)** — `isManager` from the subtree instead of a hard-coded role list; reassign control on rows |
| `aeec1d0` | **9R(3)** — migrations 0124 (columns, `tasks_edit_guard`, `audit_tasks_fn`) and 0125 (`is_project_pm`, `tasks_read` branch) |
| `07a9395` | **9R(4)** — Edit modal, separate Cancel and Trash controls, Trash view with Restore, three-way fetch split |
| `ead62f4` | **9R(5)** — `scopeLabel`, data-gated Delegated tab, four KPI cards, full §6 widget |
| `245be2e` | **9R(6)** — Project picker, filtered Building and ESM, Project / building column |
| `ac1c480` | **9R(7a)** — truncation detector on the Team widget |
| `e6d38c7` | **9R(7b)** — `scripts/tasks-perf.mjs` + harness; measured render and card fit |

Audit sentences produced by link edits, captured live and rolled back (amendment E):

```
… updated 'Resolve Window 1.5 TR shortfall': ESM from none to ESM1.
… updated 'Client sign-off walk-through — MOI-001': building from MOI-001 to MOI-003.
… updated 'Client sign-off walk-through — MOI-001': project from PROJECT-A to DEMO-PROJECT-2,
  building from MOI-001 to none.
```
<!-- The second project code in this transcript was the demo programme's, which
     carried a real ministry's identity; it is shown neutralised under
     Constraints #7. The behaviour the transcript records is unchanged. -->
```
```

---

## 6. Verification table

Measured means a number was observed. Proven means a live transaction returned
the expected outcome. Blocked means it was not done, and says why — a blocked
proof is not softened into a passed one anywhere in this document.

| # | item | status | evidence |
| --- | --- | --- | --- |
| 1 | Live guard bodies match the repo | **Proven** | `pg_get_functiondef` × 5 diffed against 0010/0102/0104/0011 — identical; trigger wiring read from `pg_trigger` |
| 2 | Manager → outside subtree refused | **Proven** | `42501 — You can only assign work to yourself or to someone who reports to you` |
| 3 | Manager → subordinate accepted | **Proven** | 1 row, rolled back |
| 4 | Non-assignee → done refused | **Proven** | `42501 — Only the assignee can mark a task done` |
| 5 | Non-creator → cancel refused | **Proven** | `42501 — Only the person who raised a task can cancel it` |
| 6 | DELETE affects nothing | **Proven** | 0 rows, no error; 0 DELETE policies, grant present |
| 7 | Creator branch is not a back door | **Proven** | RLS WITH CHECK evaluated `TRUE`; trigger still refused |
| 8 | `created_by_id` immutable | **Proven** | was ACCEPTED before 0124; now `42501 — Who raised a task cannot be changed` |
| 9 | Assignee cannot edit content | **Proven** | `42501 — Only the person who raised this task, or a manager above the person it is assigned to, can edit its details` |
| 10 | Creator can edit content | **Proven** | audit: `priority from medium to critical, due date from 25 Jun 2026 to 01 Dec 2026` |
| 11 | Manager-above-assignee can trash; stamp is server-side | **Proven** | forged `deleted_by_id` overridden to the actor; `moved '…' to trash (was open).` |
| 12 | Non-manager cannot trash | **Proven** | `42501 — …can move it to the trash` |
| 13 | Restore clears the stamp, leaves status alone | **Proven** | `restored '…' from trash.`, status unchanged |
| 14 | Trashed row accepts nothing but restore | **Proven** | `42501 — This task is in the trash…` and `42501 — Restore this task first…` |
| 15 | Building from another project refused | **Proven** | `23514 — That building belongs to a different project than the task` |
| 16 | ESM not active on project refused | **Proven** | `23514 — That ESM is not active on the task's project` |
| 17 | ESM without a project refused | **Proven** | `23514 — A task cannot carry an ESM without a project` |
| 18 | Project change orphaning a building refused | **Proven** | same as 15, on a project-change statement |
| 19 | Programme-level create accepted | **Proven** | project, no building, ESM active on project — inserted, rolled back |
| 20 | pm_id read widening, read-only | **Proven** | pm sees their project's task (1) and not another's (0); UPDATE affects **0 rows** |
| 21 | Service context: authority skipped, integrity enforced | **Proven** | trash accepted with no `auth.uid()`; mismatched building still refused |
| 22 | 0105 archive cascade still works | **Proven** | archiving a proje moved their open tasks 2→0, manager 2→4 |
| 23 | UI gate == guard gate | **Proven** | `may_manage` truth table over all 45 actor×task pairs; the 19 true pairs are exactly the 19 the UI offers Edit/Trash on |
| 24 | Audit payload shape unchanged | **Proven** | keys `old`/`new`, all columns populated — Dashboard/Settings/BuildingDetail readers unaffected |
| 25 | Realtime publication includes `tasks` | **Proven** | `pg_publication_tables` |
| 26 | **1000-row render < 500 ms** | **Measured** | **54.1 ms** @1366, **45.0 ms** @1280, **53.8 ms** @1040 — real component, seeded dataset |
| 27 | **Nine-column table fits its card @1366 / @1280** | **Measured** | card **1078/1078** and **992/992** — no overflow; page never scrolls sideways; 9 columns counted in the DOM |
| 28 | `.ies-table-wrap` mechanism actually engages | **Measured** | @1040: wrapper scrolls internally **863/720** while the card holds at **752/752** |
| 29 | Census green | **Measured** | `ui-census.mjs --check` exit 0 at every commit |
| 30 | Build green | **Measured** | `npm run build` exit 0 at every commit |
| 31 | **Realtime propagation < 2 s across two sessions** | **BLOCKED** | see §7 |
| 32 | **Full-page screenshots via `ui-shots.mjs`** | **BLOCKED** | see §7 |
| 33 | **Truncation banner rendered** | **BLOCKED** | condition verified arithmetically against live counts (5 = 5, correctly no banner); the rendered banner was not observed — needs a signed-in session |
| 34 | **Deploy green** | **PENDING MERGE** | see §8 |

---

## 7. What is blocked, precisely, and what would unblock it

The reason is the same for all three, and it is narrower than "no credentials":

**The Supabase URL and publishable key ARE available** — both are committed in
`.env.production` on purpose, because a publishable key is RLS-protected and
ships in the browser bundle. What is missing is **a user password**.
`VITE_DEMO_PASSWORD` is deliberately left empty in `.env.example` and absent
from `.env.production` ("never commit the real password"), no `.env.local`
exists, `IES_TEST_PASSWORD` / `IES_SHOT_PASSWORD` are unset, and
`.github/workflows/deploy.yml` does not inject one either — demo mode is off in
production because the platform now holds real programme data.

So the accurate statement is: **cannot sign in, because no user password is
available.** Not "credentials missing".

- **Realtime < 2 s (31)** needs two authenticated sessions subscribed to
  `postgres_changes`. Realtime applies RLS per subscriber, so an anonymous
  subscription would be denied and would prove nothing about the authenticated
  path. No proxy measurement is offered in its place. What is established is
  that the transport exists: `supabase_realtime` publishes `public.tasks`, and
  `useLiveQuery` subscribes to it.
- **`ui-shots.mjs` (32)** signs in before shooting; without a password it reaches
  only the login screen. Note this is now the *only* blocker for that script —
  the Chromium problem is solved (§9).
- **Truncation banner (33)** renders on the Team tab, behind sign-in.

**What would unblock all three:** one test-account password supplied as
`IES_TEST_PASSWORD` / `VITE_DEMO_PASSWORD` in the environment. A service-role
key would also work by minting a session, but is a much larger grant for the
purpose.

**What was deliberately NOT done to work around it:** no password was set on any
`auth.users` row. Minting a credential on a production project holding real
programme data, to make a test pass, is not a decision a sprint gets to take on
its own — and it would leave a known password behind afterwards.

---

## 8. Deploy status — pending, not green

`.github/workflows/deploy.yml` builds on `main` and on `claude/**`, but the
deploy job carries `if: github.ref == 'refs/heads/main'`. **Branch runs build
and never deploy.** A green run on `claude/fable-5-plan-c4g47d` is evidence of a
clean build and of nothing else.

Deploy-green is therefore **pending the merge to main** and cannot be claimed
from this branch. No deployment evidence is asserted anywhere in this document.

Post-merge, the live-site smoke check (Constraints.md #6) is still owed, and the
three blocked proofs above become runnable against the deployed site by anyone
holding a test password.

---

## 9. Notes an owner reading this cold should have

**The `created_by_id` hole was found here, and it was live.** Nothing policed
that column, and `tasks_upd`'s WITH CHECK actively rewarded changing it:
`created_by_id = auth.uid()` is satisfied by the *new* row, so setting yourself
as the creator passed. Verified before 0124 — an assignee set `created_by_id` to
themselves and the update was **ACCEPTED**, which promoted them to creator and
handed them cancel rights over someone else's task. Every rule 0124 adds hangs
off that column, so it is now immutable outside service contexts. This was not
on the sprint brief; it was found by asking what the new rules depend on.

Stated plainly, because it should not have to be read out of a migration:
**`tasks.created_by_id` is immutable.** Any statement that changes it raises
`42501 — Who raised a task cannot be changed`. The single carve-out is the
service context — `auth.uid() is null`, or `app.chain_rewire` set — which exists
so that `profiles_archive_cascade()` (0105) can rewire work when a person is
archived, and for no other reason. A signed-in user has no path to that carve-out:
both conditions are server-side, and neither can be reached from the client.
The wider lesson is the one worth carrying: this hole sat inside a governance
layer the sprint had just finished calling sound, which is why "the backend is
fine, this is a frontend sprint" is a framing that must keep being tested rather
than assumed.

**A widget told a different story than its own data, and review caught it.** An
earlier revision of 9R(5) scoped the KPI strip to the whole Team fetch, which is
wider than the team — that fetch also returns rows merely *created* by a subtree
member, not held by one. Against live data it printed **"5 open" above a table
whose rows totalled 4**. Both halves are now computed from one population: tasks
*held* by someone strictly below the viewer. Nothing was broken in the database,
nothing would have errored, and no user would have been refused anything — the
page would simply have been quietly wrong about the team it was measuring. That
is the defect class this sprint was reviewed for, it occurred twice (see also the
`restricted`-versus-`—` distinction in the Project column, §5), and it was found
by review rather than by a user, which is the entire point of the gate.

**Two process notes, recorded because the behaviour is the standard.** A third
viewport at 1040 was added after 1366 and 1280 had already passed, on the
reasoning that two comfortable widths passing is not evidence the mechanism
works — and 1040 is the assertion that actually exercises `.ies-table-wrap`
(the wrapper scrolls internally while the card holds). And the wrong "blocked"
call below is recorded as a correction rather than quietly fixed. Asserting
blocked without exhausting the check is the same species of error as asserting a
number that was never measured; both put something in the record that was not
observed.

**Chromium was present all along.** An earlier revision of this document
reported the render and card-fit proofs as blocked on a missing browser. That
was wrong: this environment ships Chromium **1194** under
`PLAYWRIGHT_BROWSERS_PATH`, while the pinned Playwright **1.49.1** resolves
`chromium-1148` and therefore reported a missing executable. Passing
`executablePath` explicitly fixed it, and proofs 26–28 are measured rather than
blocked as a result. Recorded because "blocked" was asserted once without being
exhausted, and the correction matters more than the original claim.

**The widget's accuracy has a stated ceiling.** The Team fetch stops at 500 rows.
Below that the figures are exact; above it they would be computed over a subset
chosen by earliest due date, which skews old and therefore skews *done* — the
numbers would flatter the team. 9R(7a) detects this exactly (same filter,
counted server-side, compared against rows held) and says so on the card. At
current volume — 5 task rows in the entire database — it is three orders of
magnitude from mattering.

**One deliberate silence in the UI.** `scopeLabel` does not mention amendment
D's `pm_id` reach. There is no honest one-line phrase for "plus anything on my
projects", and inventing one would overclaim for every user who is not a pm.

**One deliberate distinction.** The Project / building column prints
`restricted` — not a dash — when a task carries a project the viewer cannot
read. `tasks_read` is now wider than `projects_read` in the pm_id and subtree
directions, so this state is reachable, and printing a dash would claim the task
has no project.

**Test volume is small.** Every proof ran against the real org chart (9 people,
correct shape) but only 5 task rows. The guards are logic and are exercised
correctly by 5 rows; the *performance* claims rest on the 1000-row seeded
dataset, not on live volume. Nothing here has been observed under real load.
