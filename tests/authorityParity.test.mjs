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

import { AUTHORITY, may } from '../src/authority.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const MIGRATION = 'supabase/migrations/0142_project_authority.sql'
const PAGE = 'src/pages/Projects.jsx'
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// Every role the system defines. A new role must be classified against every
// action deliberately — the test below fails until it is.
const ALL_ROLES = ['ceo', 'pmo', 'procm', 'proco', 'progm', 'projm', 'proje', 'plane', 'admin']

/** Pull the seeded (action, role) pairs out of the migration's INSERT. */
function seedFromMigration() {
  const sql = read(MIGRATION)
  const block = sql.match(/insert into public\.authority_roles \(action, role\) values([\s\S]*?);/i)
  assert.ok(block, `${MIGRATION}: could not find the authority_roles seed INSERT`)
  const pairs = [...block[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => [m[1], m[2]])
  assert.ok(pairs.length > 0, `${MIGRATION}: seed INSERT parsed to zero rows`)
  const out = {}
  for (const [action, role] of pairs) (out[action] ||= []).push(role)
  return out
}

test('T-AUTH1 — the migration seed and the src/authority.js mirror are the same sets', () => {
  const seed = seedFromMigration()
  assert.deepEqual(
    Object.keys(seed).sort(), Object.keys(AUTHORITY).sort(),
    'the two representations cover different actions',
  )
  for (const action of Object.keys(seed)) {
    assert.deepEqual(
      [...seed[action]].sort(), [...AUTHORITY[action]].sort(),
      `DIVERGENCE on "${action}": the database seed and src/authority.js disagree. ` +
      `Change both, or neither — that disagreement is the bug this test exists for.`,
    )
  }
})

test('T-AUTH2 — the owner ruling of 2026-08-06, pinned literally', () => {
  // Pinned so a well-meaning edit to one side cannot quietly redefine
  // authority while still passing T-AUTH1 (which only checks agreement).
  assert.deepEqual([...AUTHORITY['project.create']].sort(), ['admin', 'ceo', 'pmo', 'progm'])
  assert.deepEqual([...AUTHORITY['project.edit']].sort(), ['admin', 'ceo', 'pmo', 'progm', 'projm'])
})

test('T-AUTH3 — every known role is decided for every action, and no unknown role appears', () => {
  for (const [action, roles] of Object.entries(AUTHORITY)) {
    for (const r of roles) {
      assert.ok(ALL_ROLES.includes(r), `${action}: "${r}" is not a role this system defines`)
    }
    assert.equal(new Set(roles).size, roles.length, `${action}: duplicate role in the list`)
  }
  // progm is the role the original bug denied. Pinned by name so it cannot be
  // dropped again without a test failing.
  assert.ok(may('project.create', 'progm'), 'progm must be able to create a project')
  assert.ok(may('project.edit', 'progm'), 'progm must be able to edit a project')
})

test('T-AUTH4 — the RLS policies are derived from the table, not from a restated list', () => {
  const sql = read(MIGRATION)
  for (const [policy, action] of [['projects_ins', 'project.create'], ['projects_upd', 'project.edit']]) {
    const re = new RegExp(`create policy ${policy}[\\s\\S]*?;`, 'i')
    const body = sql.match(re)
    assert.ok(body, `${MIGRATION}: ${policy} not found`)
    assert.match(body[0], new RegExp(`public\\.may\\('${action.replace('.', '\\.')}'\\)`),
      `${policy} must delegate to public.may('${action}')`)
    assert.doesNotMatch(body[0], /auth_role\(\)\s*=/,
      `${policy} restates a role literal instead of reading authority_roles — that is the defect returning`)
  }
})

test('T-AUTH5 — Projects.jsx holds no inline role array for these gates', () => {
  const page = read(PAGE)
  const canAdd = page.match(/const canAdd\s*=.*/)?.[0] ?? ''
  const canEdit = page.match(/const canEdit\s*=.*/)?.[0] ?? ''
  assert.match(canAdd, /may\('project\.create'/, 'canAdd must come from may()')
  assert.match(canEdit, /may\('project\.edit'/, 'canEdit must come from may()')
  for (const [name, line] of [['canAdd', canAdd], ['canEdit', canEdit]]) {
    assert.doesNotMatch(line, /\[\s*'/, `${name} has an inline role array again — read it from AUTHORITY`)
  }
})
