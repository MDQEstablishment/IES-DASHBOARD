// AUTHORITY — the client mirror of public.authority_roles (migration 0142).
//
// Plain .js, deliberately: this is the one place the UI answers "who may do
// what", and it must be importable by the node test harness without a JSX
// transform. rbac.jsx re-exports it so RBAC callers find it where they expect.
//
// THIS IS A MIRROR, NOT THE SOURCE. The database is the source: projects_ins
// and projects_upd read authority_roles through public.may(), so the fence
// holds for a caller who never loads this file — anyone controlling the
// request payload walks straight past a UI check. A UI gate decides what to
// render; it decides nothing about what is permitted.
//
// tests/authorityParity.test.mjs reads the seed out of 0142 and fails if these
// sets and that seed ever diverge. That test is the point of this file:
// authority written down twice, free to drift, has now produced the same class
// of bug three times on this project — most recently a Programme Manager with
// no create button and, simultaneously, admin and ceo shown a button the
// database refused.
//
// Owner ruling 2026-08-06:
//   create — admin, ceo, pmo, progm   a Programme Manager runs a whole
//            programme, so barring him from creating a project inside it is
//            incoherent.
//   edit   — the above plus projm     a Project Manager edits his own project
//            but does not open new ones.
//
// "His own" is NOT restated here. projm is not a broad reader, and
// projects_read admits projm only for pm_id = auth.uid(), so a projm cannot
// see — and therefore cannot update — another manager's project. Repeating the
// ownership rule in a second place would be the very defect this file removes.
export const AUTHORITY = {
  'project.create': ['admin', 'ceo', 'pmo', 'progm'],
  'project.edit': ['admin', 'ceo', 'pmo', 'progm', 'projm'],
}

/** Client-side read of AUTHORITY. Named to match public.may() in the database
 *  so the two are recognisably the same question asked in two places. */
export const may = (action, role) => (AUTHORITY[action] || []).includes(role)
