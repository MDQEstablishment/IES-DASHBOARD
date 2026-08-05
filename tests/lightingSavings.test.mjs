// U3 — the LIGHTING engine's pins. Design §5 U3, §6.1.
//
// WHAT CHANGED HERE, AND WHY (confidentiality remediation, Constraints #7)
// -----------------------------------------------------------------------
// This suite was originally pinned against an approved TARSHID lighting
// workbook committed at templates/tarshid/. That workbook was a client-supplied
// document; it and every figure identifiable to the client have been removed
// from the repository. Two consequences, both stated rather than papered over:
//
//   1. THE AGGREGATION TESTS SURVIVE, SYNTHESISED (T-AGG, below). They test
//      RULES — BOQ excludes sensors; the headline denominator excludes the
//      control baseline; a No-Retrofit row contributes nothing — and a rule is
//      just as testable on declared synthetic aggregates as on real ones. Every
//      assertion the witness version made is still made, on numbers chosen to
//      preserve each one's meaning. The block is labelled DECLARED SYNTHETIC and
//      the tests are renamed from T-WIT-2 to T-AGG because they no longer
//      witness anything: they pin the algebra, not a client's results.
//
//   2. THE CONSTANT TESTS DO NOT SURVIVE, AND ARE SKIPPED, NOT FAKED (T-WIT-1).
//      Deriving lighting_derating = 0.9 from aggregates we chose ourselves would
//      be circular — it would confirm our own arithmetic and call it evidence.
//      They are skipped with the reason recorded on the test, and a NON-circular
//      drift guard (T-DRIFT) is added in their place: it pins the shipped
//      constants against change, and it is explicitly NOT a witness.
//
// The row chain is pinned by T-LGT-CHAIN below against DECLARED synthetic
// inputs, labelled as such — unchanged, it never used client data.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CONST_DEFAULTS } from '../src/lib/savingSheet.js'
import {
  buildLightingIndex, lightingRegistryHit, resolveBaselineFitting, esmOf,
  computeLightingRow, summariseLighting, computeLightingProject,
} from '../src/lib/lightingSavings.js'

// ── DECLARED SYNTHETIC ESM AGGREGATES ──────────────────────────────────────
// NOT the workbook's values, and not derived from them. Round numbers chosen so
// each rule the summary layer implements is visible in the arithmetic:
//
//   Conv     30,000 lamps · 4,000,000 kWh baseline · 2,560,000 kWh saved -> 64%
//   LED      50,000 lamps · 3,000,000 kWh baseline · 1,350,000 kWh saved -> 45%
//   Control     500 sensors ·  200,000 kWh baseline ·    54,000 kWh saved -> 27%
//
// and therefore, if the rules hold: BOQ 80,000 (the 500 sensors excluded),
// total baseline 7,000,000 (the control baseline excluded), total savings
// 3,964,000 (the control savings INCLUDED), headline 56.6285…% against a
// lamp-only 55.857…%, project consumption 3,036,000, and the ordering
// conv 64% > total 56.63% > led 45%.
const SYN = {
  convBoq: 30000, convBaseline: 4000000, convSavings: 2560000,
  ledBoq: 50000, ledBaseline: 3000000, ledSavings: 1350000,
  sensors: 500, controlBaseline: 200000, controlSavings: 54000,
  // derived — written out so a change to any input above fails loudly here
  totalBoq: 80000, totalBaseline: 7000000, totalSavings: 3964000,
  projectKwh: 3036000,
}
const CONV_PCT = SYN.convSavings / SYN.convBaseline              // 0.64
const LED_PCT = SYN.ledSavings / SYN.ledBaseline                 // 0.45
const CONTROL_PCT = SYN.controlSavings / SYN.controlBaseline     // 0.27
const TOTAL_PCT = SYN.totalSavings / SYN.totalBaseline           // 0.56628571…
const LAMP_ONLY_PCT = (SYN.convSavings + SYN.ledSavings) / SYN.totalBaseline

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (±${eps})`)

// ═══ T-WIT-1 — SKIPPED: THE WITNESS IS GONE, AND CANNOT BE SYNTHESISED ═════
const WITNESS_REMOVED = 'The witness was an approved TARSHID workbook\'s cached output, carried in the archived lighting template, which has been REMOVED for confidentiality (Constraints #7, design §0.5). It cannot be replaced with synthetic values: deriving 0.9 from aggregates we chose ourselves is circular and would confirm our own arithmetic while looking like evidence. The constants remain exactly as extracted and as seeded in tarshid_constants (0135); what is lost is the INDEPENDENT confirmation, and it returns when a clean TARSHID template or an anonymised derivative arrives. T-DRIFT below guards against silent change in the meantime — it is a drift guard, NOT a witness.'

test('T-WIT-1 — lighting_derating = 0.9, witnessed by the artefact', { skip: WITNESS_REMOVED }, () => {})
test('T-WIT-1 — control_derating x control_savings_fraction = 0.27, witnessed by the artefact', { skip: WITNESS_REMOVED }, () => {})

// ═══ T-DRIFT — A GUARD, EXPLICITLY NOT A WITNESS ═══════════════════════════
// This proves nothing about whether 0.9 and 0.27 are TARSHID's numbers; it
// proves only that nobody changed them without meaning to. Non-circular
// because it asserts against nothing derived — it compares the shipped
// defaults with the literals recorded in the design and in migration 0135.
test('T-DRIFT — the extracted constants have not moved (drift guard, not a witness)', () => {
  assert.equal(CONST_DEFAULTS.lighting_derating, 0.9)
  assert.equal(CONST_DEFAULTS.control_derating * CONST_DEFAULTS.control_savings_fraction, 0.27)
  // and 0.9 is not 1: savings are the difference DERATED, which is the whole
  // reason the constant exists
  assert.notEqual(CONST_DEFAULTS.lighting_derating, 1)
})

// ═══ T-AGG — THE SUMMARY ALGEBRA, ON DECLARED SYNTHETIC AGGREGATES ═════════
// Three rows carrying ESM-LEVEL aggregates, fed straight to summariseLighting
// to exercise the aggregation rules in isolation from the row chain.
const aggRows = () => [
  { retrofit: true, esm: 'Conv', project_lamp_qty: SYN.convBoq, baseline_kwh: SYN.convBaseline, savings_kwh: SYN.convSavings, control_baseline_kwh: 0, control_savings_kwh: 0, sensors_qty: 0 },
  { retrofit: true, esm: 'LED', project_lamp_qty: SYN.ledBoq, baseline_kwh: SYN.ledBaseline, savings_kwh: SYN.ledSavings, control_baseline_kwh: 0, control_savings_kwh: 0, sensors_qty: 0 },
  { retrofit: true, esm: 'Control-carrier', project_lamp_qty: 0, baseline_kwh: 0, savings_kwh: 0, control_baseline_kwh: SYN.controlBaseline, control_savings_kwh: SYN.controlSavings, sensors_qty: SYN.sensors },
]

test('T-AGG — each ESM percentage is that ESM\'s savings over that ESM\'s baseline', () => {
  const s = summariseLighting(aggRows())
  assert.equal(s.conv.savings_pct / 100, CONV_PCT)
  assert.equal(s.led.savings_pct / 100, LED_PCT)
  assert.equal(s.control.savings_pct / 100, CONTROL_PCT)
  // the control ESM is measured against the CONTROL baseline, not the lamp one
  assert.equal(s.conv.baseline_kwh, SYN.convBaseline)
  assert.equal(s.led.baseline_kwh, SYN.ledBaseline)
  assert.equal(s.control.baseline_kwh, SYN.controlBaseline)
  assert.equal(s.control.savings_kwh, SYN.controlSavings)
})

test('T-AGG — BOQ = Conv + LED only: sensors are reported but never added in', () => {
  const s = summariseLighting(aggRows())
  assert.equal(s.total.boq, SYN.totalBoq)
  assert.equal(s.conv.boq + s.led.boq, s.total.boq)
  assert.equal(s.control.boq, SYN.sensors)                                   // reported …
  assert.notEqual(s.total.boq, SYN.convBoq + SYN.ledBoq + SYN.sensors)       // … but never added in
})

test('T-AGG — the headline %: control savings are in the numerator ONLY', () => {
  const s = summariseLighting(aggRows())
  assert.equal(s.total.baseline_kwh, SYN.totalBaseline)   // no control baseline
  assert.equal(s.total.savings_kwh, SYN.totalSavings)     // with control savings
  assert.equal(s.total.savings_pct / 100, TOTAL_PCT)
  assert.equal(s.total.project_kwh, SYN.projectKwh)       // total baseline - total savings
  // THE CONSEQUENCE, which is the whole reason this rule matters: the headline
  // is strictly ABOVE the lamp-only figure, because the control ESM's savings
  // are added to the numerator while its baseline is added to nothing.
  assert.ok(s.total.savings_pct / 100 > LAMP_ONLY_PCT)
  // it is a weighted blend of the two replacement ESMs plus that lift — not a
  // sum, and not the naive everything-over-everything either
  assert.ok(s.total.savings_pct > s.led.savings_pct)
  assert.ok(s.total.savings_pct < s.conv.savings_pct)
  assert.notEqual(s.total.savings_pct / 100, SYN.totalSavings / (SYN.totalBaseline + SYN.controlBaseline))
})

test('T-AGG — a No-Retrofit row is excluded from every line of the summary', () => {
  const rows = [...aggRows(), {
    retrofit: false, esm: 'Conv', project_lamp_qty: 999999,
    baseline_kwh: 1e9, savings_kwh: 1e9, control_baseline_kwh: 1e9, control_savings_kwh: 1e9, sensors_qty: 999,
  }]
  const s = summariseLighting(rows)
  assert.equal(s.total.boq, SYN.totalBoq)
  assert.equal(s.total.baseline_kwh, SYN.totalBaseline)
  assert.equal(s.total.savings_kwh, SYN.totalSavings)
  assert.equal(s.control.baseline_kwh, SYN.controlBaseline)
})

test('T-WIT — row-level witnesses are not available', { skip: WITNESS_REMOVED + ' The row-level question is moot twice over: the archived template carried no data rows to reverse-derive from (its last row element was the header, while every summary formula ranged rows 12..5011), and the file itself is now gone.' }, () => {})

// ═══ THE ROW CHAIN — declared synthetic inputs, workbook formulas ══════════
const REG = [
  { id: 'L1', surveyed_unit_description: '2x36W Fluorescent Batten', conv_led: 'Conv', lamps_per_fixture: 2, wattage_w: 36 },
  { id: 'L2', surveyed_unit_description: '1x18W LED Tube', conv_led: 'LED', lamps_per_fixture: 1, wattage_w: 18 },
  // the row-315 wart, imported AS-IS by 0134 — lower-case "1x"
  { id: 'L3', surveyed_unit_description: '1x40W Surface Mounted', conv_led: 'Conv', lamps_per_fixture: 1, wattage_w: 40 },
  { id: 'L4', surveyed_unit_description: '1X40W Surface Mounted', conv_led: 'Conv', lamps_per_fixture: 1, wattage_w: 41 },
]
const IDX = () => buildLightingIndex(REG)
const OH = { building_id: 'b1', space_type: 'Office', hours_per_year: 3000, eflh: 1200 }
const lrow = (o = {}) => computeLightingRow({
  entry: { id: 'e1', building_id: 'b1', category: 'lighting', qty: 10, room_type: 'Office', model: '2x36W Fluorescent Batten', ...(o.entry || {}) },
  sel: o.sel === undefined ? { description: 'LED Panel 18W', lamps_per_fixture: 1, lamp_load_w: 18 } : o.sel,
  oh: o.oh === undefined ? OH : o.oh,
  consts: o.consts, index: o.index || IDX(),
})

test('T-LGT-CHAIN — every workbook column, in order (synthetic inputs, declared)', () => {
  const r = lrow()
  assert.equal(r.baseline_lamps_per_fixture, 2)               // L
  assert.equal(r.baseline_lamp_load_w, 36)                    // M
  assert.equal(r.baseline_fixture_wattage, 72)                // N = L x M
  assert.equal(r.baseline_lamp_qty, 20)                       // O = I x L
  assert.equal(r.baseline_load_kw, 0.72)                      // P = I x N / 1000
  assert.equal(r.baseline_kwh, 2160)                          // Q = P x G
  assert.equal(r.project_lamp_qty, 10)                        // V — the BOQ
  assert.equal(r.project_load_kw, 0.18)                       // X
  assert.equal(r.project_kwh, 540)                            // Y
  assert.equal(r.savings_kwh, (2160 - 540) * 0.9)             // Z — DERATED
  assert.equal(r.savings_kwh, 1458)
  near(r.savings_pct, (1458 / 2160) * 100, 1e-12)
  assert.equal(r.esm, 'Conv')
})

test('T-LGT — lighting baselines on OPERATING HOURS, never on EFLH', () => {
  // 3000 hours, not the 1200 EFLH sitting right beside it in the same row
  assert.equal(lrow().baseline_kwh, 0.72 * 3000)
  assert.notEqual(lrow().baseline_kwh, 0.72 * 1200)
  // and with hours absent the row is BLOCKED rather than falling back to EFLH
  const r = lrow({ oh: { eflh: 1200 } })
  assert.equal(r.baseline_kwh, null)
  assert.equal(r.savings_kwh, null)
  assert.ok(r.flags.includes('no-operating-hours'))
})

test('T-LGT — the control ESM: 0.9 x 0.3 on what is LEFT after the lamp swap', () => {
  const off = lrow()
  assert.equal(off.has_control, false)
  assert.equal(off.control_baseline_kwh, 0)                   // AD = IF(no, 0)
  assert.equal(off.control_savings_kwh, 0)
  const on = lrow({ entry: { has_control: true } })
  assert.equal(on.control_baseline_kwh, 2160 - 1458)          // AD = Q - Z
  assert.equal(on.control_baseline_kwh, 702)
  near(on.control_savings_kwh, 702 * 0.27, 1e-9)              // AE
  assert.equal(on.sensors_qty, 10)                            // AC — defaults to fixtures
  assert.equal(lrow({ entry: { has_control: true, sensors_qty: 3 } }).sensors_qty, 3)
  // per-row, so a room that got no control invents no savings (§9)
  const s = summariseLighting([off, on])
  assert.equal(s.control.baseline_kwh, 702)
})

test('T-LGT — constants come from the loaded set, not from literals', () => {
  const r = lrow({ consts: { ...CONST_DEFAULTS, lighting_derating: 1, control_derating: 1, control_savings_fraction: 1 } })
  assert.equal(r.savings_kwh, 2160 - 540)                     // underated
  const c = computeLightingRow({
    entry: { id: 'e1', qty: 10, has_control: true, model: '2x36W Fluorescent Batten' },
    sel: { lamps_per_fixture: 1, lamp_load_w: 18 }, oh: OH, index: IDX(),
    consts: { ...CONST_DEFAULTS, control_savings_fraction: 0.5 },
  })
  near(c.control_savings_kwh, c.control_baseline_kwh * 0.9 * 0.5, 1e-9)
})

// ═══ BASELINE RESOLUTION AND PROVENANCE ════════════════════════════════════
test('T-LGT-BASE — the registry fitting wins, and is labelled measured', () => {
  const b = resolveBaselineFitting({ model: '2x36W Fluorescent Batten' }, IDX())
  assert.equal(b.source, 'registry')
  assert.equal(b.provenance, 'measured')
  assert.equal(b.lamps_per_fixture, 2)
  assert.equal(b.lamp_load_w, 36)
  assert.equal(b.registry_id, 'L1')
  assert.equal(lrow().flags.includes('assumed-fitting'), false)
})

test('T-LGT-BASE — the surveyed wattage is a FALLBACK, and prints as assumed', () => {
  const idx = IDX()
  const b = resolveBaselineFitting({ model: 'Something nobody catalogued', wattage: 90, lamps_per_fixture: 3 }, idx)
  assert.equal(b.source, 'surveyed')
  assert.equal(b.provenance, 'assumed')        // §7.4 — never passes for measured
  assert.equal(b.lamps_per_fixture, 3)
  assert.equal(b.lamp_load_w, 30)              // 90 W fixture / 3 lamps
  const r = lrow({ entry: { model: 'Something nobody catalogued', wattage: 90, lamps_per_fixture: 3 } })
  assert.ok(r.flags.includes('assumed-fitting'))
  assert.equal(r.baseline_provenance, 'assumed')
})

test('T-LGT-BASE — nothing to stand on is a NAMED blocker, not a guess', () => {
  const r = lrow({ entry: { model: 'Unknown fitting' } })
  assert.equal(r.baseline_kwh, null)
  assert.equal(r.savings_kwh, null)
  assert.equal(r.baseline_provenance, null)
  assert.ok(r.flags.includes('no-baseline-fitting'))
  const p = computeLightingProject({
    entries: [{ id: 'e1', building_id: 'b1', category: 'lighting', qty: 5, room_type: 'Office', model: 'Unknown fitting' }],
    ohRows: [OH], registry: REG, selection: [], consts: CONST_DEFAULTS,
  })
  assert.equal(p.totals.blocked, 1)
})

test('T-LGT-REG — the registry key is VERBATIM, exactly as 0134 imported it', () => {
  const idx = IDX()
  // "1x40W" and "1X40W" are two different registry rows in TARSHID's own sheet
  assert.equal(lightingRegistryHit({ model: '1x40W Surface Mounted' }, idx).id, 'L3')
  assert.equal(lightingRegistryHit({ model: '1X40W Surface Mounted' }, idx).id, 'L4')
  assert.equal(resolveBaselineFitting({ model: '1x40W Surface Mounted' }, idx).lamp_load_w, 40)
  assert.equal(resolveBaselineFitting({ model: '1X40W Surface Mounted' }, idx).lamp_load_w, 41)
  // case-folded, they collide — so the loose fallback refuses to choose
  assert.equal(lightingRegistryHit({ model: '1x40w surface mounted' }, idx), null)
  // an unambiguous near-miss still resolves
  assert.equal(lightingRegistryHit({ model: '  2x36W  Fluorescent   Batten ' }, idx).id, 'L1')
  // the explicit link beats the string
  assert.equal(lightingRegistryHit({ registry_id: 'L2', model: '2x36W Fluorescent Batten' }, idx).id, 'L2')
  assert.equal(lightingRegistryHit({ model: 'nothing' }, idx), null)
  assert.equal(lightingRegistryHit({ model: '2x36W Fluorescent Batten' }, null), null)
})

test('T-LGT — esmOf keys the two replacement ESMs off the registry column', () => {
  assert.equal(esmOf('LED'), 'LED')
  assert.equal(esmOf(' led '), 'LED')
  assert.equal(esmOf('Conv'), 'Conv')
  assert.equal(esmOf(null), 'Conv')
  assert.equal(lrow({ entry: { model: '1x18W LED Tube' } }).esm, 'LED')
})

// ═══ WHOLE-PROJECT WIRING ══════════════════════════════════════════════════
test('T-LGT-PROJ — only lighting rows, only selected rows retrofit', () => {
  const entries = [
    { id: 'a', building_id: 'b1', category: 'lighting', qty: 10, room_type: 'Office', model: '2x36W Fluorescent Batten' },
    { id: 'b', building_id: 'b1', category: 'lighting', qty: 4, room_type: 'Office', model: '1x18W LED Tube' },
    { id: 'c', building_id: 'b1', category: 'lighting', qty: 7, room_type: 'Office', model: '2x36W Fluorescent Batten' },   // No-Retrofit
    { id: 'd', building_id: 'b1', category: 'ac', qty: 99, room_type: 'Office', model: 'X' },
  ]
  const p = computeLightingProject({
    entries, ohRows: [OH], registry: REG, consts: CONST_DEFAULTS,
    selection: [
      { entry_id: 'a', description: 'LED Panel 18W', lamps_per_fixture: 1, lamp_load_w: 18 },
      { entry_id: 'b', description: 'LED Tube 9W', lamps_per_fixture: 1, lamp_load_w: 9 },
    ],
  })
  assert.equal(p.rows.length, 3)                       // the AC row is not ours
  assert.equal(p.totals.retrofit, 2)
  assert.equal(p.rows.find((r) => r.entry_id === 'c').retrofit, false)
  assert.equal(p.summary.conv.boq, 10)                 // row c contributes nothing
  assert.equal(p.summary.led.boq, 4)
  assert.equal(p.totals.boq, 14)
  assert.equal(p.summary.conv.baseline_kwh, 2160)
  assert.equal(p.summary.led.baseline_kwh, (4 * 18 / 1000) * 3000)
  assert.equal(p.totals.savings_kwh, p.summary.conv.savings_kwh + p.summary.led.savings_kwh)
})
