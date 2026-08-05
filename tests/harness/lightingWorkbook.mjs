// Builds a POPULATED lighting workbook from a stored TARSHID template, plus
// the engine snapshot that must match it. This is the fixture the cross-check
// gate is exercised against.
//
// ###########################################################################
// DEPENDENCY, EXPLICIT: THE TEMPLATE IS NOT IN THE REPOSITORY TODAY.
// ###########################################################################
// LIGHTING_TEMPLATE points at templates/tarshid/TARSHID-TEMPLATE-Lighting-
// SavingSheet.xlsx, which was a client-supplied document and has been removed
// for confidentiality (Constraints #7, design §0.5). This module is kept
// because it is the working definition of the cross-check fixture — the
// column map, the snapshot shape and the boundaries below are the knowledge
// worth keeping — but `populateLightingWorkbook` cannot run without a
// template. Callers ask `templateAvailable()` first and SKIP with
// `TEMPLATE_MISSING` as the reason; a missing template must read as "not
// verified", never as a crash and never as a pass. When a genuinely blank
// TARSHID template lands, dropping it at that path is the only change needed.
//
// WHAT THIS IS AND IS NOT, stated because the boundary matters:
//
//   IT IS a directly-populated template workbook. Rows are written into
//   Light_Savings 12+ with xlsxPatch — the generator's own patch layer — and
//   the workbook's OWN summary formulas (J1:O5 and the A10 strip, TARSHID's
//   SUMIF/SUMIFS, untouched) then aggregate them. Comparing our engine's
//   summary against those formulas is a real independent cross-check.
//
//   IT IS NOT an end-to-end generation. buildSavingSheet() downloads the
//   template from Supabase storage and reads survey_entries / operating_hours,
//   and survey_entries holds ZERO rows — the survey stage does not exist yet.
//   The owner's boundary: "if you find yourself needing survey rows that do not
//   exist, that is the boundary, not a problem to solve." No survey rows are
//   invented here; the engine is driven from in-memory fixtures exactly as the
//   U3 unit tests drive it.
//
// A SECOND BOUNDARY, discovered in this unit and larger than the first: the
// template carries NO PER-ROW FORMULAS. Light_Savings has 28 formulas, all of
// them in the summary block; columns N, O, P, Q, V, W, X, Y, Z, AD and AE have
// no formula in any data row because TARSHID stripped the rows along with the
// data. So the row arithmetic cannot be cross-checked against the workbook —
// only the aggregation can. The fixture therefore writes the engine's row
// VALUES and checks TARSHID's summary over them. See the commit body.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openXlsx, saveXlsx, findSheet, patchSheet, setFullCalcOnLoad } from '../../src/lib/xlsxPatch.js'
import { computeLightingProject } from '../../src/lib/lightingSavings.js'

export const LIGHTING_TEMPLATE = new URL('../../templates/tarshid/TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx', import.meta.url)

// The guard. Importing this module never touches the filesystem; asking for the
// template is what discovers it is gone, and the answer is a reason, not a
// stack trace.
export const TEMPLATE_MISSING = 'The lighting template this fixture is built from is not in the repository: it was a client-supplied document and was removed for confidentiality (Constraints #7, design §0.5). Nothing is verified while it is absent — this test returns the day a genuinely blank TARSHID template, or an anonymised derivative, is placed at templates/tarshid/.'

export const templateAvailable = () => existsSync(fileURLToPath(LIGHTING_TEMPLATE))

// `{ ...needsTemplate() }` spread into a node:test options object skips with
// the reason above when the template is absent, and is empty when it is there.
export const needsTemplate = () => (templateAvailable() ? {} : { skip: TEMPLATE_MISSING })

// Light_Savings' header is row 11; every summary formula ranges 12..5011.
export const FIRST_DATA_ROW = 12

// engine row field -> workbook column, from the header decoded in
// src/lib/lightingSavings.js
const COLS = [
  ['G', (r) => r.operating_hours],
  ['I', (r) => r.fix_qty],
  ['J', (r) => r.baseline_description],
  ['K', (r) => r.esm],                                  // "Conv" / "LED" — the SUMIFS key
  ['L', (r) => r.baseline_lamps_per_fixture],
  ['M', (r) => r.baseline_lamp_load_w],
  ['N', (r) => r.baseline_fixture_wattage],
  ['O', (r) => r.baseline_lamp_qty],
  ['P', (r) => r.baseline_load_kw],
  ['Q', (r) => r.baseline_kwh],
  ['R', (r) => (r.retrofit ? (r.project_description || 'LED replacement') : 'No-Retrofit')],
  ['S', (r) => r.project_lamps_per_fixture],
  ['U', (r) => r.project_lamp_load_w],
  ['V', (r) => r.project_lamp_qty],
  ['W', (r) => r.project_fixture_wattage],
  ['X', (r) => r.project_load_kw],
  ['Y', (r) => r.project_kwh],
  ['Z', (r) => r.savings_kwh],
  ['AB', (r) => (r.has_control ? 'Yes' : 'No')],
  ['AC', (r) => r.sensors_qty],
  ['AD', (r) => r.control_baseline_kwh],
  ['AE', (r) => r.control_savings_kwh],
]

export function populateLightingWorkbook(rows, { templatePath = LIGHTING_TEMPLATE } = {}) {
  if (!existsSync(fileURLToPath(templatePath))) throw new Error(TEMPLATE_MISSING)
  const zip = openXlsx(readFileSync(templatePath))
  const sheet = findSheet(zip, 'Light_Savings')
  if (!sheet) throw new Error('Light_Savings is not in the template')
  const patches = {}
  rows.forEach((r, i) => {
    const rowNo = FIRST_DATA_ROW + i
    for (const [col, pick] of COLS) {
      const v = pick(r)
      if (v == null || v === '') continue
      patches[`${col}${rowNo}`] = v
    }
  })
  const written = patchSheet(zip, sheet, patches)
  setFullCalcOnLoad(zip)                     // §0.2 layer 1, the sanctioned mutation
  return { bytes: Buffer.from(saveXlsx(zip)), written, rows: rows.length }
}

// The engine's answer, expressed as the workbook cells that must carry it.
// Only cells the template actually computes are listed: O4 for instance holds a
// hardcoded 0.27 with no formula behind it, so asserting it would be asserting
// that a constant is still a constant.
export function lightingSnapshot(project, sheetId = null) {
  const { rows, summary } = project
  const live = rows.filter((r) => r.retrofit)
  const sum = (k) => live.reduce((a, r) => a + (Number.isFinite(r[k]) ? r[k] : 0), 0)
  const pct = (s) => (s.savings_pct == null ? null : s.savings_pct / 100)
  const cell = (c, value, label) => ({ sheet: 'Light_Savings', cell: c, value, label })

  const expect = [
    // the three ESM rows plus the total — TARSHID's SUMIFS over our values
    cell('K2', summary.conv.boq, 'Conv BOQ'),
    cell('L2', summary.conv.baseline_kwh, 'Conv baseline kWh'),
    cell('N2', summary.conv.savings_kwh, 'Conv savings kWh'),
    cell('K3', summary.led.boq, 'LED BOQ'),
    cell('L3', summary.led.baseline_kwh, 'LED baseline kWh'),
    cell('N3', summary.led.savings_kwh, 'LED savings kWh'),
    cell('K4', summary.control.boq, 'Sensors'),
    cell('L4', summary.control.baseline_kwh, 'Control baseline kWh'),
    cell('N4', summary.control.savings_kwh, 'Control savings kWh'),
    cell('K5', summary.total.boq, 'BOQ total'),
    cell('L5', summary.total.baseline_kwh, 'Baseline total kWh'),
    cell('N5', summary.total.savings_kwh, 'Savings total kWh'),
    cell('M2', summary.total.project_kwh, 'Project consumption'),
    // the A10 aggregate strip
    cell('I10', sum('fix_qty'), 'Fixtures'),
    cell('O10', sum('baseline_lamp_qty'), 'Baseline lamp qty'),
    cell('P10', sum('baseline_load_kw'), 'Baseline load kW'),
    cell('Q10', sum('baseline_kwh'), 'Baseline kWh'),
    cell('V10', sum('project_lamp_qty'), 'Project lamp qty'),
    cell('X10', sum('project_load_kw'), 'Project load kW'),
    cell('Y10', sum('project_kwh'), 'Project kWh'),
    cell('Z10', sum('savings_kwh'), 'Savings kWh'),
    cell('AC10', sum('sensors_qty'), 'Sensors qty'),
    cell('AD10', sum('control_baseline_kwh'), 'Control baseline kWh'),
    cell('AE10', sum('control_savings_kwh'), 'Control savings kWh'),
  ]
  if (pct(summary.conv) != null) expect.push(cell('O2', pct(summary.conv), 'Conv %'))
  if (pct(summary.led) != null) expect.push(cell('O3', pct(summary.led), 'LED %'))
  if (pct(summary.total) != null) expect.push(cell('O5', pct(summary.total), 'Total %'))
  return { sheet_id: sheetId, expect }
}

// ── the in-memory fixture the engine is driven from ────────────────────────
// Deliberately mixed: conventional and LED baselines, a controlled space, and
// a No-Retrofit row, so every branch of the summary is exercised.
export const REGISTRY = [
  { id: 'lr-1', surveyed_unit_description: '2x36W Fluorescent Batten', conv_led: 'Conv', lamps_per_fixture: 2, wattage_w: 36 },
  { id: 'lr-2', surveyed_unit_description: '4x18W Fluorescent Troffer', conv_led: 'Conv', lamps_per_fixture: 4, wattage_w: 18 },
  { id: 'lr-3', surveyed_unit_description: '1x20W LED Panel', conv_led: 'LED', lamps_per_fixture: 1, wattage_w: 20 },
  { id: 'lr-4', surveyed_unit_description: '1x28W LED Batten', conv_led: 'LED', lamps_per_fixture: 1, wattage_w: 28 },
]

export const OH_ROWS = [
  { building_id: 'b1', space_type: 'Office', hours_per_year: 2860, eflh: 1400 },
  { building_id: 'b1', space_type: 'Corridor', hours_per_year: 8760, eflh: 3200 },
]

export const ENTRIES = [
  { id: 'e1', building_id: 'b1', category: 'lighting', qty: 143, room_type: 'Office', model: '2x36W Fluorescent Batten', has_control: true, sensors_qty: 37 },
  { id: 'e2', building_id: 'b1', category: 'lighting', qty: 96, room_type: 'Corridor', model: '4x18W Fluorescent Troffer' },
  { id: 'e3', building_id: 'b1', category: 'lighting', qty: 212, room_type: 'Office', model: '1x20W LED Panel', has_control: true, sensors_qty: 51 },
  { id: 'e4', building_id: 'b1', category: 'lighting', qty: 74, room_type: 'Corridor', model: '1x28W LED Batten' },
  { id: 'e5', building_id: 'b1', category: 'lighting', qty: 31, room_type: 'Office', model: '2x36W Fluorescent Batten' },   // No-Retrofit
  { id: 'e6', building_id: 'b1', category: 'ac', qty: 9, room_type: 'Office', model: 'not ours' },
]

export const SELECTION = [
  { entry_id: 'e1', description: 'LED Batten 18W', lamps_per_fixture: 1, lamp_load_w: 18 },
  { entry_id: 'e2', description: 'LED Troffer 36W', lamps_per_fixture: 1, lamp_load_w: 36 },
  { entry_id: 'e3', description: 'LED Panel 12W', lamps_per_fixture: 1, lamp_load_w: 12 },
  { entry_id: 'e4', description: 'LED Batten 15W', lamps_per_fixture: 1, lamp_load_w: 15 },
  // e5 has no selection — the workbook's "No-Retrofit"
]

export function fixtureProject(consts) {
  return computeLightingProject({ entries: ENTRIES, ohRows: OH_ROWS, registry: REGISTRY, selection: SELECTION, consts })
}
