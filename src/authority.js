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
// project.delete is SEPARATE from project.edit on purpose. Soft-delete is an
// UPDATE of deleted_at, so 0142 handed deletion to everyone who could edit
// without meaning to. 0144 fences the deleted_at transition with a trigger —
// RLS grants per command, not per column, so a policy could not express this.
// Each entry is role -> scope. 'all' = every project; 'own' = only projects the
// person is a member of (public.project_members). The role says WHAT, the
// membership says WHERE — the owner's principle, expressed in one place.
//
// Owner rulings 2026-08-08: plane is Programme-Manager equivalent (all); ceo
// writes. procm/proco are project-team members with project scope, not a
// separate class.
export const AUTHORITY = {
  'project.create': { admin: 'all', ceo: 'all', pmo: 'all', progm: 'all', plane: 'all' },
  'project.edit': { admin: 'all', ceo: 'all', pmo: 'all', progm: 'all', plane: 'all', projm: 'own' },
  'project.delete': { admin: 'all', ceo: 'all', pmo: 'all' },
  // the data-level action behind w_proj/w_bld: buildings, rooms, survey
  // entries, photos, operating hours, scope lines.
  // administering people (Settings): not per-project, so always 'all'.
  'user.admin': { admin: 'all', ceo: 'all', pmo: 'all' },
  'project.write': {
    admin: 'all', ceo: 'all', pmo: 'all', progm: 'all', plane: 'all',
    projm: 'own', proje: 'own', procm: 'own', proco: 'own',
  },
}

/** Roles holding an action at any scope. */
export const rolesFor = (action) => Object.keys(AUTHORITY[action] || {})

/** Scope of a role for an action, or undefined if it does not hold it. */
export const scopeOf = (action, role) => (AUTHORITY[action] || {})[role]

/**
 * Client-side read of AUTHORITY, named to match public.may().
 *
 * WITHOUT a project id this answers "on every project" — an 'own'-scope role
 * returns false, because the honest answer to "may you edit projects?" for a
 * project manager is "only the ones opened to you". A screen that needs the
 * per-project answer must pass the id, exactly as the RLS policy does.
 */
export const may = (action, role, projectId, memberOf = null) => {
  const scope = scopeOf(action, role)
  if (!scope) return false
  if (scope === 'all') return true
  if (projectId == null || memberOf == null) return false
  return memberOf.includes(projectId)
}
