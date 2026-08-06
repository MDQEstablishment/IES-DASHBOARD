#!/usr/bin/env node
/**
 * One-time generator for the colorful IES project import template (Phase 5, 1.3).
 *
 * Builds a 5-sheet, styled .xlsx (Instructions, Project, Buildings, Building
 * Scopes, Materials) with blue bold headers (row 1 = exact machine keys so the
 * importer parses cleanly), required/optional cell notes + tinted input cells,
 * data-validation dropdowns, a frozen header row, and gray italic
 * DELETE-BEFORE-UPLOAD example rows.
 *
 * Output: public/templates/IES-Project-Template.xlsx (served statically on the
 * live site). If outbound network to Supabase is allowed, it also uploads the
 * identical file to the public `project-templates` storage bucket (signing in
 * as the admin demo account) so the Import modal can serve a server-side copy.
 *
 *   node scripts/generate-project-template.js
 */
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
// U5 / COMMIT B — the bucket name comes from the one list, not from a literal.
import { BUCKETS } from '../src/lib/buckets.js'

// ── A3(18) — the dropdown lists come from the database ──────────────────────
// This generator used to hold its own copies of the status and ESM lists, at
// five call sites, alongside a second set of copies in
// src/components/ProjectModals.jsx. Two independent copies of one fact, and
// nothing that would notice them diverging: a fourth ESM added to the
// catalogue would appear in neither the template's dropdown nor the importer's
// validation, and the template would keep offering exactly three.
//
// Both now read `public.v_form_options` (migration 0139). The generator FAILS
// rather than falling back to a literal — a template built from guessed lists
// is worse than no template, because it looks authoritative and ships to a
// client to fill in.
async function loadFormOptions() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.\n' +
      '  The template\'s status and ESM dropdowns are read from public.v_form_options;\n' +
      '  there is no built-in list to fall back to, by design.')
  }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)
  const pwd = requireDemoPassword()
  const { error: authErr } = await sb.auth.signInWithPassword({ email: 'admin@ies.demo.local', password: pwd })
  if (authErr) throw new Error(`admin sign-in failed, so the option lists cannot be read: ${authErr.message}`)
  const { data, error } = await sb.from('v_form_options').select('domain,value,label,ordinal').order('ordinal')
  if (error) throw new Error(`could not read v_form_options: ${error.message}`)
  const of = (d) => (data || []).filter((r) => r.domain === d).map((r) => r.value)
  const opts = { project_status: of('project_status'), building_status: of('building_status'), esm: of('esm') }
  for (const [k, v] of Object.entries(opts)) {
    if (v.length === 0) throw new Error(`v_form_options returned no rows for "${k}" — refusing to build a template with an empty dropdown`)
  }
  console.log(`• option lists from the database — status ${opts.project_status.length}, building status ${opts.building_status.length}, ESM ${opts.esm.length} (${opts.esm.join('/')})`)
  return opts
}

// ── A3(16) — the demo password has no committed fallback ────────────────────
// This script carried a hardcoded fallback after `process.env.VITE_DEMO_PASSWORD`
// — a working password committed to a public repository, and directly against the
// standing rule already written down at src/lib/constants.js:7-9 ("The shared
// demo password comes ONLY from env — no committed fallback"). One module
// obeyed the rule and one quietly did not.
//
// NOTE FOR THE OWNER, raised separately and deliberately NOT acted on here:
// removing the fallback does not un-publish it. That credential has been in
// git history and must be rotated. Rotation is the owner's action, not this
// commit's — see MYTASKS_DEMO_CREDENTIAL_ROTATION in docs/Backlog.md.
function requireDemoPassword() {
  const pwd = process.env.VITE_DEMO_PASSWORD
  if (!pwd) {
    throw new Error(
      'VITE_DEMO_PASSWORD is not set.\n' +
      '  This script signs in as the admin demo account to read the option lists\n' +
      '  and to upload the template. There is no default: a password in source is\n' +
      '  a published password. Set it in .env.local (git-ignored) or the shell.')
  }
  return pwd
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'templates')
const OUT_FILE = join(OUT_DIR, 'IES-Project-Template-v3.xlsx')
export const TEMPLATE_OBJECT_PATH = 'IES-Project-Template-v3.xlsx'

// ── palette ──────────────────────────────────────────────────────────────────
const BLUE = 'FF2563EB', YELLOW = 'FFFEF9C3', GREEN = 'FFDCFCE7', GRAY = 'FFF1F5F9', WHITE = 'FFFFFFFF'
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const HEADER_FONT = { bold: true, color: { argb: WHITE }, size: 11 }
const EX_FONT = { italic: true, color: { argb: 'FF64748B' }, size: 10 }
const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }
const tintFor = (req) => (req === 'req' ? YELLOW : req === 'auto' ? GRAY : GREEN)
const INPUT_ROWS = 24

// Section header colours — group related fields visually (Sprint 8C). The header
// fill encodes the SECTION; the input-cell tint below still encodes required
// (yellow) vs optional (green). header text == the exact machine key.
const SECTION = {
  id:         'FF2563EB', // Identity            (blue)
  dates:      'FF0D9488', // Dates / schedule    (teal)
  people:     'FF4F46E5', // People (PM/Engineer)(indigo)
  contractor: 'FFD97706', // Contractor          (amber)
  location:   'FF475569', // Location            (slate)
  defaults:   'FF7C3AED', // Document defaults    (purple)
  elec:       'FF0EA5E9', // Electrical / meter  (sky)
}
const SECTION_LEGEND = [
  ['Identity', SECTION.id], ['Dates', SECTION.dates], ['People', SECTION.people],
  ['Contractor', SECTION.contractor], ['Location', SECTION.location],
  ['Document defaults', SECTION.defaults], ['Electrical / building info', SECTION.elec],
]

// cols: [key, width, req, section?] where req ∈ 'req'|'opt'|'auto'; section keys SECTION.
function headerRow(ws, cols) {
  ws.columns = cols.map((c) => ({ key: c[0], width: c[1] || 16 }))
  const row = ws.getRow(1)
  cols.forEach((c, i) => {
    const cell = row.getCell(i + 1)
    cell.value = c[0]
    cell.fill = fill(SECTION[c[3]] || BLUE)
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = BORDER
    cell.note = (c[2] === 'req' ? 'Required' : c[2] === 'auto' ? 'Auto / informational' : 'Optional')
      + (c[3] ? ` · ${c[3]} section` : '')
    // tint the input cells below the header by requirement
    for (let r = 2; r <= 1 + INPUT_ROWS; r++) {
      const inp = ws.getRow(r).getCell(i + 1)
      inp.fill = fill(tintFor(c[2]))
      inp.border = BORDER
    }
  })
  row.height = 24
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

function exampleRow(ws, rowIdx, values) {
  const row = ws.getRow(rowIdx)
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1)
    cell.value = v
    cell.fill = fill(GRAY)
    cell.font = EX_FONT
    cell.border = BORDER
  })
}

function addDropdown(ws, colLetter, list, fromRow = 2, toRow = 1 + INPUT_ROWS) {
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(`${colLetter}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`],
      showErrorMessage: true, errorStyle: 'warning', error: `Pick one of: ${list.join(', ')}`,
    }
  }
}

async function build(opts) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IES Programme Control Platform'
  wb.created = new Date()

  // ── Sheet 1: Instructions ──────────────────────────────────────────────────
  const ins = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: BLUE } } })
  ins.columns = [{ width: 26 }, { width: 92 }]
  ins.mergeCells('A1:B1')
  const t = ins.getCell('A1')
  t.value = 'IES — Project Import Template'
  t.fill = fill(BLUE)
  t.font = { bold: true, size: 16, color: { argb: WHITE } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ins.getRow(1).height = 30

  const lines = [
    ['', ''],
    ['How to use', 'Fill the sheets below, then upload this file in Projects → Import Excel. A preview shows exactly what will be created before anything is saved.'],
    ['Order of sheets', '1) Project  2) Buildings  3) Building Scopes  4) Materials  5) Items. Only the Project sheet is mandatory; the rest are optional but recommended.'],
    ['Example rows', 'Gray italic rows marked DELETE-BEFORE-UPLOAD are samples. Delete them, or leave them — the importer skips any row marked DELETE-BEFORE-UPLOAD.'],
    ['Cell colours', 'Two cues per column. The HEADER colour groups related fields into sections; the cell tint below shows whether it is required or optional:'],
    ['  Yellow cell = required', 'These columns must be filled.'],
    ['  Green cell = optional', 'Fill if you have the data; safe to leave blank.'],
    ['  Gray row = example', 'Sample rows to delete or overwrite.'],
    ['Header sections', 'Identity (blue) · Dates (teal) · People (indigo) · Contractor (amber) · Location (slate) · Document defaults (purple) · Electrical / building info (sky). Hover any header for its note.'],
    ['', ''],
    ['Sheet: Project — fill', 'One row. Identity (code + name required) → Dates → People → Contractor → Location → Document defaults. pm_email/engineer_email must match a user; pm_name/engineer_name are optional display overrides.'],
    ['Sheet: Buildings — fill', 'One row per building. project_code must match the Project code. Includes the Building Info block (building_type, electrical meter / subscription / account, responsible person, operating_hours) shown on the building page.'],
    ['Sheet: Building Scopes — fill', 'One row per planned work item so buildings show progress immediately. building_code links a building; esm ∈ ESM1 / ESM2 / ESM3; planned_qty is the target.'],
    ['Sheet: Materials — fill', 'Optional catalog rows. material_code must be unique; esm ∈ ESM1 / ESM2 / ESM3. Existing codes are skipped (never overwritten).'],
    ['Sheet: Items — fill', 'Optional Old↔New replacement pairs. One row = one old + one new item for an ESM. Creates a removed + installed item linked as a pair (the in-app "Pair" action).'],
    ['', ''],
    ['ESM key', 'ESM1 = Lighting / Fixtures · ESM2 = Lighting Control / Sensors · ESM3 = AC Units.'],
    ['COC bundling', 'Each ESM gets its OWN COC by default (ESM1, ESM2 and ESM3 are separate certificates). To group ESM1 + ESM2 (lighting) under one COC, put any label in the Project "coc_bundle_key" column — blank = standalone.'],
    ['Engineer per building', 'Set assigned_engineer_email on the Buildings sheet to bind an engineer to each building at import (falls back to the project engineer_email). The name shows next to each building immediately.'],
    ['Operating hours', 'Buildings "operating_hours" = annual operating hours agreed with the client (per building, since it can vary by contract).'],
    ['Arabic source names', 'Keep all visible fields in English. If you must retain the original Arabic site name from the tender, put it in the Buildings "arabic_name" column — stored as a data identifier only and shown as a small grey subtitle.'],
    ['Language', 'Enter everything in English only — no Arabic text or numerals anywhere (the arabic_name column is the only sanctioned exception).'],
    ['Template version', 'v3 (Sprint 8C) — colour-coded header sections, standalone-COC default + coc_bundle_key, Building Info columns (type / electrical / responsible person / operating hours), and pm_name/engineer_name display overrides.'],
  ]
  let r = 2
  for (const [k, v] of lines) {
    const row = ins.getRow(r)
    row.getCell(1).value = k
    row.getCell(2).value = v
    row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } }
    row.getCell(2).font = { size: 11, color: { argb: 'FF334155' } }
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    if (k.includes('Yellow')) row.getCell(1).fill = fill(YELLOW)
    if (k.includes('Green')) row.getCell(1).fill = fill(GREEN)
    if (k.includes('Gray')) row.getCell(1).fill = fill(GRAY)
    row.height = 26
    r++
  }
  // Visual section swatch legend — a coloured chip per header section.
  r++
  ins.getRow(r).getCell(1).value = 'Section swatches'
  ins.getRow(r).getCell(1).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } }
  r++
  for (const [label, argb] of SECTION_LEGEND) {
    const row = ins.getRow(r)
    const chip = row.getCell(1)
    chip.fill = fill(argb)
    chip.value = ''
    chip.border = BORDER
    row.getCell(2).value = label
    row.getCell(2).font = { size: 11, color: { argb: 'FF334155' } }
    row.height = 20
    r++
  }

  // ── Sheet 2: Project (single row) ──────────────────────────────────────────
  const proj = wb.addWorksheet('Project', { properties: { tabColor: { argb: BLUE } } })
  headerRow(proj, [
    // Identity
    ['code', 16, 'req', 'id'], ['name', 28, 'req', 'id'], ['client', 22, 'opt', 'id'], ['region', 16, 'opt', 'id'],
    // Dates / schedule
    ['start_date', 14, 'opt', 'dates'], ['end_date', 14, 'opt', 'dates'], ['total_weeks', 12, 'opt', 'dates'], ['status', 12, 'opt', 'dates'],
    // People (email = identity/permission; name = optional display override)
    ['pm_email', 26, 'opt', 'people'], ['engineer_email', 26, 'opt', 'people'], ['pm_name', 20, 'opt', 'people'], ['engineer_name', 20, 'opt', 'people'],
    // Contractor
    ['contractor_name', 22, 'opt', 'contractor'], ['contractor_phone', 18, 'opt', 'contractor'], ['contractor_email', 24, 'opt', 'contractor'],
    // Location
    ['address', 28, 'opt', 'location'], ['lat', 12, 'opt', 'location'], ['lng', 12, 'opt', 'location'],
    // Document defaults (MIR/WIR/COC)
    ['project_reference_no', 20, 'opt', 'defaults'], ['beneficiary_entity', 22, 'opt', 'defaults'], ['doc_rev', 10, 'opt', 'defaults'],
    ['contract_sign_date', 16, 'opt', 'defaults'], ['works_end_date', 16, 'opt', 'defaults'], ['energy_services_company', 22, 'opt', 'defaults'],
    ['subcontractor', 20, 'opt', 'defaults'], ['coc_bundle_key', 16, 'opt', 'defaults'], ['remarks', 22, 'opt', 'id'],
  ])
  exampleRow(proj, 2, ['PROJECT-A', 'Project A', 'Entity A', 'Asir',
    '2025-09-01', '2027-01-01', 64, 'active',
    'majed.alqahtani@ies.demo.local', 'yousef.almaliki@ies.demo.local', '', '',
    'Al-Faisal HVAC', '+966 50 000 0000', 'ops@alfaisal.example',
    'Abha, Asir', 18.2164, 42.5053,
    'PROJECT-A-2025', 'Entity A', '00', '2025-08-15', '2027-01-15', 'Tarshid', '', '',
    'DELETE-BEFORE-UPLOAD'])
  addDropdown(proj, 'H', opts.project_status) // status (col 8)
  proj.getColumn('lat').numFmt = '0.000000'
  proj.getColumn('lng').numFmt = '0.000000'

  // ── Sheet 3: Buildings ─────────────────────────────────────────────────────
  const blds = wb.addWorksheet('Buildings', { properties: { tabColor: { argb: BLUE } } })
  headerRow(blds, [
    ['project_code', 16, 'req', 'id'], ['building_code', 16, 'req', 'id'], ['building_name', 26, 'req', 'id'], ['city', 16, 'opt', 'location'],
    ['lat', 12, 'opt', 'location'], ['lng', 12, 'opt', 'location'], ['floors', 10, 'opt', 'id'], ['area_sqm', 12, 'opt', 'id'],
    ['contractor_name', 22, 'opt', 'contractor'], ['contractor_phone', 18, 'opt', 'contractor'], ['status', 14, 'opt', 'dates'], ['remarks', 24, 'opt', 'id'],
    // Sprint 8B #18/#19/#22 — engineer bound at import; #21 Arabic name passthrough.
    ['assigned_engineer_email', 26, 'opt', 'people'], ['arabic_name', 22, 'opt', 'id'],
    // Sprint 8C #2/#3/#5 — Building Info (shown in the new collapsed section on the building page).
    ['building_type', 18, 'opt', 'elec'], ['elec_meter_no', 16, 'opt', 'elec'], ['elec_subscription_no', 18, 'opt', 'elec'],
    ['elec_account_no', 16, 'opt', 'elec'], ['responsible_person_name', 22, 'opt', 'contractor'], ['responsible_person_phone', 20, 'opt', 'contractor'],
    ['operating_hours', 16, 'opt', 'dates'],
  ])
  exampleRow(blds, 2, ['PROJECT-A', 'MOI-001', 'Police HQ — Abha', 'Abha', 18.2164, 42.5053, 3, 4200,
    'Al-Faisal HVAC', '+966 50 000 0000', 'in_progress', 'DELETE-BEFORE-UPLOAD', 'yousef.almaliki@ies.demo.local', '',
    'Police Station', 'MTR-001', 'SUB-1001', 'ACC-77001', 'Capt. Saad', '+966 50 111 2222', 3120])
  exampleRow(blds, 3, ['PROJECT-A', 'MOI-002', 'Civil Defense — Khamis', 'Khamis Mushait', 18.3, 42.73, 2, 2600,
    'Najd Technical Co.', '+966 55 222 3333', 'pending', 'DELETE-BEFORE-UPLOAD', 'yousef.almaliki@ies.demo.local', '',
    'Civil Defense', 'MTR-002', 'SUB-1002', 'ACC-77002', 'Maj. Nasser', '+966 55 333 4444', 3120])
  addDropdown(blds, 'K', opts.building_status)
  blds.getColumn('lat').numFmt = '0.000000'
  blds.getColumn('lng').numFmt = '0.000000'

  // ── Sheet 4: Building Scopes ───────────────────────────────────────────────
  const scopes = wb.addWorksheet('Building Scopes', { properties: { tabColor: { argb: BLUE } } })
  headerRow(scopes, [
    ['building_code', 16, 'req'], ['esm', 10, 'req'], ['material_code', 16, 'opt'], ['sub_type', 16, 'opt'],
    ['planned_qty', 12, 'req'], ['unit', 12, 'opt'], ['notes', 24, 'opt'],
  ])
  exampleRow(scopes, 2, ['MOI-001', 'ESM1', 'LED-40W', 'ceiling panel', 120, 'fixtures', 'DELETE-BEFORE-UPLOAD'])
  exampleRow(scopes, 3, ['MOI-001', 'ESM3', 'AC-S15', 'split 1.5 TR', 15, 'units', 'DELETE-BEFORE-UPLOAD'])
  addDropdown(scopes, 'B', opts.esm)

  // ── Sheet 5: Materials ─────────────────────────────────────────────────────
  const mats = wb.addWorksheet('Materials', { properties: { tabColor: { argb: BLUE } } })
  headerRow(mats, [
    ['material_code', 16, 'req'], ['description', 28, 'req'], ['esm', 10, 'req'], ['unit', 12, 'opt'],
    ['threshold', 12, 'opt'], ['supplier', 22, 'opt'],
  ])
  // A3(17) — these two rows were the ONLY example rows in the workbook without
  // a DELETE-BEFORE-UPLOAD marker. `isExampleRow()` in ProjectModals.jsx tests
  // for that exact string and nothing else, so both rows survived the filter
  // and a client who forgot to delete them imported two real materials —
  // "LED 40W Ceiling Panel" from Philips and a Trane split — into their
  // programme. They are styled as examples and read as examples; only the
  // machine could not tell. The Materials sheet has no free 'remarks' column,
  // so the marker goes in `supplier`, which is optional and is where the
  // give-away brand names were.
  exampleRow(mats, 2, ['LED-40W', 'LED 40W Ceiling Panel', 'ESM1', 'fixtures', 1000, 'DELETE-BEFORE-UPLOAD'])
  exampleRow(mats, 3, ['AC-S15', 'Split WM 1.5 TR', 'ESM3', 'units', 200, 'DELETE-BEFORE-UPLOAD'])
  addDropdown(mats, 'C', opts.esm)

  // ── Sheet 6: Items (Old↔New replacement pairs) ─────────────────────────────
  // Sprint 8B #25/#4 — each row pairs one removed (old) item with one installed
  // (new) item per ESM, mirroring the in-app Items & Replacements "Pair" action.
  const items = wb.addWorksheet('Items', { properties: { tabColor: { argb: BLUE } } })
  headerRow(items, [
    ['building_code', 16, 'opt'], ['esm', 10, 'req'], ['old_code', 16, 'opt'], ['old_description', 26, 'req'],
    ['old_qty', 10, 'opt'], ['new_code', 16, 'opt'], ['new_description', 26, 'req'], ['new_qty', 10, 'opt'],
    ['unit', 12, 'opt'], ['notes', 22, 'opt'],
  ])
  exampleRow(items, 2, ['MOI-001', 'ESM3', 'OLD-AC-2T', 'Old window AC 2 TR', 4, 'AC-S15', 'Split inverter 1.5 TR', 4, 'units', 'DELETE-BEFORE-UPLOAD'])
  exampleRow(items, 3, ['MOI-001', 'ESM1', 'OLD-FL-40', 'Old fluorescent 40W', 120, 'LED-40W', 'LED panel 40W', 120, 'fixtures', 'DELETE-BEFORE-UPLOAD'])
  addDropdown(items, 'B', opts.esm)

  mkdirSync(OUT_DIR, { recursive: true })
  await wb.xlsx.writeFile(OUT_FILE)
  console.log('✓ wrote', OUT_FILE)
  return OUT_FILE
}

async function upload(file) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) { console.log('• skip bucket upload (no SUPABASE env)'); return }
  const pwd = requireDemoPassword()
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const { error: authErr } = await sb.auth.signInWithPassword({ email: 'admin@ies.demo.local', password: pwd })
    if (authErr) { console.log('• skip bucket upload (admin sign-in failed):', authErr.message); return }
    const body = readFileSync(file)
    const { error } = await sb.storage.from(BUCKETS.PROJECT_TEMPLATES).upload(TEMPLATE_OBJECT_PATH, body, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    })
    if (error) console.log('• bucket upload failed:', error.message)
    else console.log('✓ uploaded to project-templates/' + TEMPLATE_OBJECT_PATH)
  } catch (e) {
    console.log('• skip bucket upload:', e.message)
  }
}

// Fail loudly and early: a missing env var must stop the run with a sentence
// that says what to set, not produce a template built from assumptions.
let opts
try {
  opts = await loadFormOptions()
} catch (e) {
  console.error('\u2717 cannot generate the template:', e.message)
  process.exit(1)
}
const file = await build(opts)
await upload(file)
