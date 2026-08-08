// AUTHORITY PARITY — the UI role set and the RLS role set must be one set.
//
// This file exists because the divergence IS the defect. Authority over
// projects was written down twice — an inline array in src/pages/Projects.jsx
// and a WITH CHECK expression in 0018 — and for seven weeks they disagreed in
// both directions simultaneously: progm was refused a button he was entitled
// to, while admin and ceo were shown one the database would refuse. That is
// the third bug of this class on this project.
//
// Correcting the lists would not have prevented a fourth. Only a test that
// fails on divergence does, so this one reads BOTH representations from disk
// and compares them as sets:
//
//   source  supabase/migrations/0142_project_authority.sql  (authority_roles seed)
//   mirror  src/authority.js                                 (AUTHORITY)
//
// It parses the migration text rather than querying the database on purpose:
// CI has no database credentials, and a check that silently skips is not a
// gate. The live database was proven separately by DO-block INSERT/UPDATE
// probes run as `authenticated` for all nine roles — see docs/Backlog.md and
// the 0142 header. Those probes are the proof that the fence holds; this test
// is the proof that the two written copies cannot drift apart again.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { AUTHORITY, may, rolesFor, scopeOf } from '../src/authority.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const MIGRATIONS_DIR = 'supabase/migrations'
const POLICY_MIGRATION = 'supabase/migrations/0142_project_authority.sql'
const PAGE = 'src/pages/Projects.jsx'
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// Every role the system defines. A new role must be classified against every
// action deliberately — the test below fails until it is.
const ALL_ROLES = ['ceo', 'pmo', 'procm', 'proco', 'progm', 'projm', 'proje', 'plane', 'admin']

/**
 * Replay authority_roles across EVERY migration, in filename order, and return
 * the resulting state.
 *
 * Deliberately not pinned to one filename. The first version of this gate read
 * only 0142, which meant a later migration could change authority_roles and the
 * test would still pass against a stale seed — divergence with a green gate,
 * the exact failure this file exists to prevent, reintroduced by the file
 * itself. 0144 (project.delete) is the case that proved it: the pinned version
 * would have gone red for the wrong reason and been "fixed" by editing an
 * already-applied migration, which never re-runs on a deployed database.
 */
function seedFromMigrations() {
  const files = fs.readdirSync(path.join(ROOT, MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const state = new Map()   // "action role" -> scope
  let sawAny = false
  for (const f of files) {
    const sql = read(path.posix.join(MIGRATIONS_DIR, f))
    // both (action, role) and (action, role, scope) forms appear across
    // migrations; the column default is 'all', so a two-column row means 'all'.
    for (const block of sql.matchAll(/insert into public[.]authority_roles\s*[(]action,\s*role(?:,\s*scope)?[)]\s*values([\s\S]*?);/gi)) {
      sawAny = true
      for (const m of block[1].matchAll(/[(]\s*'([^']+)'\s*,\s*'([^']+)'\s*(?:,\s*'([^']+)'\s*)?[)]/g)) {
        state.set(m[1] + ' ' + m[2], m[3] || 'all')
      }
    }
    // a later migration may re-scope an existing row
    for (const upd of sql.matchAll(/update public[.]authority_roles set scope\s*=\s*'([^']+)'\s+where([\s\S]*?);/gi)) {
      for (const m of upd[2].matchAll(/action\s*=\s*'([^']+)'[\s\S]*?role\s*=\s*'([^']+)'/g)) {
        if (state.has(m[1] + ' ' + m[2])) state.set(m[1] + ' ' + m[2], upd[1])
      }
    }
    // ...or withdraw it entirely
    for (const del of sql.matchAll(/delete from public[.]authority_roles\s+where([\s\S]*?);/gi)) {
      for (const m of del[1].matchAll(/action\s*=\s*'([^']+)'[\s\S]*?role\s*=\s*'([^']+)'/g)) {
        state.delete(m[1] + ' ' + m[2])
      }
    }
  }
  assert.ok(sawAny, MIGRATIONS_DIR + ': no authority_roles seed INSERT found in any migration')
  const out = {}
  for (const [k, scope] of state) { const [a, r] = k.split(' '); (out[a] ||= {})[r] = scope }
  return out
}

test('T-AUTH1 — authority_roles replayed across ALL migrations equals the src/authority.js mirror', () => {
  const seed = seedFromMigrations()
  assert.deepEqual(
    Object.keys(seed).sort(), Object.keys(AUTHORITY).sort(),
    'the two representations cover different actions',
  )
  for (const action of Object.keys(seed)) {
    // roles AND scopes must match: a role in both lists at the wrong scope is
    // still a divergence — 'all' vs 'own' is the whole where-question.
    assert.deepEqual(
      seed[action], AUTHORITY[action],
      `DIVERGENCE on "${action}": the migrations and src/authority.js disagree on ` +
      `roles or scope. Change both, or neither — that disagreement is the bug ` +
      `this test exists for.`,
    )
  }
})

test('T-AUTH2 — the owner rulings, pinned literally', () => {
  // Pinned so a well-meaning edit to one side cannot quietly redefine
  // authority while still passing T-AUTH1 (which only checks agreement).
  assert.deepEqual(rolesFor('project.create').sort(), ['admin', 'ceo', 'plane', 'pmo', 'progm'])
  assert.deepEqual(rolesFor('project.delete').sort(), ['admin', 'ceo', 'pmo'])
  assert.ok(!rolesFor('project.delete').includes('progm'), 'progm may edit but must not delete')
  assert.ok(!rolesFor('project.delete').includes('projm'), 'projm may edit but must not delete')
  // the WHERE half — all-projects vs own-projects, ruled 2026-08-08
  assert.deepEqual(rolesFor('project.write').filter((r) => scopeOf('project.write', r) === 'all').sort(),
    ['admin', 'ceo', 'plane', 'pmo', 'progm'])
  assert.deepEqual(rolesFor('project.write').filter((r) => scopeOf('project.write', r) === 'own').sort(),
    ['proco', 'procm', 'proje', 'projm'].sort())
  assert.equal(scopeOf('project.edit', 'projm'), 'own', 'a project manager edits only his own projects')
  assert.equal(scopeOf('project.write', 'plane'), 'all', 'plane is Programme-Manager equivalent')
  // ceo = PMO equivalent (0147/0148): every action pmo holds, ceo holds, at the
  // same scope. Authority equivalence — NOT seniority: role_rank keeps ceo
  // above pmo so a pmo still cannot edit a ceo.
  for (const action of Object.keys(AUTHORITY)) {
    const pmoScope = scopeOf(action, 'pmo')
    if (!pmoScope) continue
    assert.equal(scopeOf(action, 'ceo'), pmoScope,
      `ceo must match pmo on "${action}" — ceo is PMO-equivalent`)
  }
  assert.deepEqual(rolesFor('user.admin').sort(), ['admin', 'ceo', 'pmo'])
})

test('T-AUTH3 — every known role is decided for every action, and no unknown role appears', () => {
  for (const [action, roles] of Object.entries(AUTHORITY)) {
    for (const [r, scope] of Object.entries(roles)) {
      assert.ok(ALL_ROLES.includes(r), `${action}: "${r}" is not a role this system defines`)
      assert.ok(['all', 'own'].includes(scope), `${action}.${r}: scope "${scope}" is neither all nor own`)
    }
  }
  // EVERY known role must be decided for project.write — the action that gates
  // all project data. An unclassified role would silently have no access at
  // all, which is the failure this assertion exists to make loud.
  for (const r of ALL_ROLES) {
    assert.ok(scopeOf('project.write', r), `role "${r}" has no project.write scope — classify it deliberately`)
  }
  // progm is the role the original bug denied. Pinned by name so it cannot be
  // dropped again without a test failing.
  assert.ok(may('project.create', 'progm'), 'progm must be able to create a project')
  assert.ok(may('project.edit', 'progm'), 'progm must be able to edit a project')
  // an own-scope role answers false without a project, true for one it is in
  assert.equal(may('project.edit', 'projm'), false, 'no project id = the all-projects question')
  assert.equal(may('project.edit', 'projm', 'P1', ['P1']), true)
  assert.equal(may('project.edit', 'projm', 'P2', ['P1']), false)
})

test('T-AUTH4 — the RLS policies are derived from the table, not from a restated list', () => {
  const sql = read(POLICY_MIGRATION)
  for (const [policy, action] of [['projects_ins', 'project.create'], ['projects_upd', 'project.edit']]) {
    const re = new RegExp(`create policy ${policy}[\\s\\S]*?;`, 'i')
    const body = sql.match(re)
    assert.ok(body, `${POLICY_MIGRATION}: ${policy} not found`)
    assert.match(body[0], new RegExp(`public\\.may\\('${action.replace('.', '\\.')}'\\)`),
      `${policy} must delegate to public.may('${action}')`)
    assert.doesNotMatch(body[0], /auth_role\(\)\s*=/,
      `${policy} restates a role literal instead of reading authority_roles — that is the defect returning`)
  }
})

test('T-AUTH5 — Projects.jsx derives both gates from AUTHORITY, never from an inline list', () => {
  const page = read(PAGE)

  const canAdd = page.match(/const canAdd\s*=.*/)?.[0] ?? ''
  assert.match(canAdd, /may\('project\.create'/, 'canAdd must come from may()')

  // The edit gate is now PER CARD, because projm holds project.edit at 'own'
  // scope: a page-level answer would either hide the button from a project
  // manager on his own project, or show it on every project. It must pass the
  // project id and the membership list, exactly as the RLS policy does.
  assert.match(page, /may\('project\.edit',\s*role,\s*p\.id,\s*memberOf\)/,
    'the per-card edit gate must be may(project.edit, role, p.id, memberOf)')
  assert.match(page, /rolesFor\('project\.edit'\)/,
    'the read-only banner must ask rolesFor(), not a hand-written list')
  assert.doesNotMatch(page, /const canEdit\s*=\s*\[/, 'canEdit must not be an inline role array')

  for (const [name, line] of [['canAdd', canAdd]]) {
    assert.doesNotMatch(line, /\[\s*'/, `${name} has an inline role array again — read it from AUTHORITY`)
  }
})
