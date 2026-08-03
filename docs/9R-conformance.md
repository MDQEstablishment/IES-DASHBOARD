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

So this commit builds nothing. It establishes, against the **live** database,
which fences actually hold — by pushing on each of them and recording what came
back. Every later commit in 9R is allowed to point here and say "this control is
safe to render, and here is the clause that says so."

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

## 4. The amendments contract, as 9R will implement it

The owner's amendments override the spec. Summarised here so later commits are
checked against one statement of intent.

| | amendment | how 9R satisfies it |
| --- | --- | --- |
| **A** | Soft delete into Trash; rows and audit stay forever; hard delete stays impossible | `deleted_at` / `deleted_by_id` in 0124; Trash view with Restore in 9R(4). No DELETE policy is ever added — §1.1 is the guarantee, not the obstacle |
| **B** | Editable after creation by creator or manager-above-assignee; every edit audited with a summary that NAMES what changed | `tasks_edit_guard` in 0124; `audit_tasks_fn()` replaces the generic writer on the `audit_tasks` trigger, emitting field-level old→new prose (§1.4 records the generic before-picture) |
| **C** | Cancel ≠ Trash. Both exist, separate controls. Every trash writes an audit row naming actor, task and prior status; Team widget header carries a trashed-in-last-30-days count | Cancel keeps the existing `cancelled` status path proven in (d); Trash is the new `deleted_at` path. Separate controls in 9R(4), count in 9R(5) |
| **D** | Subtree + responsibility | 0125 widens `tasks_read` so a project's `pm_id` may READ that project's tasks. **Read only.** Write, reassign, status and edit authority stay subtree-based — proofs (a)–(f) are exactly what must keep passing afterwards |
| **E** | Create-modal targeting: Project · filtered Building · filtered ESM; project-with-no-building is a valid programme-level state | 9R(6). "Linked stage" resolves to ESM (D1): `esm_id` filtered through `project_esms` where `archived = false` |
| **F** | E-mail out of scope; record the deviations | §3 above; `MYTASKS_EMAIL_NOTIFICATIONS` in the backlog |

Two further items are recorded as deliberately **not built**:
`MYTASKS_EMAIL_NOTIFICATIONS` and `MYTASKS_ENGINEER_READ_WIDENING`
(`docs/Backlog.md`). The second is the `building_engineers` route to widening
`tasks_read` for a proje — a real option, considered, declined for now, and
written down so declining it stays a decision rather than becoming an oversight.

---

## 5. What this licenses, and what it does not

Proven safe to build on:

- a reassign control whose options are **the actor's subtree only** — (a), (b)
  and (f) together establish that the database accepts exactly that set and
  nothing wider;
- Done offered **only to the assignee**, Cancel **only to the creator** — (c)
  and (d);
- Trash as soft delete, because hard delete is unreachable — (e).

Not licensed by anything here, and each needs its own live verification when it
lands: the edit guard, the trash/restore guard, the project↔building and
project↔ESM integrity checks, and the `pm_id` read widening. All are new
behaviour introduced by 0124/0125 and are 9R(3)'s obligation to prove the same
way — apply, then read the live body back, then push on it.

---

## 6. Gate state at 9R(1) — one inherited failure, raised not absorbed

`npm ci` clean, `npm run build` green.

`node scripts/ui-census.mjs --check` is **red, and was already red at HEAD before
this commit existed.** Cause: `src/components/BuildWatcher.jsx` was added by
`40d67ab` (9Q(3)) without regenerating `docs/9J-acceptance.md` in the same
commit, so the manifest describes 56 files while the tree holds 57. Everything
after that line in the table shifts by one row, which is why a one-file omission
reports as 1256 changed lines.

This commit is **census-neutral, and that is proven rather than asserted**: the
checker's output was captured on a stashed, clean HEAD tree and again with all
of this commit's changes present, and the two are byte-identical. Nothing here
touches `src/pages`, `src/components` or `src/lib` — the commit is two new files
under `scripts/` and `docs/` plus a `docs/Backlog.md` edit.

**The manifest is deliberately not regenerated here.** Folding a 1256-line
unrelated regeneration into a commit whose entire claim is "no behaviour change"
would bury the evidence of when the drift entered, and the sprint rule that
mandates regeneration is scoped to commits that touch `src/lib` — which this one
does not. (No acceptance checkbox in the manifest is ticked, so regenerating
would lose no human-maintained state; the objection is to hiding it, not to the
cost.)

It does need fixing, and soon, as its own commit: from 9R(2) onward this sprint
edits `src/pages/Tasks.jsx`, and a gate that is already failing cannot tell
anyone whether *that* change moved anything. Raised to the sprint lead.
