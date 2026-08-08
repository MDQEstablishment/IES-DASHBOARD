# People and Access — design (confirmed scope)

**Status: PLAN ONLY. No code in this document. It must not block the survey.**

Supersedes the first draft of this file. The owner has confirmed and narrowed
the scope, declined one feature, and two earlier findings changed the shape.

## 0. The principle, in the owner's words

> A role is a **job title, not a place.** "Project Manager" does not mean
> manager of Mecca — it means a person whose role is Project Manager, and the
> PMO decides which projects are opened to him. The role says **what** a person
> can do; the PMO says **where**.

Everything below serves that sentence. **What** is the role, and it is locked
(migration-only, `authority_roles`). **Where** is per-person and fully
self-service (projects opened to a person, by the PMO, from Settings).

**The bar:** the PMO at a client runs the entire people-and-access lifecycle
with **no vendor SQL, ever** — because at a hundred clients every vendor touch
is multiplied by the customer count and becomes unsellable.

---

## 1. Scope — four things, and one that comes before them

| | item | today | fix |
|---|---|---|---|
| **0** | Archived users still have access — fix first | **live gap** | migration |
| 1 | Create a user account end to end from Settings | **impossible by any route** | edge function + screen |
| 2 | Set / change a role from Settings | **works** | keep; build on `profiles_guard` |
| 3 | Open **projects** to a person; many people per project | **structurally impossible** | schema + screen |
| 4 | Open **sections** to a person | role-only, unenforced | **recommend: keep role-only** — see §6 |

**Explicitly OUT of scope — task handover.** The first draft split handover out
as its own feature; the owner has now **declined it**. His resignation example
meant only that a replacement's *account* gets the role and the projects opened
to it — which items 1–3 already deliver. Reassigning a leaver's existing open
tasks and records is **not wanted** and must not be built. Recorded here so
nobody rebuilds it later as a perceived gap. (`profiles_archive_cascade`
already moves reports/tasks/escalations to the manager on archive; that stays
as-is — it is not the same as a chooseable handover and the owner has not asked
to change it.)

**Three rulings still with the owner (do not resolve here):** whether `plane`
gets progm's permissions or its documented schedule-and-analysis scope; whether
`ceo` writes or stays portfolio-read (the screen and the database both say
read); and the Commit-3 proposal to ship the all-projects survey scope now.
These gate parts of the plan and are marked where they bite.

---

## 2. Position 0 — archived does not revoke access

**The gap.** `profiles.archived` is read by **no** access function —
`auth_role`, `is_broad_reader`, `can_read_project`, `can_read_building`,
`w_proj`, `w_bld`, `may`. An archived person whose credentials still work keeps
their full role authority. The Settings screen says *"They lose access
immediately."* They do not.

**The fix, at one point.** Make `auth_role()` return `null` for an archived
profile. Every predicate in the system is built on `auth_role()`, so a null
role fails `may()`, `w_proj`, `is_broad_reader` and the read policies
uniformly — deny-by-cascade from a single line, rather than adding `and not
archived` in eight places that can drift apart. This is the same
one-source discipline as the rest of the sprint.

```
-- shape only, not final SQL
create or replace function public.auth_role() returns user_role ... as $$
  select role from public.profiles
   where id = (select auth.uid()) and archived = false;
$$;
```

**Proof required (from the authenticated role of an archived account):** archive
a scratch user, assume their JWT, and show `auth_role()` is null, a
representative read (`can_read_project`) is false, and a representative write is
refused `42501` — then restore and show access returns. This is a Commit-0
proof, not a claim.

**One risk to close in the same commit:** a deactivated user must still be able
to load the app far enough to see "your account is deactivated" rather than a
white screen — confirm the shell handles a null role as "signed in, no access"
and not as a crash. This is the one place a null role must not be treated as a
bug.

---

## 3. Item 1 — account creation, end to end

**Why it cannot be done today and must not be done in the browser.** Creating
an `auth.users` row needs the service role. The service key must never reach the
browser. So the create path is a server-side intermediary.

**`admin-users` edge function.** Holds the service key server-side only. Every
call, in order:

1. authenticates the caller from their JWT;
2. **re-reads the caller's role from `profiles` server-side** — never trusts a
   role in the request body;
3. checks `may('user.create')` (etc.) against `authority_roles`;
4. re-applies the **`role_rank` rule in the function**, because the
   `profiles_guard` trigger cannot see an `auth.admin.createUser` call: a PMO
   (rank 2) may create only roles strictly below rank 2, so **a PMO cannot mint
   an admin, a ceo, or another PMO — only an admin mints an admin**;
5. creates the auth user **and** the profile as one atomic operation — on any
   failure, neither exists (no orphan profile, no account without a profile);
6. sends an **invitation** (`inviteUserByEmail`) so the employee sets their own
   password — **no password ever passes through the PMO's hands or the
   browser**;
7. writes an `audit_log` row: who created whom, with what role.

**A `handle_new_user` trigger on `auth.users`** creates the matching profile, so
an account created by any route — this function, a future SSO, the dashboard —
cannot exist without a profile. Today's 9-auth/9-profile parity is luck, not
construction.

**Operations:** `create`, `set_role`, `archive`, `restore`, `resend_invite`.
Deliberately **no `delete`** — leavers are archived so the audit subject
survives (§5, archive-never-delete).

---

## 4. Item 2 — roles

Works today and is kept. Settings → Users has the role dropdown; `profiles_upd`
admits pmo/admin; `profiles_guard` enforces: nobody changes their own role, and
a non-admin may only touch roles **strictly below their own rank on both the
old and the new value**. The edge function (§3) re-implements the same rule for
the create path. No second guard is invented; the existing one is the source.

---

## 5. Item 3 — projects opened to a person (the structural correction)

**The real limit, corrected from the first framing.** `pm_id` has no unique
constraint and lives on the *project* row, so one person holding many projects —
the owner's "one PM on two sites" — **already works.** The limit is the mirror
image: **one project cannot hold many people.** One PM slot, one engineer slot,
nothing for procm/proco. That is why a survey crew of three is inexpressible
and why the ruled "own project" scope has nothing to resolve against for
procm/proco.

**`building_engineers` — the explicit decision the owner asked for.** It exists
with the right shape (`PK (building_id, engineer_id)`, a `role` column) at the
**building** level, holds **0 rows**, is written by **nothing**, and is
consulted only for the `proje` branch of `can_read_project`/`w_bld`/
`building_photos_write`.

> **Decision: replace it with a project-level `project_members`, and retire
> `building_engineers` from the access path.** Justification: the owner's axis
> is "projects OR sections", never buildings; building-level membership is
> YAGNI and would leave a fourth half-built relation — the exact thing this
> sprint keeps removing. The three functions that consult it are repointed at
> `project_members`. `building_engineers` is dropped, or kept inert with a
> comment if any historical row ever lands there (currently zero, so a clean
> drop). If a client ever needs sub-project scoping, it is re-added
> deliberately, as membership rows with a `building_id`, not resurrected by
> accident.

**`project_members`:**

```
project_id  -> projects
user_id     -> profiles
member_role text            -- 'pm' | 'engineer' | 'surveyor' | 'procurement'
added_by, added_at
removed_by, removed_at      -- SOFT end, never deleted (history is the point)
primary key (project_id, user_id, member_role)
```

**`may(action, project_id)` becomes the one predicate.** Each `authority_roles`
row carries a **scope**: `all` resolves on role alone; `own` resolves against a
live (not removed) `project_members` row. One source, both halves — the
role says *what*, the membership says *where*.

**`projects.pm_id` stays as the display "who leads"**, kept consistent with the
`pm` membership row by a trigger, so the current project card keeps working
through the migration rather than breaking on day one.

**Reassignment** = end one membership row, start another; both audited; the
person's authored work stays attributed to them (handover is out of scope, §1).

---

## 6. Item 4 — sections: the design question, answered

**How section access works today:** role-only, and **not enforced server-side.**
`ROLE_NAV[role]` in `src/lib/nav.js` (frozen) is a flat list of nav ids per
role; `navForRole()` decides which nav items *render*. There is **no route
guard** — a user who types `/settings` gets the component, which then self-gates
its admin actions. Real enforcement is per-table RLS, not per-section.

> **Updated 0148.** That self-gate was an inline `['pmo','admin']` array, and it
> is now `may('user.admin', role)` reading the AUTHORITY mirror. The inline
> version was already wrong by then: 0147 made ceo PMO-equivalent, so a ceo saw
> the Settings nav item and found user administration hidden inside it —
> shown-then-denied, inverted. The paragraph above is left standing because its
> conclusion did not change: the nav map still renders, RLS still enforces, and
> there is still no route guard.

**The question:** per-person section override, or section-by-role with projects
as the only per-person axis?

> **Recommendation: sections stay role-only; projects are the only per-person
> axis.** Two reasons. (1) A section is a coarse UI-rendering concern with no
> per-row data behind it — there is nothing at the section level for RLS to
> enforce, so a per-person section grant would be a **UI-only permission with
> nothing behind it server-side**, i.e. a second, unenforceable source of
> truth, the precise defect this whole sprint has been removing. (2) The
> owner's principle already resolves it: a section is part of *what* a job
> title does (role), and *where* is the project. A Procurement Officer sees the
> Materials section because that is the job; which projects' materials is the
> per-person "where". Sections do not need a second axis.
>
> **Consequence to also fix (small, not a new feature):** because sections are
> only *rendered* by role and not *guarded*, a determined user can route to a
> hidden section's page. The data is still RLS-protected, so it is not a leak,
> but a route guard keyed on `ROLE_NAV` should be added so a hidden section is
> actually closed, not merely unlinked. Flagged, sequenced late, not urgent.

If the owner wants per-person section overrides anyway, that is a real feature
and I will design it separately — but I recommend against it, with the reason
above, rather than building both.

---

## 7. `authority_roles` stays migration-only, and why that is the safety line

A PMO administers **people** — creates accounts, sets roles from the fixed
catalogue, opens projects. A PMO never edits the **permission model** — what
each role may do. That line is what makes self-service safe rather than an open
door: if a PMO could edit `authority_roles`, self-service would be a route to
granting oneself anything. 0143 already revoked client write/TRUNCATE on that
table; this design depends on that fence and does not loosen it.

**Settings role descriptions generated from `authority_roles`.** The screen's
role descriptions are hand-written prose — a fourth place authority is
described, and the only one the owner ever reads. Generated from
`authority_roles`, a description **cannot lie to him**; hand-written, it drifts
and he believes the drift. A short hand-written line of *intent* per role may
remain, clearly separated from the generated list of *actual* authority.

---

## 8. Bootstrap — hour zero at a new client

A system that cannot create its own first administrator without vendor SQL
fails the test before it starts. `bootstrap_first_admin(email)` is
**self-disabling**: it succeeds only while `profiles` is empty and refuses
forever after. Deployment runs it once with the client's PMO email; it creates
the auth user, sends the invite, seeds the profile as `pmo`, audits it, and can
never be used again. No vendor SQL, and no permanently-armed god function left
behind.

---

## 9. Scenarios — with the year-two self-service column

The owner asked for this specifically; it is the acceptance bar. Every "no" in
the last column carries a reason, and the reason is **"must stay locked"**,
never "we didn't think of it".

| scenario | behaviour in this design | year-two: can the client do it themselves? |
|---|---|---|
| **Last PMO archives themselves** | **Refused.** An instance must always retain at least one active account that can administer people (admin or pmo). The archive op counts active administrators and blocks the last one, with a message to appoint another first. | Yes — appoint a second administrator, then archive. Self-service. |
| **Create a user with an existing email** | `auth.admin.createUser` errors on duplicate; the function surfaces "an account with this email already exists" and, because creation is atomic, **no partial profile is written**. | Yes — the PMO sees the clash and either resends the invite to the existing account or corrects the email. |
| **Invitation expires unaccepted** | The account exists in a **pending** state (auth user, never signed in). It confers access only after the invite is accepted and a password set. PMO can `resend_invite` or `archive`. | Yes — resend or archive from Settings, no vendor. |
| **Person removed from a project while holding open work** | Membership **soft-ends**; they lose access to that project immediately (via `may(…, project_id)`). Their authored records stay attributed to them — handover is out of scope. If the work must continue, the PMO opens the project to the replacement (items 1–3). | Yes — remove one, open to another. The owner's stated resignation flow. |
| **Client hires a role not in our nine** | **Cannot self-add a role type.** `authority_roles` and the role enum are migration-only. **Reason: the permission model must stay locked** — a self-editable role catalogue is a self-service route to arbitrary privilege. Mitigation: the nine are broad job titles and per-project membership supplies the "where", so most "new role" requests are really "new person, existing role, these projects" — which *is* self-service. | **No, by design** (must stay locked). A genuinely new capability set is a product decision, not a client action. |
| **Two PMOs edit the same person at once** | Last-write-wins today. This design adds an **optimistic-concurrency guard**: the update carries the row's `updated_at`; a stale write is refused with "this person was changed by someone else, reload". Both attempts audit regardless. | Yes — the loser reloads and re-applies. No data silently lost. |
| **Person archived while assigned to five projects** | Archive denies access globally (Position 0), so the five memberships become inert at once — no per-project cleanup needed. Memberships are **left intact, not ended**, so `restore` returns the person to exactly their prior projects. Audit records the archive as one act. | Yes — archive and restore are both self-service and symmetric. |

---

## 10. Ordered commit plan — one reviewable unit each, proof per commit

Cadence unchanged: Fable plans and reviews, Opus implements, I verify against
the live DB, tests green before "done", deploy-green means green on main,
`src/lib` byte-identical.

| # | commit | proof gate |
|---|---|---|
| **0** | **Archived revokes access.** `auth_role()` returns null for archived; shell tolerates a null role. | From the archived account's authenticated role: `auth_role()` null, `can_read_project` false, a write refused `42501`; then restore → access returns. RLS DO-block idiom, exact-count cleanup. |
| 1 | **`project_members` + `may(action, project_id)` + scope column**, `building_engineers` retired from the access path, `pm_id`↔membership sync trigger. Additive except the three repointed functions. | Nine-role DO-block matrix: `all`-scope roles write any project; `own`-scope roles write only a project they are members of and are refused elsewhere; membership added/removed flips it. `building_engineers` no longer referenced by any function. |
| 2 | **`admin-users` edge function** (create/set_role/archive/restore/resend_invite) + `handle_new_user` trigger. | Call as a pmo JWT: creates auth user + profile atomically, invite sent, audit row written; **refused** when target role ≥ caller rank; duplicate email surfaces cleanly with no orphan profile; caller role re-read server-side (a forged body role is ignored). |
| 3 | **`bootstrap_first_admin`**, self-disabling. | On an empty-profiles clone: succeeds once, creates pmo + invite + audit; second call refused; refuses on a non-empty instance. |
| 4 | **Settings people screens**: create-user, role, project membership (many per project); last-admin guard; optimistic-concurrency guard. | UI drives every §9 scenario; last-PMO self-archive blocked; concurrent edit shows the stale-write message; card-fit 1366/1280. |
| 5 | **Generated role descriptions** from `authority_roles`; **route guard** keyed on `ROLE_NAV` (§6 consequence). | Description text derives from the table (change a row → text changes); routing to a role-hidden section is refused, not merely unlinked. |
| 6 | **Docs to as-built**; parity/authority tests extended to the new actions with negative control. | Tests fail on divergence (mirror vs migrations vs UI), verified by mutation. |

Commits 0–1 unblock the survey's "own project" scope; **the survey does not
wait for 2–6.** Survey C8 works on roles alone in the interim: the crew
operates under `scope = all` roles, and when Commit 1 lands the survey narrows
to project-scoped by a scope-value change, not a survey rewrite.

---

## 11. Adversarial self-review

**Turned on my own design, not a summary of it. The things that could still be
wrong:**

1. **`auth_role()` returning null is a blast radius I have not fully traced.**
   Every policy and function built on it changes behaviour for archived users
   at once — that is the point, but it is also the risk. **Unproven until
   Commit 0's matrix runs:** that no *active* user's path depends on
   `auth_role()` being non-null in a way that a future archived-then-restored
   cycle breaks, and that no SECURITY DEFINER function caches a role. Needs the
   proof, not the argument.

2. **Atomicity of "auth user + profile" across two systems is asserted, not
   proved.** `auth.admin.createUser` and the profile insert are not one
   transaction — auth is a separate subsystem. If the profile insert fails
   after the auth user is created, the "no orphan" claim is false. The design
   must specify the compensating delete (remove the just-created auth user on
   profile failure) and Commit 2 must prove it by forcing the second step to
   fail. As written, "atomic" is aspirational.

3. **The `handle_new_user` trigger and the edge function can both create the
   profile** — double-create or a race. Which one owns it must be decided (the
   trigger owns it; the function inserts nothing and reads back), or Commit 2
   ships a duplicate-key bug. Named now so it is designed, not discovered.

4. **`may(action, project_id)` changes a function signature that policies
   depend on.** The existing `may(text)` is called by `projects_ins/upd` and
   `projects_guard_soft_delete`. Adding an overload or changing arity risks the
   authority parity test and the live policies. Commit 1 must keep `may(text)`
   working (scope defaults to `all`) or migrate every caller in the same
   commit — not doing so is how the projects bug happened.

5. **The last-administrator guard has a gap I can see already:** "at least one
   active admin or pmo" — but if the only admin is *unaccepted* (invited, never
   signed in), the count says 1 and the real number able to act is 0. The guard
   must count **accepted, active** administrators, or a client can strand
   itself. Year-two self-recovery from a stranded instance is *not* possible
   without vendor SQL — which fails the bar — so this guard must be exactly
   right.

6. **"Sections role-only" assumes no client ever needs a person in a role to
   NOT see a section that role normally sees.** If that turns up, my
   recommendation forces an awkward answer (make a new role — which is locked).
   I believe it is right, but it is a judgement that trades a year-two "no" for
   architectural simplicity, and the owner should see it as a trade, not a
   fact. **His to confirm.**

7. **I have not verified `inviteUserByEmail` is available and configured** on
   this Supabase project (SMTP set up, redirect URLs allowed). If email is not
   configured, the entire invite flow — the thing that keeps passwords out of
   the PMO's hands — does not work, and Commit 2 would ship a create button
   that sends nothing. **Cheap to check before Commit 2; unproven now.**

8. **Membership soft-end + restore-returns-prior-projects (scenario 7) can
   restore a person to a project that was closed or reassigned while they were
   archived.** "Returns to exactly their prior projects" may be wrong if a
   project moved on. Needs a rule: restore revives memberships only for still-
   active projects, or surfaces the list for the PMO to confirm. As written it
   is too automatic.

**What this review could not see (Constraints #8, applied to the plan):** I
read schema, functions, policies and the nav model, but **not** the running
auth subsystem (invite delivery, session behaviour on a null role), **not**
Supabase Auth configuration, and **not** the edge-function runtime. Every claim
about `auth.admin.*` behaviour is from documented API contract, not from
observing it on this project. Those are Commit-2 proofs, and until they run the
account-creation path is designed, not demonstrated.

---

## 12. For the owner

- **Item 4 recommendation (sections role-only)** — confirm or ask for
  per-person overrides.
- **`building_engineers` retired at project level** — confirm the replace
  decision.
- Still-open rulings that gate parts of this: `plane` scope; `ceo` writes;
  Commit-3 survey-scope proposal.

**STOPPED HERE. No code.** The owner approves the design before anything is
built.
