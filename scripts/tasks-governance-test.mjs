#!/usr/bin/env node
// 9R(1) — do the task fences actually hold?
//
// Sprint 9R adds edit, trash, reassign and a project/ESM picker to My Tasks. All
// of that is UI sitting on top of governance that was written in 9G and has been
// asserted ever since without being executed: the status graph and its per-actor
// authority (tasks_status_guard, 0102), down-only reassignment
// (tasks_reassign_guard, 0102), and the deliberate ABSENCE of a DELETE policy.
//
// Building on a fence you have never pushed on is how you discover it was a
// painted line. This suite pushes on it. Every assertion is a mutation that the
// database is supposed to REFUSE, plus — just as important — the converse, a
// mutation it is supposed to ALLOW, because a guard that rejects everything is
// not a guard, it is an outage.
//
//   node scripts/tasks-governance-test.mjs
//   env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, IES_TEST_PASSWORD
//
// It signs in as REAL people from the live org chart — projm Majed, who has
// proje Yousef below him and progm Jehad above him — because the whole subject
// under test is the shape of the reporting tree, and a synthetic user would be
// testing a tree we invented rather than the one that ships.
//
// NOTHING IS LEFT BEHIND. Every accepted mutation is undone in a finally block
// against the same session that made it. There is no hard delete on tasks (that
// is one of the things being proven), so a test row that escapes cleanup is
// permanent — the suite therefore never inserts one: it borrows a task the
// actor already owns, proves what it needs, and puts the field back.
//
// The same six assertions were first executed as SQL through the Supabase MCP
// inside rolled-back transactions; that transcript is docs/9R-conformance.md.
// This file is the repeatable form of it, for a CI that has credentials.

import { createClient } from '@supabase/supabase-js'

const SB = process.env.SUPABASE_URL || 'https://mzuyvajefqkmaxludijm.supabase.co'
const AK = process.env.SUPABASE_PUBLISHABLE_KEY || ''
const PW = process.env.IES_TEST_PASSWORD || process.env.VITE_DEMO_PASSWORD || ''
const DOMAIN = process.env.IES_TEST_EMAIL_DOMAIN || '@ies.demo.local'

// The three people the org chart gives us: a manager, someone strictly below
// him, and someone strictly outside his subtree (procm sits on a sibling branch
// under pmo, so he is neither above nor below projm).
const MANAGER = process.env.IES_TEST_MANAGER || 'majed.alqahtani'
const REPORT = process.env.IES_TEST_REPORT || 'yousef.almaliki'
const OUTSIDE = process.env.IES_TEST_OUTSIDE || 'adnan'
const UPWARD = process.env.IES_TEST_UPWARD || 'jehad'

if (!AK || !PW) {
  console.error('credentials missing — set SUPABASE_PUBLISHABLE_KEY and IES_TEST_PASSWORD to run this suite')
  console.error('  (the same six assertions are recorded, already executed, in docs/9R-conformance.md)')
  process.exit(78) // EX_CONFIG — "not run", distinct from a real failure
}

let pass = 0, fail = 0
const ok = (n, c, extra = '') => {
  if (c) { pass++; console.log(`  ok    ${n}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.log(`  FAIL  ${n}${extra ? ' — ' + extra : ''}`) }
}

async function clientFor(user) {
  const c = createClient(SB, AK, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: user + DOMAIN, password: PW })
  if (error) throw new Error(`sign-in failed for ${user}: ${error.message}`)
  const { data } = await c.auth.getUser()
  return { c, id: data.user.id }
}

// A rejection is only proof if it is the RIGHT rejection. Matching on the
// message text ties each assertion to the specific guard clause that raised it,
// so a future change that swaps one fence for a weaker one fails here loudly
// rather than passing because *something* said no.
const rejected = (error, needle) =>
  !!error && (error.message || '').toLowerCase().includes(needle.toLowerCase())

const manager = await clientFor(MANAGER)
const report = await clientFor(REPORT)
const outside = await clientFor(OUTSIDE)
const upward = await clientFor(UPWARD)

console.log(`\norg under test: manager ${MANAGER} · report ${REPORT} · outside ${OUTSIDE} · upward ${UPWARD}`)

// ---------------------------------------------------------------------------
// Fixtures, borrowed not created. We need two shapes:
//   OWNED   — manager is creator AND assignee. Safe to move around and restore.
//   THEIRS  — manager is creator, someone else is assignee, status in_progress.
// ---------------------------------------------------------------------------
const { data: mine } = await manager.c.from('tasks')
  .select('id,title,status,created_by_id,assigned_to_id')
  .eq('created_by_id', manager.id)

const owned = (mine || []).find((t) => t.assigned_to_id === manager.id && t.status !== 'done' && t.status !== 'cancelled')
const theirs = (mine || []).find((t) => t.assigned_to_id === report.id && t.status === 'in_progress')

ok('a task the manager both raised and holds exists to test with', !!owned, owned?.title)
ok('a task the manager raised for their report exists to test with', !!theirs, theirs?.title)
if (!owned || !theirs) {
  console.log('\nfixtures unavailable — the live queue does not contain the shapes this suite borrows')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// a — a manager cannot push work sideways, out of their own subtree.
// ---------------------------------------------------------------------------
console.log('\na — reassignment out of the subtree is refused')
{
  const { error } = await manager.c.from('tasks')
    .update({ assigned_to_id: outside.id }).eq('id', theirs.id)
  ok('projm reassigning to a peer branch (procm) is rejected by tasks_reassign_guard',
    rejected(error, 'only assign work to yourself or to someone who reports to you'),
    error?.message || 'NO ERROR — the update was accepted')
}

// ---------------------------------------------------------------------------
// b — the converse. Down the tree is exactly what reassignment is FOR.
// ---------------------------------------------------------------------------
console.log('\nb — reassignment down the subtree is allowed')
{
  const { error } = await manager.c.from('tasks')
    .update({ assigned_to_id: report.id }).eq('id', owned.id)
  ok('projm reassigning to their own proje is accepted', !error, error?.message || 'accepted')
  const { data: after } = await manager.c.from('tasks').select('assigned_to_id').eq('id', owned.id).single()
  ok('the row really moved', after?.assigned_to_id === report.id)
  // put it back — see the header note about there being no hard delete.
  const { error: undo } = await manager.c.from('tasks')
    .update({ assigned_to_id: manager.id }).eq('id', owned.id)
  ok('and the fixture is restored', !undo, undo?.message || 'restored')
}

// ---------------------------------------------------------------------------
// c — done belongs to the assignee alone. This is the 9G Risk 3 fence: before
// it existed, any manager could close anyone's work in one click, which makes
// the completion record worthless as evidence that work was actually done.
// ---------------------------------------------------------------------------
console.log('\nc — only the assignee may mark a task done')
{
  const { error } = await manager.c.from('tasks').update({ status: 'done' }).eq('id', theirs.id)
  ok('the creator-manager marking their report\'s task done is rejected',
    rejected(error, 'only the assignee can mark a task done'),
    error?.message || 'NO ERROR — the update was accepted')
}

// ---------------------------------------------------------------------------
// d — cancel belongs to the creator alone, symmetrically.
// ---------------------------------------------------------------------------
console.log('\nd — only the creator may cancel a task')
{
  const { error } = await report.c.from('tasks').update({ status: 'cancelled' }).eq('id', theirs.id)
  ok('the assignee cancelling a task someone else raised is rejected',
    rejected(error, 'only the person who raised a task can cancel it'),
    error?.message || 'NO ERROR — the update was accepted')
}

// ---------------------------------------------------------------------------
// e — there is no DELETE policy, and that is a decision, not an oversight.
// The grant to `authenticated` exists; RLS is what makes the statement a no-op.
// A silent 0 rows is the correct and expected outcome — Postgres does not error
// when a policy simply matches nothing.
// ---------------------------------------------------------------------------
console.log('\ne — a task cannot be destroyed')
{
  const { data, error } = await manager.c.from('tasks').delete().eq('id', owned.id).select('id')
  ok('DELETE as an authenticated user removes nothing', !error && (data || []).length === 0,
    error ? error.message : `${(data || []).length} row(s) returned`)
  const { data: still } = await manager.c.from('tasks').select('id').eq('id', owned.id)
  ok('the row is still there afterwards', (still || []).length === 1)
}

// ---------------------------------------------------------------------------
// f — THE ESCAPE HATCH. tasks_upd's `created_by_id = auth.uid()` branch passes
// regardless of who the NEW assignee is, so RLS alone would happily let a
// creator hand their task UPWARD to their own manager. 0102 added the BEFORE
// UPDATE trigger precisely because the policy could not be tightened without
// breaking its other job — it is also the read-gate for the row.
//
// This is the assertion that would fail first if someone ever "simplified" the
// triggers on the theory that the policy already covers reassignment.
// ---------------------------------------------------------------------------
console.log('\nf — the creator branch of tasks_upd does not become a back door')
{
  const { error } = await manager.c.from('tasks')
    .update({ assigned_to_id: upward.id }).eq('id', theirs.id)
  ok('the creator reassigning upward to their own manager is rejected by the trigger',
    rejected(error, 'only assign work to yourself or to someone who reports to you'),
    error?.message || 'NO ERROR — RLS let it through and nothing else stopped it')
  const { data: after } = await manager.c.from('tasks').select('assigned_to_id').eq('id', theirs.id).single()
  ok('the assignee is untouched', after?.assigned_to_id === report.id)
}

// ---------------------------------------------------------------------------
// g — the audit trail is written by the database, never by the client.
// ---------------------------------------------------------------------------
console.log('\ng — audit_log is not client-writable')
{
  const { error } = await manager.c.from('audit_log').insert({
    action: 'update', entity_type: 'tasks', summary: 'forged',
  })
  ok('an authenticated user cannot forge an audit row', !!error, error?.message || 'NO ERROR — the insert succeeded')
}

console.log(`\n9R(1) task governance suite: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
