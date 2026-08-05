// U3 — the AC engine's pins. Design §6.1.
//
// Every test here exists because the shipped engine could have been wrong in
// that exact way and nothing would have said so. The three corrections of
// design §1.2 (C1 capacity term, C2 seasonal factor, C3 truncation) are each
// pinned by a test that FAILS against the pre-U3 code, so a revert is loud.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONST_DEFAULTS, loadConstants,
  trunc2, typeMatches, modelKey, registryKey, registryKeyLoose,
  buildRegistryIndex, registryHit, oldBtu, oldEfficiency, m2PerTon,
  seasonalTerm, computeRow, computeProject, isCompliant,
  GATE_FLAGS, violatesGate, readiness,
} from '../src/lib/savingSheet.js'
import { __setResult, __reset, calls } from './harness/supabase-stub.mjs'

const C = { ...CONST_DEFAULTS }
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (±${eps})`)

// A surveyed row and a replacement, both deliberately mismatched in capacity so
// that C1's change of denominator is VISIBLE: 5 TR surveyed (60,000 BTU),
// 48,000 BTU replacement.
const entry = () => ({ id: 'e1', building_id: 'b1', qty: 2, tr: 5, equipment_type: 'Split AC', model: 'X-1', room_type: 'Office' })
// SEER 8 -> 16 on 48,000 BTU is chosen so every product below is EXACT in
// binary floating point: (16-8)/(16*8) = 0.0625. C1 is about which capacity
// enters the formula, and a fixture that also loses digits to C3's truncation
// would test both at once and pin neither.
const cat = (o = {}) => ({ id: 'c1', equipment_type: 'Split AC', capacity_btu: 48000, seer: 16, unit_cost: 1000, labor_cost: 200, ...o })
const oh = { eflh: 2000, hours_per_year: 3000, ref_string: 'r' }
const row = (o = {}) => computeRow({ entry: entry(), cat: cat(), building: { id: 'b1' }, oh, consts: C, index: buildRegistryIndex([]), assumedOldEff: 8, ...o })

// ═══ T-C1 — THE CAPACITY TERM IS THE NEW UNIT'S ════════════════════════════
test('T-C1 — baseline kWh uses BTU_new, not BTU_old', () => {
  const r = row()
  // [EXT]: BTU_new / SEER_baseline / 1000 x qty x EFLH
  assert.equal(r.baseline_kwh, (48000 / 8 / 1000) * 2 * 2000)   // 24,000
  assert.equal(r.baseline_kwh, 24000)
  // the pre-U3 value, which this must NOT be
  assert.notEqual(r.baseline_kwh, (60000 / 8 / 1000) * 2 * 2000)  // 30,000
})

test('T-C1 — savings kWh carries BTU_new/1000 as well', () => {
  const r = row()
  const expected = ((16 - 8) / (16 * 8)) * (48000 / 1000) * 2 * 2000   // 12,000
  assert.equal(r.savings_kwh, expected)
  assert.equal(r.savings_kwh, 12000)
  assert.notEqual(r.savings_kwh, ((16 - 8) / (16 * 8)) * (60000 / 1000) * 2 * 2000)   // 15,000
})

test('T-C1 — the percentage is unchanged by C1 (capacity cancels): this is why the bug hid', () => {
  const r = row()
  assert.equal(r.savings_pct, ((16 - 8) / 16) * 100)     // 50%
  // absolute kWh scale with the REPLACEMENT capacity …
  const bigger = row({ cat: cat({ capacity_btu: 96000 }) })
  assert.equal(bigger.baseline_kwh, r.baseline_kwh * 2)
  assert.equal(bigger.savings_kwh, r.savings_kwh * 2)
  // … while the percentage does not move at all
  assert.equal(bigger.savings_pct, r.savings_pct)
})

test('T-C1 — the CAPACITY CHECK keeps the old unit’s BTU as denominator', () => {
  const r = row()
  assert.equal(r.old_btu, 60000)                                  // 5 TR x 12000
  assert.equal(r.capacity_check_pct, ((48000 - 60000) / 60000) * 100)   // -20%
  assert.ok(r.flags.includes('capacity-out'))
})

test('T-C1 — stated consequence: no replacement means no BTU_new, so no baseline', () => {
  const r = row({ cat: null })
  assert.equal(r.baseline_kwh, null)
  assert.equal(r.savings_kwh, null)
  assert.ok(r.flags.includes('no-replacement'))
  // and the row contributes nothing rather than contributing a wrong number
  const p = computeProject({
    entries: [{ ...entry(), category: 'ac' }], buildings: [{ id: 'b1' }],
    ohRows: [{ building_id: 'b1', space_type: 'Office', ...oh }],
    acCatalog: [], registry: [], consts: C, assumedOldEff: 8,
  })
  assert.equal(p.totals.baseline_kwh, 0)
  assert.equal(p.totals.savings_kwh, 0)
})

// ═══ T-C2 — THE SEASONAL FACTOR IS A SWITCHABLE TERM ═══════════════════════
test('T-C2 — default is workbook-faithful: no seasonal factor anywhere', () => {
  assert.equal(seasonalTerm(C), 1)
  assert.equal(seasonalTerm(C, {}), 1)
  const r = row()
  assert.equal(r.savings_kwh, 12000)          // with the 0.9 factor it would be 10,800
  assert.equal(isCompliant({ old_btu: 60000, old_seer: 8, equipment_type: 'Split AC' }, cat({ capacity_btu: 60000 }), C).savPct, 50)
})

test('T-C2 — the factor is reachable, and only through the explicit option', () => {
  assert.equal(seasonalTerm(C, { applySeasonalFactor: true }), 0.9)
  const r = row({ engine: { applySeasonalFactor: true } })
  assert.equal(r.savings_kwh, 12000 * 0.9)    // 10,800
  // a zero or absent constant degrades to 1 rather than to zero savings
  assert.equal(seasonalTerm({ seasonal_factor: 0 }, { applySeasonalFactor: true }), 1)
  assert.equal(seasonalTerm({}, { applySeasonalFactor: true }), 1)
})

test('T-C2 — the GATE and the SHEET use the same term (the divergence that shipped)', () => {
  const r0 = { old_btu: 60000, old_seer: 8, equipment_type: 'Split AC' }
  const c0 = cat({ capacity_btu: 60000 })
  for (const engine of [{}, { applySeasonalFactor: true }]) {
    const gate = isCompliant(r0, c0, C, engine)
    const sheet = computeRow({ entry: { ...entry(), tr: 5 }, cat: c0, building: {}, oh, consts: C, index: buildRegistryIndex([]), assumedOldEff: 8, engine })
    // savings_kwh is TRUNCated (C3), so the percentages agree to within one
    // truncation step expressed as a percentage of the baseline
    near(gate.savPct, sheet.savings_pct, (0.01 / sheet.baseline_kwh) * 100)
  }
  // the shipped code's gate demanded 15/0.9 = 16.7% raw; it no longer can
  const marginal = { seer: 9.412, capacity_btu: 60000, equipment_type: 'Split AC', id: 'm' }
  const v = isCompliant(r0, marginal, C)
  near(v.savPct, ((9.412 - 8) / 9.412) * 100, 1e-9)
  assert.equal(v.ok, true, 'a 15.00% row must pass; with the old 0.9 gate it did not')
})

test('T-C2 — the final pin waits for the approved TARSHID AC workbook', { todo: 'The approved TARSHID AC workbook (design §8.1) is not in the repo, and per Constraints #7 a client-supplied one never will be — what is needed is an anonymised or synthetic derivative carrying real published values. Until one lands, whether [EXT] applies the 0.9 seasonal factor is UNDECIDED; the engine ships workbook-faithful (factor OFF) and THIS test becomes the pin the day the fixture arrives. Do not delete it — deleting it closes the question silently, which is the one outcome the design refuses.' }, () => {
  // The assertion that will be replaced: read the workbook's own cached savings
  // for a known row and require the engine to reproduce it, which decides the
  // factor rather than assuming it. Until then this records the shipped default
  // so the TODO marker carries state instead of nothing.
  assert.equal(seasonalTerm(CONST_DEFAULTS, {}), 1)
})

// ═══ T-C3 — TRUNC(x,2) AT THE ROW LEVEL ════════════════════════════════════
test('T-C3 — trunc2 is Excel TRUNC, toward zero, and immune to scaling error', () => {
  assert.equal(trunc2(1.999), 1.99)
  assert.equal(trunc2(-1.999), -1.99)          // toward zero, not floor
  assert.equal(trunc2(2.675), 2.67)
  assert.equal(trunc2(0.1 + 0.2), 0.3)
  assert.equal(trunc2(1234.5678), 1234.56)
  assert.equal(trunc2(5), 5)
  // THE reason it is not Math.trunc(x * 100) / 100: the scaling invents error
  assert.equal(4.35 * 100, 434.99999999999994)
  assert.equal(Math.trunc(4.35 * 100) / 100, 4.34)   // the naive form, wrong
  assert.equal(trunc2(4.35), 4.35)                   // TRUNC(4.35,2) in Excel
  // pass-throughs
  assert.equal(trunc2(null), null)
  assert.equal(trunc2(NaN) !== trunc2(NaN), true)    // NaN returned as-is
  assert.equal(trunc2(1e21), 1e21)                   // toFixed goes exponential
})

test('T-C3 — the truncation is on the ROW savings and nowhere else', () => {
  // deliberately awkward numbers: an old SEER of 8.2 keeps BOTH the baseline and
  // the savings off a 2-decimal boundary, so "is it truncated" has an answer
  const r = row({ oh: { eflh: 2137 }, cat: cat({ seer: 13.4 }), entry: { ...entry(), qty: 3 }, assumedOldEff: 8.2 })
  const raw = ((13.4 - 8.2) / (13.4 * 8.2)) * (48000 / 1000) * 3 * 2137
  assert.notEqual(raw, trunc2(raw), 'fixture must actually have digits to lose')
  assert.equal(r.savings_kwh, trunc2(raw))
  // baseline is NOT truncated — the workbook does not truncate it
  const base = (48000 / 8.2 / 1000) * 3 * 2137
  assert.equal(r.baseline_kwh, base)
  assert.notEqual(r.baseline_kwh, trunc2(base))
  // nor is the percentage
  assert.equal(r.savings_pct, (r.savings_kwh / r.baseline_kwh) * 100)
})

test('T-C3 — truncate-then-sum, not sum-then-truncate (placement is the point)', () => {
  const entries = Array.from({ length: 40 }, (_, i) => ({
    id: `e${i}`, building_id: 'b1', category: 'ac', qty: 1, tr: 3, room_type: 'Office',
    equipment_type: 'Split AC', model: `M${i}`, catalog_item_id: 'c1',
  }))
  const p = computeProject({
    entries, buildings: [{ id: 'b1' }],
    ohRows: [{ building_id: 'b1', space_type: 'Office', eflh: 2137 }],
    acCatalog: [cat({ seer: 13.4 })], registry: [], consts: C, assumedOldEff: 8,
  })
  const rawEach = ((13.4 - 8) / (13.4 * 8)) * (48000 / 1000) * 1 * 2137
  assert.equal(p.totals.savings_kwh, p.rows.reduce((a, r) => a + r.savings_kwh, 0))
  near(p.totals.savings_kwh, trunc2(rawEach) * 40, 1e-6)
  assert.notEqual(p.totals.savings_kwh, trunc2(rawEach * 40))
})

// ═══ T-G — THE GATES MATRIX ════════════════════════════════════════════════
const base = { old_btu: 100000, old_seer: 10, equipment_type: 'Split AC' }
const rep = (o) => ({ id: 'r', equipment_type: 'Split AC', capacity_btu: 100000, seer: 14, ...o })

test('T-G1 — capacity inside the tolerance passes', () => {
  const v = isCompliant(base, rep({ capacity_btu: 109900 }), C)
  assert.equal(v.ok, true)
  near(v.capPct, 9.9, 1e-9)
})

test('T-G2 — the ±10.0 boundary is INCLUSIVE (the check is > tolerance)', () => {
  assert.equal(isCompliant(base, rep({ capacity_btu: 110000 }), C).ok, true)
  assert.equal(isCompliant(base, rep({ capacity_btu: 90000 }), C).ok, true)
})

test('T-G3 — 10.1% either side blocks, and says why', () => {
  const hi = isCompliant(base, rep({ capacity_btu: 110100 }), C)
  const lo = isCompliant(base, rep({ capacity_btu: 89900 }), C)
  assert.equal(hi.ok, false)
  assert.equal(lo.ok, false)
  assert.match(hi.why, /capacity 10\.1% outside ±10/)
  assert.match(lo.why, /capacity -10\.1% outside ±10/)
})

test('T-G4 — savings: 15.0 passes, 14.9 blocks', () => {
  // savPct = (new - old) / new; solve for the SEER that lands exactly on each
  const seerFor = (pct) => 10 / (1 - pct / 100)
  assert.equal(isCompliant(base, rep({ seer: seerFor(15) }), C).ok, true)
  const under = isCompliant(base, rep({ seer: seerFor(14.9) }), C)
  assert.equal(under.ok, false)
  assert.match(under.why, /savings 14\.9% below 15/)
  // and the row-level flag agrees with the gate
  const r = computeRow({ entry: { ...entry(), tr: 5 }, cat: rep({ seer: seerFor(14.9), capacity_btu: 60000 }), building: {}, oh, consts: C, index: buildRegistryIndex([]), assumedOldEff: 10 })
  assert.ok(r.flags.includes('low-savings'))
})

test('T-G5 — ONE type predicate: computeRow and isCompliant can no longer disagree', () => {
  const pairs = [
    ['Split AC', 'Split AC', true],
    ['Split AC', 'split ac', true],       // normalised
    ['Split  AC', 'Split AC', true],      // whitespace collapsed
    ['Split AC', 'Split', false],         // old isCompliant said MATCH (substring)
    ['Split', 'Split AC', false],
    ['Split AC', 'Package Unit', false],
    ['', 'Split AC', true],               // nothing to contradict
    ['Split AC', '', true],
    [null, undefined, true],
  ]
  for (const [a, b, want] of pairs) {
    assert.equal(typeMatches(a, b), want, `typeMatches(${JSON.stringify(a)}, ${JSON.stringify(b)})`)
    const gate = isCompliant({ ...base, equipment_type: a }, rep({ equipment_type: b }), C)
    const sheet = computeRow({ entry: { ...entry(), tr: 5, equipment_type: a }, cat: rep({ equipment_type: b, capacity_btu: 60000 }), building: {}, oh, consts: C, index: buildRegistryIndex([]), assumedOldEff: 10 })
    const gateSaysMismatch = gate.ok === false && gate.why === 'different equipment type'
    assert.equal(gateSaysMismatch, !want)
    assert.equal(sheet.flags.includes('type-mismatch'), !want)
  }
})

test('T-G6 — a missing capacity or efficiency is refused, not defaulted', () => {
  for (const [r, c] of [
    [{ ...base, old_btu: null }, rep({})],
    [{ ...base, old_seer: null }, rep({})],
    [base, rep({ capacity_btu: null })],
    [base, rep({ seer: null, ieer: null })],
  ]) assert.deepEqual(isCompliant(r, c, C), { ok: false, why: 'missing capacity or efficiency' })
  // ieer stands in for a missing seer — that is a documented fallback, not a gap
  assert.equal(isCompliant(base, rep({ seer: null, ieer: 14 }), C).ok, true)
})

test('T-G7 — savings % is independent of qty, EFLH and capacity (design §1.1)', () => {
  let s = 20250805
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = 0; i < 200; i++) {
    const oldSeer = 6 + rnd() * 6
    const newSeer = oldSeer * (1.2 + rnd() * 1.5)
    const expected = ((newSeer - oldSeer) / newSeer) * 100
    // the GATE is exactly independent
    for (const btu of [24000, 60000, 120000]) {
      const v = isCompliant({ old_btu: btu, old_seer: oldSeer, equipment_type: 'Split AC' }, rep({ capacity_btu: btu, seer: newSeer }), C)
      near(v.savPct, expected, 1e-9)
    }
    // the SHEET is independent to within one truncation step
    for (const qty of [1, 7, 133]) {
      for (const eflh of [800, 2137, 6000]) {
        for (const btu of [24000, 60000]) {
          const r = computeRow({
            entry: { ...entry(), qty, tr: btu / 12000 }, cat: cat({ capacity_btu: btu, seer: newSeer }),
            building: {}, oh: { eflh }, consts: C, index: buildRegistryIndex([]), assumedOldEff: oldSeer,
          })
          near(r.savings_pct, expected, (0.01 / r.baseline_kwh) * 100)
        }
      }
    }
  }
})

// ═══ T-K1 — THE CONST_DEFAULTS ALLOW-LIST ROUND-TRIP ═══════════════════════
// Migration 0135's own header calls this the trap: loadConstants() does
// `if (r.key in out)`, so a seeded row whose key is absent from CONST_DEFAULTS
// is read from the database and silently thrown away.
const DB_KEYS = [
  'tariff_sar_kwh', 'seasonal_factor', 'capacity_tolerance_pct', 'min_savings_pct',  // 0093
  'lighting_derating', 'control_derating', 'control_savings_fraction', 'btu_per_ton', // 0135
]

test('T-K1 — every key seeded in tarshid_constants survives loadConstants()', async () => {
  __reset()
  const sentinel = Object.fromEntries(DB_KEYS.map((k, i) => [k, 1000 + i]))
  __setResult({
    data: [
      ...DB_KEYS.map((k) => ({ key: k, value: String(sentinel[k]) })),
      { key: 'a_key_nobody_added_to_CONST_DEFAULTS', value: '99' },
    ],
    error: null,
  })
  const got = await loadConstants()
  assert.deepEqual(calls, [{ table: 'tarshid_constants', cols: 'key,value' }])
  for (const k of DB_KEYS) assert.equal(got[k], sentinel[k], `${k} was discarded by the allow-list`)
  assert.equal('a_key_nobody_added_to_CONST_DEFAULTS' in got, false)
  assert.deepEqual(Object.keys(got).sort(), Object.keys(CONST_DEFAULTS).sort())
  __reset()
})

test('T-K1 — CONST_DEFAULTS lists every DB key, and the four new ones carry the seeded values', () => {
  for (const k of DB_KEYS) assert.ok(k in CONST_DEFAULTS, `CONST_DEFAULTS is missing ${k}`)
  assert.equal(CONST_DEFAULTS.lighting_derating, 0.9)
  assert.equal(CONST_DEFAULTS.control_derating, 0.9)
  assert.equal(CONST_DEFAULTS.control_savings_fraction, 0.3)
  assert.equal(CONST_DEFAULTS.btu_per_ton, 12000)
})

test('T-K1 — a database error falls back to the defaults rather than to nothing', async () => {
  __reset()
  __setResult({ data: null, error: { message: 'boom' } })
  assert.deepEqual(await loadConstants(), CONST_DEFAULTS)
  __reset()
})

test('T-K1 — btu_per_ton actually replaces BOTH literal 12000s', () => {
  const idx = buildRegistryIndex([])
  assert.equal(oldBtu({ tr: 5 }, idx), 60000)
  assert.equal(oldBtu({ tr: 5 }, idx, 12345), 61725)
  assert.equal(m2PerTon({ room_area: 100, btu: 24000, qty: 1 }), 50)
  assert.equal(m2PerTon({ room_area: 100, btu: 24000, qty: 1 }, 24000), 100)
  // and the constant reaches computeRow from the loaded constants, not a literal
  const r = row({ consts: { ...C, btu_per_ton: 13000 } })
  assert.equal(r.old_btu, 65000)
})

// ═══ T-REG — THE REGISTRY KEY ══════════════════════════════════════════════
// 0134 imports model_no VERBATIM. Four rows carry stray spaces and collapsing
// them merges three real rows into others (1,516 -> 1,513), so the exact string
// is the key and the collapsed form is a fallback that refuses to guess.
const REG = [
  { id: 'A', equipment_type: 'Split AC', model_no: 'B2424C', equivalent_seer: 9, t1_btu: 24000 },
  { id: 'B', equipment_type: 'Split AC', model_no: 'B2424C ', equivalent_seer: 11, t1_btu: 24500 },
  { id: 'C', equipment_type: 'Package Unit', model_no: 'B2424C', equivalent_seer: 7, t1_btu: 60000 },
  { id: 'D', equipment_type: 'Window AC', model_no: 'S242NH', equivalent_seer: 6, t1_btu: 18000 },
]

test('T-REG — the explicit link beats the model string', () => {
  const idx = buildRegistryIndex(REG)
  const hit = registryHit({ registry_id: 'C', equipment_type: 'Split AC', model: 'B2424C' }, idx)
  assert.equal(hit.id, 'C', 'registry_id is a human/accepted-AI decision and always wins')
  // and it wins even when the string would have missed entirely
  assert.equal(registryHit({ registry_id: 'D', model: 'nonsense' }, idx).id, 'D')
})

test('T-REG — the key is the PAIR (equipment_type, model_no): cross-type collision', () => {
  const idx = buildRegistryIndex(REG)
  assert.equal(registryHit({ equipment_type: 'Split AC', model: 'B2424C' }, idx).id, 'A')
  assert.equal(registryHit({ equipment_type: 'Package Unit', model: 'B2424C' }, idx).id, 'C')
  // the pre-U3 model-only lookup returned whichever was indexed first for both
  assert.notEqual(
    registryHit({ equipment_type: 'Split AC', model: 'B2424C' }, idx).id,
    registryHit({ equipment_type: 'Package Unit', model: 'B2424C' }, idx).id,
  )
  // and it changes the ANSWER, not just the lookup: SEER and BTU follow
  assert.equal(oldEfficiency({ equipment_type: 'Package Unit', model: 'B2424C' }, idx, 8).seer, 7)
  assert.equal(oldBtu({ equipment_type: 'Package Unit', model: 'B2424C' }, idx), 60000)
})

test('T-REG — whitespace in model_no is DATA: the exact string resolves exactly', () => {
  const idx = buildRegistryIndex(REG)
  assert.equal(registryHit({ equipment_type: 'Split AC', model: 'B2424C' }, idx).id, 'A')
  assert.equal(registryHit({ equipment_type: 'Split AC', model: 'B2424C ' }, idx).id, 'B')
  assert.notEqual(registryKey('Split AC', 'B2424C'), registryKey('Split AC', 'B2424C '))
  // equipment_type IS normalised — it is a controlled vocabulary, not data
  assert.equal(registryKey(' split   ac ', 'B2424C'), registryKey('Split AC', 'B2424C'))
})

test('T-REG — the loose fallback refuses to choose when the collapsed key is ambiguous', () => {
  const idx = buildRegistryIndex(REG)
  // 'b2424c' collapses onto both A and B, so a typed near-miss gets nothing …
  assert.equal(registryHit({ equipment_type: 'Split AC', model: '  b2424c  ' }, idx), null)
  // … while an unambiguous collapse still resolves (a human typed the model)
  assert.equal(registryHit({ equipment_type: 'Window AC', model: ' s242nh ' }, idx).id, 'D')
  assert.equal(registryKeyLoose('Window AC', ' S242NH '), registryKeyLoose('window ac', 's242nh'))
})

test('T-REG — a miss is a miss: no index, no model, no row', () => {
  const idx = buildRegistryIndex(REG)
  assert.equal(registryHit({ model: 'B2424C' }, null), null)
  assert.equal(registryHit({ equipment_type: 'Split AC', model: '' }, idx), null)
  assert.equal(registryHit({ equipment_type: 'Split AC' }, idx), null)
  assert.equal(registryHit({ equipment_type: 'Chiller', model: 'B2424C' }, idx), null)
  // a missed registry falls back to the assumed factor AND says so
  const { seer, source } = oldEfficiency({ equipment_type: 'Chiller', model: 'B2424C' }, idx, 8.5)
  assert.equal(seer, 8.5)
  assert.equal(source, 'assumed')
  assert.ok(row({ index: idx }).flags.includes('assumed-eff'))
  // modelKey survives for callers that only ever had a string
  assert.equal(modelKey('  B2424C  '), 'b2424c')
})

// ═══ T-U4 — THE GATES BECOME LAW ═══════════════════════════════════════════
// Before U4 these three flags were decoration: readiness() never looked at
// them and `check.ready` went green with any number of violating rows.
const u4Args = (over = {}) => ({
  project: Object.fromEntries(['entity_poc_name', 'entity_poc_mobile', 'entity_poc_email', 'tarshid_poc_name',
    'tarshid_poc_position', 'tarshid_poc_mobile', 'tarshid_poc_email', 'entity_name_ar', 'location_lat', 'location_lng']
    .map((k) => [k, 'x'])),
  rows: [], ohRows: [], entries: [], template: { version: 3 },
  selection: [{ catalog_item_id: 'c1', description: 'D', unit_cost: 1, labor_cost: 1 }],
  selectionIssues: {}, ...over,
})
const cleanRow = (o = {}) => ({
  entry_id: 'e1', in_scope: true, catalog_item_id: 'c1', qty: 1, new_description: 'D',
  scope_excluded: false, scope_exclusion_reason: null, scope_excluded_by: null, flags: [], ...o,
})
const itemFor = (check, key) => check.items.find((i) => i.key === key)

test('T-U4 — a clean project is ready, and the two new items are blocking', () => {
  const check = readiness(u4Args({ rows: [cleanRow()] }))
  assert.equal(check.ready, true)
  for (const key of ['gates', 'exclusions']) {
    const it = itemFor(check, key)
    assert.ok(it, `readiness has no '${key}' item`)
    assert.equal(it.blocking, true)
    assert.equal(it.count, 0)
  }
})

test('T-U4 — a violating row BLOCKS generation (each gate, one at a time)', () => {
  for (const flag of GATE_FLAGS) {
    const check = readiness(u4Args({ rows: [cleanRow({ flags: [flag] })] }))
    assert.equal(check.ready, false, `${flag} did not block`)
    assert.equal(itemFor(check, 'gates').count, 1)
  }
  // and the hint NAMES the failure rather than saying "3 problems"
  const many = readiness(u4Args({
    rows: [cleanRow({ entry_id: 'a', flags: ['capacity-out'] }),
           cleanRow({ entry_id: 'b', flags: ['capacity-out'] }),
           cleanRow({ entry_id: 'c', flags: ['low-savings'] })],
  }))
  assert.equal(itemFor(many, 'gates').count, 3)
  assert.match(itemFor(many, 'gates').hint, /2 outside the ±capacity tolerance/)
  assert.match(itemFor(many, 'gates').hint, /1 below the minimum savings/)
})

test('T-U4 — an EXCLUDED row does not block, and is not a violation', () => {
  const entry = { id: 'e1', building_id: 'b1', category: 'ac', qty: 2, tr: 5, room_type: 'Office',
    equipment_type: 'Split AC', model: 'X-1', scope_excluded: true,
    scope_exclusion_reason: 'Plant room scheduled for demolition', scope_excluded_by: 'u-1',
    scope_excluded_at: '2026-08-05T00:00:00Z' }
  const r = computeRow({ entry, cat: cat({ capacity_btu: 24000 }), building: { id: 'b1' }, oh, consts: C, index: buildRegistryIndex([]), assumedOldEff: 8 })
  assert.equal(r.in_scope, false)
  assert.ok(r.flags.includes('scope-excluded'))
  assert.equal(violatesGate(r), false, 'an out-of-scope row has no replacement for a gate to judge')
  // the decision travels with the row
  assert.equal(r.scope_exclusion_reason, 'Plant room scheduled for demolition')
  assert.equal(r.scope_excluded_by, 'u-1')
  assert.equal(readiness(u4Args({ rows: [cleanRow(), { ...cleanRow({ entry_id: 'x' }), in_scope: false, scope_excluded: true, scope_exclusion_reason: 'why', scope_excluded_by: 'u-1', flags: ['scope-excluded', 'capacity-out'] }] })).ready, true)
})

test('T-U4 — an excluded row leaves the totals but is counted as excluded', () => {
  const mk = (id, excluded) => ({ id, building_id: 'b1', category: 'ac', qty: 1, tr: 4, room_type: 'Office',
    equipment_type: 'Split AC', catalog_item_id: 'c1', scope_excluded: excluded,
    scope_exclusion_reason: excluded ? 'demolition' : null, scope_excluded_by: excluded ? 'u-1' : null })
  const args = {
    buildings: [{ id: 'b1' }], ohRows: [{ building_id: 'b1', space_type: 'Office', eflh: 2000 }],
    acCatalog: [cat({ capacity_btu: 48000, seer: 16 })], registry: [], consts: C, assumedOldEff: 8,
  }
  const both = computeProject({ entries: [mk('a', false), mk('b', true)], ...args })
  const only = computeProject({ entries: [mk('a', false)], ...args })
  assert.equal(both.totals.rows, 2)
  assert.equal(both.totals.in_scope, 1)
  assert.equal(both.totals.excluded_by_decision, 1)
  assert.equal(both.totals.baseline_kwh, only.totals.baseline_kwh)
  assert.equal(both.totals.savings_kwh, only.totals.savings_kwh)
  // …but the UNIT count still sees it: excluded is not deleted (design §5 U4)
  assert.equal(both.totals.units, 2)
})

test('T-U4 — an exclusion with no reason or no author is itself a blocker', () => {
  for (const bad of [{ scope_exclusion_reason: '   ', scope_excluded_by: 'u-1' },
                     { scope_exclusion_reason: 'why', scope_excluded_by: null },
                     { scope_exclusion_reason: null, scope_excluded_by: null }]) {
    const check = readiness(u4Args({ rows: [cleanRow({ in_scope: false, scope_excluded: true, flags: ['scope-excluded'], ...bad })] }))
    assert.equal(itemFor(check, 'exclusions').count, 1, JSON.stringify(bad))
    assert.equal(check.ready, false)
  }
})

test('T-U4 — the gate predicate is SHARED: no second definition can drift', () => {
  // isCompliant and computeRow already share typeMatches/seasonalTerm (U3).
  // U4's addition is that readiness, the totals and any caller ask the same
  // question through violatesGate — pinned here by construction.
  assert.deepEqual(GATE_FLAGS, ['low-savings', 'capacity-out', 'type-mismatch'])
  const rows = [cleanRow({ entry_id: 'a', flags: ['capacity-out'] }),
                cleanRow({ entry_id: 'b', flags: ['no-cost', 'assumed-eff'] }),
                cleanRow({ entry_id: 'c', in_scope: false, flags: ['residential', 'low-savings'] })]
  assert.equal(rows.filter(violatesGate).length, 1)
  assert.equal(itemFor(readiness(u4Args({ rows })), 'gates').count, 1)
  // non-gate flags never block
  assert.equal(readiness(u4Args({ rows: [cleanRow({ flags: ['no-cost', 'assumed-eff', 'no-eflh'] })] })).items
    .find((i) => i.key === 'gates').count, 0)
})
