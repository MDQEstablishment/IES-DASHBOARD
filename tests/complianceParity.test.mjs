// U5 / COMMIT A — THE AGREEMENT TABLE.
//
// This test is the point of the commit. Between sprint U3 and this commit the
// browser engine and the Edge Function disagreed about which replacement units
// are compliant, on live data, silently:
//
//   · the server multiplied by the seasonal factor UNCONDITIONALLY inside the
//     15% gate (`((newSeer - g.seer) / newSeer) * seasonal * 100 < minSav`), so
//     it demanded ≈16.7% raw savings where the client demanded 15% — every
//     candidate between those two numbers was offered by the browser and
//     withheld by the server;
//   · the server matched equipment types by bidirectional substring, so "Split"
//     covered "Split AC" on the server and did not in the browser;
//   · the server hardcoded 12000 BTU/ton after that number moved into
//     tarshid_constants.
//
// The fix is structural: ONE predicate in supabase/functions/_shared/compliance.js,
// imported by both runtimes. This file proves the two adaptors over it never
// part company, on a case table that walks every boundary the gate has — and
// PART C below re-implements the OLD server predicate so the bug itself stays
// visible and a revert is loud rather than silent.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// (a) the client engine's public gate, exactly as the app calls it
import { isCompliant, CONST_DEFAULTS } from '../src/lib/savingSheet.js'
// (b) the Edge Function's gate, exactly as saving-sheet-agent/index.ts calls it:
//     `const compliant = (g, c) => serverCompliant(g, c, C, engine).ok`
import { serverCompliant, constsFromRows, btuPerTon } from '../supabase/functions/_shared/compliance.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const C = { ...CONST_DEFAULTS }

// ── THE CASE TABLE ──────────────────────────────────────────────────────────
// One old unit + one candidate per case, described ONCE and projected into both
// call shapes below. `note` names what the case is for, so a failure reads as a
// sentence rather than as an index.
//
// SEER pairs are chosen so the arithmetic lands on the boundary exactly:
// (10 − 8.50) / 10 = 15.0% precisely, 8.51 → 14.9%, 8.49 → 15.1%.
// Capacities likewise: 110000/100000 is exactly +10%, 110100 is +10.1%.
const CASES = [
  // ── savings boundary, seasonal OFF (the shipped default) ──────────────────
  { note: 'savings 14.9% — just under the 15% floor', oldBtu: 100000, oldSeer: 8.51, newBtu: 100000, newSeer: 10 },
  { note: 'savings exactly 15.0% — the floor is inclusive', oldBtu: 100000, oldSeer: 8.5, newBtu: 100000, newSeer: 10 },
  { note: 'savings 15.1% — just over. THE SERVER USED TO REJECT THIS.', oldBtu: 100000, oldSeer: 8.49, newBtu: 100000, newSeer: 10 },
  { note: 'savings 16.7% — the raw figure the OLD server gate really demanded', oldBtu: 100000, oldSeer: 8.33, newBtu: 100000, newSeer: 10 },

  // ── savings boundary, seasonal ON (the option, not the default) ───────────
  { note: 'seasonal ON, raw 15.0% → 13.5% derated, fails', engine: { applySeasonalFactor: true }, oldBtu: 100000, oldSeer: 8.5, newBtu: 100000, newSeer: 10 },
  { note: 'seasonal ON, raw 16.7% → 15.0% derated, passes', engine: { applySeasonalFactor: true }, oldBtu: 100000, oldSeer: 8.33, newBtu: 100000, newSeer: 10 },
  { note: 'seasonal ON but the constant is 0 — the term must degrade to 1, not to zero savings', engine: { applySeasonalFactor: true }, consts: { ...C, seasonal_factor: 0 }, oldBtu: 100000, oldSeer: 8.5, newBtu: 100000, newSeer: 10 },
  { note: 'seasonal ON with a missing constant — degrades to 1', engine: { applySeasonalFactor: true }, consts: { ...C, seasonal_factor: undefined }, oldBtu: 100000, oldSeer: 8.5, newBtu: 100000, newSeer: 10 },

  // ── capacity boundary, BTU_new ≠ BTU_old ──────────────────────────────────
  { note: 'capacity exactly +10.0% — inside the inclusive tolerance', oldBtu: 100000, oldSeer: 8, newBtu: 110000, newSeer: 16 },
  { note: 'capacity exactly −10.0% — inside', oldBtu: 100000, oldSeer: 8, newBtu: 90000, newSeer: 16 },
  { note: 'capacity +10.1% — outside', oldBtu: 100000, oldSeer: 8, newBtu: 110100, newSeer: 16 },
  { note: 'capacity −10.1% — outside', oldBtu: 100000, oldSeer: 8, newBtu: 89900, newSeer: 16 },
  { note: 'capacity out AND savings out — capacity is reported first, on both sides', oldBtu: 100000, oldSeer: 8.51, newBtu: 150000, newSeer: 10 },

  // ── BTU_new ≠ BTU_old, compliant: the percentage must not move with capacity
  { note: 'BTU_new ≠ BTU_old, both inside tolerance, savings unaffected', oldBtu: 60000, oldSeer: 8, newBtu: 66000, newSeer: 16 },
  { note: 'BTU_new ≠ BTU_old the other way', oldBtu: 60000, oldSeer: 8, newBtu: 54000, newSeer: 16 },

  // ── equipment type ────────────────────────────────────────────────────────
  { note: 'identical types', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: 'Split AC', newType: 'Split AC' },
  { note: 'types differing only in case and spacing — still equal', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: ' split   ac ', newType: 'Split AC' },
  { note: 'SUBSTRING, not equality. The old server called this a match.', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: 'Split AC', newType: 'Split' },
  { note: 'the reverse substring — also a mismatch', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: 'Split', newType: 'Split AC' },
  { note: 'genuinely different types', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: 'Window AC', newType: 'Split AC' },
  { note: 'an absent old type contradicts nothing', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: '', newType: 'Split AC' },
  { note: 'an absent new type contradicts nothing', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, oldType: 'Split AC', newType: null },

  // ── missing data ──────────────────────────────────────────────────────────
  { note: 'no old capacity', oldBtu: null, oldSeer: 8, newBtu: 100000, newSeer: 16 },
  { note: 'no old efficiency', oldBtu: 100000, oldSeer: null, newBtu: 100000, newSeer: 16 },
  { note: 'no new capacity', oldBtu: 100000, oldSeer: 8, newBtu: null, newSeer: 16 },
  { note: 'no new efficiency at all (seer and ieer both absent)', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: null },
  { note: 'zero capacity is missing data, not a division by zero', oldBtu: 0, oldSeer: 8, newBtu: 100000, newSeer: 16 },

  // ── the IEER fallback ─────────────────────────────────────────────────────
  { note: 'seer absent, ieer supplies the efficiency', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: null, ieer: 16 },
  { note: 'seer present wins over ieer', oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16, ieer: 4 },

  // ── a non-default tolerance, to prove neither side hardcodes 10 / 15 ──────
  { note: 'tolerance widened to 20% — a +15% candidate becomes compliant', consts: { ...C, capacity_tolerance_pct: 20 }, oldBtu: 100000, oldSeer: 8, newBtu: 115000, newSeer: 16 },
  { note: 'floor raised to 60% — a 50% candidate stops being compliant', consts: { ...C, min_savings_pct: 60 }, oldBtu: 100000, oldSeer: 8, newBtu: 100000, newSeer: 16 },
]

// The client's shape: a computed row from computeRow(), and an ac_catalog item.
const asClient = (k) => [
  { old_btu: k.oldBtu, old_seer: k.oldSeer, equipment_type: k.oldType ?? 'Split AC' },
  { id: 'c1', capacity_btu: k.newBtu, seer: k.newSeer, ieer: k.ieer ?? null, equipment_type: k.newType === undefined ? 'Split AC' : k.newType },
]
// The server's shape: a `select`-job group, and the same catalog item.
const asServer = (k) => [
  { key: 'g1', btu: k.oldBtu, seer: k.oldSeer, equipment_type: k.oldType ?? 'Split AC' },
  { id: 'c1', capacity_btu: k.newBtu, seer: k.newSeer, ieer: k.ieer ?? null, equipment_type: k.newType === undefined ? 'Split AC' : k.newType },
]

// ═══ PART A — THE TWO IMPLEMENTATIONS AGREE, CASE BY CASE ══════════════════
test('T-PAR1 — client isCompliant() and the Edge Function gate return identical verdicts', () => {
  const table = []
  for (const k of CASES) {
    const consts = k.consts || C
    const engine = k.engine || {}
    const a = isCompliant(...asClient(k), consts, engine)
    const b = serverCompliant(...asServer(k), consts, engine)
    assert.deepEqual(b, a, `DIVERGED — ${k.note}\n  client: ${JSON.stringify(a)}\n  server: ${JSON.stringify(b)}`)
    table.push(`  ${a.ok ? 'PASS' : 'fail'}  ${k.note}${a.ok ? '' : ` — ${a.why}`}`)
  }
  console.log(`\nagreement table (${CASES.length} cases, client verdict === server verdict on every one):\n${table.join('\n')}\n`)
})

// ═══ PART B — AN INDEPENDENT ORACLE, so "both wrong the same way" fails ════
// Written out longhand here rather than imported: if the shared module and the
// test both derived the expectation from the same code, agreement would prove
// only that the code equals itself.
test('T-PAR2 — both agree with an independently written statement of the rule', () => {
  for (const k of CASES) {
    const consts = k.consts || C
    const engine = k.engine || {}
    const ob = Number(k.oldBtu), os = Number(k.oldSeer)
    const nb = Number(k.newBtu)
    const ns = Number(k.newSeer == null ? k.ieer : k.newSeer)
    const sf = engine.applySeasonalFactor
      ? (Number.isFinite(Number(consts.seasonal_factor)) && Number(consts.seasonal_factor) !== 0 ? Number(consts.seasonal_factor) : 1)
      : 1
    const ot = String(k.oldType ?? 'Split AC').replace(/\s+/g, ' ').trim().toLowerCase()
    const nt = String((k.newType === undefined ? 'Split AC' : k.newType) ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

    let want
    if (!ob || !os || !nb || !ns) want = 'missing capacity or efficiency'
    else if (Math.abs(((nb - ob) / ob) * 100) > consts.capacity_tolerance_pct) want = 'capacity'
    else if (((ns - os) / ns) * sf * 100 < consts.min_savings_pct) want = 'savings'
    else if (ot && nt && ot !== nt) want = 'different equipment type'
    else want = 'ok'

    const got = isCompliant(...asClient(k), consts, engine)
    const label = got.ok ? 'ok' : (got.why.startsWith('capacity') ? 'capacity' : got.why.startsWith('savings') ? 'savings' : got.why)
    assert.equal(label, want, `oracle disagrees — ${k.note} (got ${JSON.stringify(got)})`)
  }
})

// ═══ PART C — THE BUG ITSELF, KEPT VISIBLE ═════════════════════════════════
test('T-PAR3 — the PRE-COMMIT server gate really did reject units the client accepts', () => {
  // The old body, verbatim from index.ts:500 before this commit.
  const oldServerGate = (g, c, tol, minSav, seasonal) => {
    const newBtu = c.capacity_btu == null ? null : Number(c.capacity_btu)
    const newSeer = c.seer == null ? (c.ieer == null ? null : Number(c.ieer)) : Number(c.seer)
    if (!newBtu || !newSeer) return false
    if (Math.abs(((newBtu - g.btu) / g.btu) * 100) > tol) return false
    if (((newSeer - g.seer) / newSeer) * seasonal * 100 < minSav) return false
    return true
  }
  // A candidate at 15.1% raw savings: compliant by the engine's own rule.
  const k = { oldBtu: 100000, oldSeer: 8.49, newBtu: 100000, newSeer: 10 }
  const now = isCompliant(...asClient(k), C, {})
  assert.equal(now.ok, true, 'the client accepts 15.1% raw savings')
  assert.equal(serverCompliant(...asServer(k), C, {}).ok, true, 'and so must the server, now')
  // …and the old server did not, because of the unconditional 0.9.
  assert.equal(oldServerGate({ btu: 100000, seer: 8.49 }, { capacity_btu: 100000, seer: 10 }, 10, 15, 0.9), false,
    'the divergence this commit closes has vanished from the fixture — check the fixture, not the code')

  // The whole band the two disagreed over: raw savings in [15%, 16.67%).
  let disagreements = 0
  for (let raw = 15.0; raw < 16.66; raw += 0.05) {
    const ns = 10, os = ns * (1 - raw / 100)
    const mine = isCompliant(...asClient({ oldBtu: 100000, oldSeer: os, newBtu: 100000, newSeer: ns }), C, {}).ok
    const theirs = oldServerGate({ btu: 100000, seer: os }, { capacity_btu: 100000, seer: ns }, 10, 15, 0.9)
    if (mine !== theirs) disagreements++
  }
  assert.ok(disagreements > 30, `expected a wide band of disagreement, found ${disagreements}`)
  console.log(`  pre-commit divergence: ${disagreements} of 34 sampled savings levels between 15.0% and 16.65% were accepted by the client and rejected by the server`)
})

// ═══ PART D — THE SOURCE ITSELF, so a future copy-paste is caught ══════════
test('T-PAR4 — the Edge Function imports the shared predicate and re-implements nothing', () => {
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/saving-sheet-agent/index.ts'), 'utf8')
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

  assert.match(code, /from\s+"\.\.\/_shared\/compliance\.js"/, 'the Edge Function must import the shared predicate')
  assert.match(code, /serverCompliant\(/, 'and must call it')
  // the three defects, as source-level assertions
  assert.doesNotMatch(code, /\*\s*seasonal\s*\*/, 'a seasonal factor applied inline is the C2 defect returning')
  assert.doesNotMatch(code, /\b12000\b/, 'the BTU/ton conversion belongs to tarshid_constants.btu_per_ton')
  // `C.capacity_tolerance_pct ?? 10` and friends: a per-site default that
  // bypasses the CONST_DEFAULTS allow-list, which is how the two runtimes came
  // to degrade differently when a key was renamed.
  assert.doesNotMatch(code, /(capacity_tolerance_pct|min_savings_pct|seasonal_factor|btu_per_ton)\s*\?\?/,
    'a bare per-site fallback bypasses the CONST_DEFAULTS allow-list — read constants through constsFromRows()')
  assert.match(code, /constsFromRows\(/, 'constants must be read through the shared allow-list')
})

// ═══ PART E — the constants allow-list is one list, shared ═════════════════
test('T-PAR5 — constsFromRows() applies the allow-list identically for both runtimes', () => {
  const got = constsFromRows([
    { key: 'min_savings_pct', value: '18' },
    { key: 'btu_per_ton', value: '12500' },
    { key: 'min_savings_pct_RENAMED', value: '1' },   // the silent-degradation case
  ])
  assert.equal(got.min_savings_pct, 18)
  assert.equal(got.btu_per_ton, 12500)
  assert.equal('min_savings_pct_RENAMED' in got, false)
  assert.deepEqual(Object.keys(got).sort(), Object.keys(CONST_DEFAULTS).sort())
  // a missing, zero or unusable btu_per_ton falls back rather than zeroing every
  // capacity in the system
  assert.equal(btuPerTon(got), 12500)
  assert.equal(btuPerTon({}), 12000)
  assert.equal(btuPerTon({ btu_per_ton: 0 }), 12000)
  assert.equal(btuPerTon({ btu_per_ton: 'x' }), 12000)
})
