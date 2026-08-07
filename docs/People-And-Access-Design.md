# People and Access — design

**Status: PLAN ONLY. Nothing here is built. It must not block the survey.**

## 0. The bar

The owner intends to sell this system to many clients. His words: *"imagine I
sold this to a hundred clients; how could I fix everything for a hundred
clients."* Every action that requires MDQ to touch a database is multiplied by
the customer count and becomes unsellable.

**The bar: the PMO at the client runs the entire people-and-access lifecycle
with no vendor involvement.** Scope is roles, permissions and accounts — not
calculations, which stay locked by design.

---

## 1. What is possible TODAY — checked against the live database and the actual
## screens, not inferred from the presence of a tab

| # | Action | Possible today | What is missing | Fix is a… |
|---|---|---|---|---|
| 1 | **PMO creates a new user account end to end** (auth user, not just a profiles row) | **NO — nothing exists** | There is no create-user UI anywhere in Settings; no `INSERT` policy on `profiles` (nobody can insert one from the client); no trigger on `auth.users` to create a profile; and creating an auth user requires the service role, which the browser must never hold. Today the only path is vendor SQL or the Supabase dashboard. | **Edge function** (+ a screen). This is the highest-frequency support ticket there is — every new hire at every client. |
| 2 | **PMO sets and later changes a person's role** | **YES** | Nothing. Settings → Users has a role dropdown; `profiles_upd` admits pmo/admin; `profiles_guard` enforces the rank rules. Works today. | — |
| 3 | **PMO assigns a person to a project** | **PARTLY** | Only via the project card's single "Project manager" / "Project engineer" selects, not from Settings, and only for those two slots. There is no membership concept, so `procm`/`proco` cannot be attached to a project at all. | **Schema** (membership) + screen |
| 4 | **One person holds two or more projects** | **YES — structurally fine** | Nothing. `pm_id` lives on the *project* row and has **no unique constraint**, so one person can be PM of any number of projects. See §1.1 — the real limit is the mirror image of this. | — |
| 5 | **PMO deactivates a leaver and hands their work over** | **PARTLY — and one part is unsafe** | Archive exists and `profiles_archive_cascade` moves reports, open tasks and open escalations to the **leaver's manager**. Three gaps: handover target is fixed to the manager (cannot choose a person); with no manager the work is silently **left in place**; and coverage stops at tasks and escalations — project `pm_id`, `engineer_id`, documents and authored records are untouched. **And archiving does not revoke access** (§1.2). | **Schema + edge function** for the access half; **screen** for choosing the target |

### 1.1 The structural finding that matters most — restated correctly

The earlier framing was that single-slot columns prevent "one person on two
projects". **That is not the limit.** `pm_id` is a column on the *project* row
with no unique constraint, so one person holding many projects — the owner's
"one Project Manager running two sites" — **works today**.

The real limit is the mirror image: **one project cannot hold many people.**
There is one PM slot and one engineer slot per project, and nothing at all for
`procm`/`proco`. So:

- a survey crew of three on one project is not expressible;
- the "own project" scope the owner ruled for `projm, proje, procm, proco` has
  **nothing to resolve against** for procm and proco;
- reassignment works for the PM slot (it is an `UPDATE`, and `audit_projects`
  records it) but keeps no history and silently removes the previous holder.

A real membership relation already exists — `building_engineers`, PK
`(building_id, engineer_id)`, with a `role` column — at the **building** level,
holding **0 rows**, written by **nothing**, and consulted only for `proje`.
The right table exists at the wrong level and was never wired up.

### 1.2 Archiving does not revoke access — a live gap

`archived` is checked by **no** access function: not `auth_role`, not
`is_broad_reader`, not `can_read_project`/`can_read_building`, not
`w_proj`/`w_bld`, not `may`. An archived person whose credentials still work
retains their full role authority. The screen says *"They lose access
immediately."* **They do not.** This is independent of everything else in this
document and is the cheapest serious fix on the list.

---

## 2. What already works, and must be built on rather than replaced

`profiles_guard` is a real privilege-escalation guard and it is good:

- nobody may change **their own** role;
- a non-admin may only change roles **strictly below their own rank**, on both
  the old and the new value;
- `role_rank`: admin 0, ceo 1, pmo 2, progm 3, procm 3, projm 4, proco 5,
  proje 5, plane 5.

So a PMO (rank 2) can already manage progm, procm, projm, proco, proje and
plane — and **cannot** create or modify an admin, a ceo, or another pmo. The
self-service design extends this guard; it does not invent one.

---

## 3. The design

### 3.1 Feature A — account lifecycle (fixes #1)

An edge function `admin-users`, service-role internally, never exposing that
key to the browser. Every call:

1. authenticates the caller from their JWT;
2. re-derives the caller's role **server-side from `profiles`** — never trusts
   a role sent by the client;
3. checks `may('user.create')` / `may('user.role.set')` etc. against
   `authority_roles`, the same single source as everything else;
4. re-applies the `role_rank` rule of §2 **in the function**, because the
   `profiles_guard` trigger cannot see a `auth.admin.createUser` call;
5. writes an explicit `audit_log` row (§3.5) before returning.

Operations: `create` (creates the auth user **and** the profile in one call,
sends an invite rather than setting a password), `set_role`, `archive`,
`restore`, `resend_invite`. Deliberately **not** `delete` — leavers are
archived, never removed, or the audit trail loses its subject.

A `handle_new_user` trigger on `auth.users` creates the matching `profiles`
row, so an account created by any route (invite, dashboard, future SSO) cannot
exist without a profile. Today's mismatch is 9 auth users / 9 profiles — even,
but by luck, not by construction.

### 3.2 Feature B — project membership and reassignment (fixes #3, and the
### "own project" scope generally)

New table `project_members`:

```
project_id  uuid  -> projects
user_id     uuid  -> profiles
member_role text        -- 'pm' | 'engineer' | 'surveyor' | 'procurement' | …
added_by    uuid, added_at timestamptz
removed_by  uuid, removed_at timestamptz   -- soft, never deleted
primary key (project_id, user_id, member_role)
```

Membership is **soft-ended, not deleted**, so "who had access in March" is
answerable — the reassignment case needs history, not just current state.

`may(action, project_id)` becomes the single predicate: an `authority_roles`
row carries a **scope** (`all` or `own`); `all` resolves on role alone, `own`
resolves against a live `project_members` row. One source, both halves.

`projects.pm_id` stays as the *display* "who is the lead", and a trigger keeps
it consistent with the `pm` membership row so the existing UI keeps working
during migration. `building_engineers` is folded in as building-level
membership or retired — decided at build time, not now.

**Reassignment** is then: end one membership, start another, both audited, work
handover separate (§3.3).

### 3.3 Feature C — work handover (fixes the second half of #5)

**This is a separate feature from membership and must not hide inside it.**
Membership decides what a person *may* see. Handover decides what happens to
the records that are *already theirs*. Removing membership alone leaves
orphaned work that nobody can see or close — which is exactly how it would
surface later, as "we gave her access but his tasks are still assigned to the
person who left."

Extends `profiles_archive_cascade` rather than replacing it:

- the handover target becomes a **chosen person**, defaulting to the manager
  (today it is the manager or nothing);
- **no manager and no chosen target is refused**, not warned — the current
  silent "left in place" is the failure mode;
- coverage extends past tasks and escalations to project/building membership
  and the `pm_id`/`engineer_id` display slots;
- the operation is one transaction and writes **one summary audit row** naming
  from, to, and counts per entity type, so the handover is legible as a single
  act rather than reconstructed from fifty rows.

### 3.4 Bootstrap — a new client instance at hour zero

A system that cannot create its own first administrator without vendor SQL
fails the test before it starts.

`supabase/migrations/*_bootstrap.sql` ships a `bootstrap_first_admin(email)`
function that is **self-disabling**: it succeeds only while
`select count(*) from profiles` is zero, and refuses forever after. Deployment
runs it once with the client's PMO email; it creates the auth user, sends the
invite, seeds the profile as `pmo`, writes an audit row, and cannot be used
again. From that point the PMO creates everyone else through §3.1.

No vendor involvement, and no permanently-armed god function.

### 3.5 The guard — self-service without an open door

Self-service account creation is a privilege-escalation surface: a PMO who can
set roles can create an admin, and a compromised PMO becomes total control.
The guard, stated as rules rather than intentions:

1. **Rank rule, enforced twice** — in `profiles_guard` (for direct updates) and
   again inside the edge function (for `auth.admin` calls the trigger cannot
   see). A PMO may not create, modify or archive an `admin`, a `ceo`, or
   another `pmo`. **Only an admin may mint an admin.**
2. **Never trust a client-supplied role.** The caller's role is re-read from
   `profiles` server-side on every call.
3. **`authority_roles` is not self-service.** It is migration-only, and 0143
   revoked client INSERT/UPDATE/DELETE/TRUNCATE on it. A PMO administers
   *people*, never the *permission model* — otherwise self-service is a route
   to granting oneself anything.
4. **No self-promotion**, already enforced: nobody may change their own role.
5. **Archive, never delete**, so the audit subject always exists.
6. **Every grant, role change and account creation is audited** — actor, target,
   before/after role, and for memberships the project and member_role. The
   `audit_log` fence from 0143 makes this stick: clients hold no
   INSERT/UPDATE/DELETE/TRUNCATE on it, and the trigger writes as
   SECURITY DEFINER, so **the log cannot be edited by the party it observes**.
   The audit log is the control the owner named; §1.2 must be fixed or an
   archived account can still act *and* be logged doing it.
7. **A second admin is required before the first can be archived** — no
   instance may be left with no one able to mint an admin.

### 3.6 Generated role descriptions — closing the fourth source

Settings' "Roles & Permissions" descriptions are **hand-written prose**: a
fourth place authority is described, after the RLS policies, the inline arrays
and `authority_roles`. It is also **the only one the owner ever reads**, which
makes it the most dangerous to let drift — he reads a false description and
believes it.

It must be **generated from `authority_roles`**, not written. Generation makes
drift impossible rather than merely detectable, which is strictly better than
adding a sixth parity test. The screen keeps a short hand-written line of
*intent* per role, clearly separated from the generated list of *actual*
authority, so prose can never masquerade as fact.

---

## 4. Sequencing — and why none of this blocks the survey

| order | item | why |
|---|---|---|
| 0 | **Fix §1.2** — archived users keep access | Independent, small, and currently a live gap between what the screen promises and what the database does |
| 1 | Feature A — account lifecycle | Highest ticket volume; unblocks selling |
| 2 | Feature B — membership + `may(action, project_id)` | Unblocks "own project" scope properly |
| 3 | Feature C — handover | Needs B's membership to hand over |
| 4 | §3.6 generated descriptions | Cheap once B exists |

**The survey does not wait for any of it.** Survey C8 is rewritten to work on
roles alone: the crew operates under programme-level roles that resolve with
`scope = all`, which needs no membership table. When Feature B lands, the
survey's access narrows from role-wide to project-scoped **without a schema
change to the survey itself** — only the `authority_roles` scope value moves.

---

## 5. Open for the owner

1. **`plane` and `ceo`** — his instruction (plane = progm's permissions; ceo
   writes) contradicts the documented design on the Settings screen (plane =
   schedule/progress/delay analysis; ceo = portfolio-wide read, no writes),
   and the database agrees with the screen. Unresolved; nothing built either
   way.
2. **Does the PMO administer people at the client, or a dedicated admin?** The
   design assumes PMO, per his examples.
3. **Invite-by-email or PMO-set password?** Invite is assumed — it avoids the
   PMO ever knowing a user's credentials.
4. **Building-level membership** — fold `building_engineers` into
   `project_members`, or keep both levels?
