# Sprint 9N — escalation lifecycle: decisions, findings, and one refusal

Established against the live database (`mzuyvajefqkmaxludijm`). Findings are
stated as findings — things that were **queried** — and kept separate from the
judgement calls made on top of them.

---

## N1 · Migration 0122 was reconstructed from the database, not from memory

**Situation.** `escalations_autoclose` and its pg_cron job were applied to the
live database before the migration file reached the repository, and the
container holding that file was lost. The database was the only surviving copy.

**What was done.** `supabase/migrations/0122_escalations_autoclose.sql` was
rebuilt from the deployed objects — `pg_get_functiondef` and `pg_proc.prosrc`
for the function, `pg_proc.proacl` for the grants, `cron.job` for the schedule —
and then **verified against them**, rather than being re-written from an idea of
what it said.

### Verification (read-only, against the live database)

| assertion | result |
| --- | --- |
| function body `md5(prosrc)` = `fd239d3088e42a0a2a879a7f46153d91` (the file's `$$…$$` body, byte for byte) | ✓ |
| identity arguments — none | ✓ |
| returns `integer` | ✓ |
| language `plpgsql` | ✓ |
| `SECURITY DEFINER` | ✓ |
| `proconfig` = `{search_path=""}` | ✓ |
| `proacl` = `{postgres=X/postgres,service_role=X/postgres}` | ✓ |
| `comment on function` text identical | ✓ |
| cron job `escalations-autoclose` — `*/15 * * * *`, `select public.escalations_autoclose()`, user `postgres`, db `postgres`, active | ✓ |
| `pg_cron` extension version | `1.6.4` |
| `has_function_privilege('authenticated', …, 'execute')` | **false** |
| `has_function_privilege('anon', …, 'execute')` | **false** |

Twelve assertions, all green. The file states what the database contains.

The verification was deliberately done by **reading** the catalogue rather than
by re-applying the file and looking for a diff. Re-applying would have proved
the same thing while re-scheduling the cron job (a new `jobid`) and re-running
the backfill against production for no reason. The file is nonetheless written
to be re-applied safely — every statement is `create or replace`,
`if not exists`, or unschedule-then-schedule — so a fresh deployment of this
platform gets the same objects.

### One naming note, recorded so it is not mistaken for a bug

The function is called `escalations_autoclose` and it does **not** close
anything. It stops at `resolved`. `escalations_transition_guard` (0103) permits
only the person who *raised* an escalation to close it, because closing is that
person's judgement that the answer was adequate — and a scheduler cannot make
that judgement. The machine resolves; the human closes. The name is a historical
artefact and is kept only because renaming a deployed function to improve a
noun is not worth a migration.

---

## N2 · The rule is one condition, and `cancelled` is not part of it

    auto-resolve an escalation when its source task reached `done`.

`tasks.status` is the `task_status` enum — `open | in_progress | blocked | done
| cancelled`. It carries **no `resolved` and no `closed`**; those are
`escalation_status` values (`open | acknowledged | resolved | closed`) and
belong to the escalation, not to the task. So "the source task is finished" has
exactly one spelling here, `t.status = 'done'`, and that is the single condition
the deployed function tests.

`cancelled` is deliberately excluded. Cancelling a task does not mean the
problem it described went away — often it means the opposite, that the task was
the wrong response to a problem that is still live. An escalation is precisely
where that distinction has to survive. If a cancelled task's escalation should
also close, a person should close it, and say why in the note.

---

## N3 · The feature is DORMANT today, and that is correct behaviour

**Finding.** Both escalations on the live database carry
`related_task_id IS NULL`:

| title | status | severity | `related_task_id` |
| --- | --- | --- | --- |
| Mock-up sign-off slipping beyond 7 days | `open` | high | **NULL** |
| Window 1.5 TR shortfall of 36 units | `acknowledged` | critical | **NULL** |

The sweep joins `escalations` to `tasks` on `related_task_id`, so it matches
**zero rows today** and will keep matching zero rows until an escalation is
raised *from* a task. The backfill at apply time moved 0 rows, and the five
recorded cron runs have each returned 0.

**This is not a defect, and the temptation to "fix" it should be resisted.**
`related_task_id` populates when an escalation is raised from a task — the path
that creates the parent/child link in the first place. The two rows that exist
predate that path; they were raised directly, against buildings, in the original
seed. A join that matches nothing because nothing has been linked yet is a
correct join over an empty set.

The failure mode to avoid is concluding "0 rows, therefore the condition is too
narrow, therefore widen it" — which is how a lifecycle rule turns into a
time-based sweep. See N4.

**How it will be observed working.** `cron.job_run_details.return_message`
carries the row count, and the function returns the number moved. The first
non-zero run is the evidence that the link path is being used. No new
instrumentation was added for this; the scheduler already records it.

---

## N4 · The time-based stale sweep was considered and is REFUSED

The obvious companion rule — *also auto-close any escalation left open past N
days* — was raised and is rejected. Not deferred; rejected.

**An escalation open past a threshold is the most important row on the page.**
That is the entire point of the mechanism. Someone said "this is stuck and I
cannot move it", and nobody has answered. Age is not evidence that the row is
dead wood; age is the severity signal itself, and it is the one signal an
escalation exists to produce.

An auto-close by age would therefore delete **exactly** the rows the feature is
meant to protect, and it would do it silently, and it would do it fastest to the
worst-served ones. The Attention List would look clean and the programme would
be in trouble, which is the most dangerous state a control dashboard can be in.
Every failure it is meant to surface would sort itself out of view.

The distinction against N2 is the whole argument: the task rule closes rows
whose **problem is provably solved** — someone finished the task. A time rule
closes rows whose problem is provably **not** being solved. They look alike on a
list of "auto-close rules" and they are opposites.

**What the age problem actually is.** It is a *visibility* problem, not a
lifecycle one. If an old escalation is being lost among newer ones, the answer
is to make it louder, not to remove it. That is logged as
`ESCALATION_AGE_VISIBILITY` in `docs/Backlog.md`, for the owner, and it is **not
built here** — it is a Dashboard/Escalations presentation change with its own
design questions (what threshold, per severity or flat, badge or sort or both),
and it would have been smuggled in under a schema sprint.

---

## N5 · The intermediate `acknowledged` notification (see 0123)

Because `escalations_transition_guard` forbids skipping states, an auto-resolve
of an `open` escalation performs two updates, so `escalations_notify` fires
twice and the raiser receives `escalation_acknowledged` immediately followed by
`escalation_resolved` — when no human ever acknowledged anything.

The guard is right and the intermediate write stays. What is wrong is the
notification, and only for the system actor. Handled in migration 0123; the
reasoning, and the proof that human acknowledgements still notify exactly as
before, are recorded there.
