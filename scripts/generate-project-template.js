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

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'templates')
const OUT_FILE = join(OUT_DIR, 'IES-Project-Template.xlsx')
export const TEMPLATE_OBJECT_PATH = 'IES-Project-Template.xlsx'

// ── palette ──────────────────────────────────────────────────────────────────
const BLUE = 'FF2563EB', YELLOW = 'FFFEF9C3', GREEN = 'FFDCFCE7', GRAY = 'FFF1F5F9', WHITE = 'FFFFFFFF'
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const HEADER_FONT = { bold: true, color: { argb: WHITE }, size: 11 }
const EX_FONT = { italic: true, color: { argb: 'FF64748B' }, size: 10 }
const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }
const tintFor = (req) => (req === 'req' ? YELLOW : req === 'auto' ? GRAY : GREEN)
const INPUT_ROWS = 24

// cols: [key, width, req] where req ∈ 'req'|'opt'|'auto'. header text == key.
function headerRow(ws, cols) {
  ws.columns = cols.map((c) => ({ key: c[0], width: c[1] || 16 }))
  const row = ws.getRow(1)
  cols.forEach((c, i) => {
    const cell = row.getCell(i + 1)
    cell.value = c[0]
    cell.fill = fill(BLUE)
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = BORDER
    cell.note = c[2] === 'req' ? 'Required' : c[2] === 'auto' ? 'Auto / informational' : 'Optional'
    // tint the input cells below the header by category
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

async function build() {
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
    ['Order of sheets', '1) Project  2) Buildings  3) Building Scopes  4) Materials. Only the Project sheet is mandatory; the rest are optional but recommended.'],
    ['Example rows', 'Gray italic rows marked DELETE-BEFORE-UPLOAD are samples. Delete them, or leave them — the importer skips any row marked DELETE-BEFORE-UPLOAD.'],
    ['Color legend', 'Hover a header for its note. Input cells are tinted by type:'],
    ['  Yellow = required', 'These columns must be filled.'],
    ['  Green = optional', 'Fill if you have the data; safe to leave blank.'],
    ['  Gray = example', 'Sample rows to delete or overwrite.'],
    ['', ''],
    ['Sheet: Project', 'One row. code + name required. status ∈ active / draft / on_hold / closed. pm_email / engineer_email must match a user email. lat/lng are decimal degrees.'],
    ['Sheet: Buildings', 'One row per building. project_code must match the Project sheet code. status ∈ pending / in_progress / signed / on_hold / blocked.'],
    ['Sheet: Building Scopes', 'One row per planned work item so buildings show progress immediately. building_code links a building; esm ∈ ESM1 / ESM2 / ESM3; planned_qty is the target.'],
    ['Sheet: Materials', 'Optional catalog rows. material_code must be unique; esm ∈ ESM1 / ESM2 / ESM3. Existing material codes are skipped (never overwritten).'],
    ['Sheet: Items', 'Optional Old↔New replacement pairs. One row = one old item + one new item for an ESM. Creates a removed + installed item linked as a pair (the in-app "Pair" action).'],
    ['', ''],
    ['ESM key', 'ESM1 = Lighting / Fixtures · ESM2 = Lighting Control / Sensors · ESM3 = AC Units.'],
    ['COC bundling', 'COC certification bundles ESM1 + ESM2 together by default; ESM3 gets its own certificate. Per-building override is editable in the COC Matrix after import.'],
    ['Engineer per building', 'Set assigned_engineer_email on the Buildings sheet to bind an engineer to each building at import (falls back to the project engineer_email). The name shows next to each building immediately.'],
    ['Arabic source names', 'Keep all visible fields in English. If you must retain the original Arabic site name from the tender, put it in the Buildings "arabic_name" column — it is stored as a data identifier only and shown as a small grey subtitle.'],
    ['Language', 'Enter everything in English only — no Arabic text or numerals anywhere (the arabic_name column is the only sanctioned exception).'],
    ['Template version', 'v2 (Sprint 8B) — Project doc-default columns, Buildings engineer + arabic_name, and the Items sheet.'],
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

  // ── Sheet 2: Project (single row) ──────────────────────────────────────────
  const proj = wb.addWorksheet('Project', { properties: { tabColor: { argb: BLUE } } })
  headerRow(proj, [
    ['code', 16, 'req'], ['name', 28, 'req'], ['client', 22, 'opt'], ['region', 16, 'opt'],
    ['address', 28, 'opt'], ['lat', 12, 'opt'], ['lng', 12, 'opt'], ['start_date', 14, 'opt'],
    ['end_date', 14, 'opt'], ['status', 12, 'opt'], ['total_weeks', 12, 'opt'], ['pm_email', 26, 'opt'],
    ['engineer_email', 26, 'opt'], ['contractor_name', 22, 'opt'], ['contractor_phone', 18, 'opt'], ['contractor_email', 24, 'opt'],
    // Sprint 8 #5/#8 — document-default columns the MIR/WIR/COC generators consume.
    ['project_reference_no', 20, 'opt'], ['beneficiary_entity', 22, 'opt'], ['doc_rev', 10, 'opt'],
    ['contract_sign_date', 16, 'opt'], ['works_end_date', 16, 'opt'], ['energy_services_company', 22, 'opt'],
    ['subcontractor', 20, 'opt'], ['coc_layout', 16, 'opt'], ['remarks', 22, 'opt'],
  ])
  exampleRow(proj, 2, ['MOI-ASIR', 'MOI — Asir Region', 'Ministry of Interior', 'Asir', 'Abha, Asir', 18.2164, 42.5053,
    '2025-09-01', '2027-01-01', 'active', 64, 'majed.alqahtani@ies.demo.local', 'yousef.almaliki@ies.demo.local',
    'Al-Faisal HVAC', '+966 50 000 0000', 'ops@alfaisal.example',
    'MOI-ASIR-2025', 'Ministry of Interior', '00', '2025-08-15', '2027-01-15', 'Tarshid', '', 'concatenated',
    'DELETE-BEFORE-UPLOAD'])
  addDropdown(proj, 'J', ['active', 'draft', 'on_hold', 'closed'])
  addDropdown(proj, 'X', ['concatenated', 'scattered']) // coc_layout
  proj.getColumn('lat').numFmt = '0.000000'
  proj.getColumn('lng').numFmt = '0.000000'

  // ── Sheet 3: Buildings ─────────────────────────────────────────────────────
  const blds = wb.addWorksheet('Buildings', { properties: { tabColor: { argb: BLUE } } })
  headerRow(blds, [
    ['project_code', 16, 'req'], ['building_code', 16, 'req'], ['building_name', 26, 'req'], ['city', 16, 'opt'],
    ['lat', 12, 'opt'], ['lng', 12, 'opt'], ['floors', 10, 'opt'], ['area_sqm', 12, 'opt'],
    ['contractor_name', 22, 'opt'], ['contractor_phone', 18, 'opt'], ['status', 14, 'opt'], ['remarks', 24, 'opt'],
    // Sprint 8B #18/#19/#22 — engineer bound at import; #21 Arabic name passthrough.
    ['assigned_engineer_email', 26, 'opt'], ['arabic_name', 22, 'opt'],
  ])
  exampleRow(blds, 2, ['MOI-ASIR', 'MOI-001', 'Police HQ — Abha', 'Abha', 18.2164, 42.5053, 3, 4200,
    'Al-Faisal HVAC', '+966 50 000 0000', 'in_progress', 'DELETE-BEFORE-UPLOAD', 'yousef.almaliki@ies.demo.local', ''])
  exampleRow(blds, 3, ['MOI-ASIR', 'MOI-002', 'Civil Defense — Khamis', 'Khamis Mushait', 18.3, 42.73, 2, 2600,
    'Najd Technical Co.', '+966 55 222 3333', 'pending', 'DELETE-BEFORE-UPLOAD', 'yousef.almaliki@ies.demo.local', ''])
  addDropdown(blds, 'K', ['pending', 'in_progress', 'signed', 'on_hold', 'blocked'])
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
  addDropdown(scopes, 'B', ['ESM1', 'ESM2', 'ESM3'])

  // ── Sheet 5: Materials ─────────────────────────────────────────────────────
  const mats = wb.addWorksheet('Materials', { properties: { tabColor: { argb: BLUE } } })
  headerRow(mats, [
    ['material_code', 16, 'req'], ['description', 28, 'req'], ['esm', 10, 'req'], ['unit', 12, 'opt'],
    ['threshold', 12, 'opt'], ['supplier', 22, 'opt'],
  ])
  exampleRow(mats, 2, ['LED-40W', 'LED 40W Ceiling Panel', 'ESM1', 'fixtures', 1000, 'Philips'])
  exampleRow(mats, 3, ['AC-S15', 'Split WM 1.5 TR', 'ESM3', 'units', 200, 'Trane'])
  addDropdown(mats, 'C', ['ESM1', 'ESM2', 'ESM3'])

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
  addDropdown(items, 'B', ['ESM1', 'ESM2', 'ESM3'])

  mkdirSync(OUT_DIR, { recursive: true })
  await wb.xlsx.writeFile(OUT_FILE)
  console.log('✓ wrote', OUT_FILE)
  return OUT_FILE
}

async function upload(file) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const pwd = process.env.VITE_DEMO_PASSWORD || 'IESdemo2026!'
  if (!url || !key) { console.log('• skip bucket upload (no SUPABASE env)'); return }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const { error: authErr } = await sb.auth.signInWithPassword({ email: 'admin@ies.demo.local', password: pwd })
    if (authErr) { console.log('• skip bucket upload (admin sign-in failed):', authErr.message); return }
    const body = readFileSync(file)
    const { error } = await sb.storage.from('project-templates').upload(TEMPLATE_OBJECT_PATH, body, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    })
    if (error) console.log('• bucket upload failed:', error.message)
    else console.log('✓ uploaded to project-templates/' + TEMPLATE_OBJECT_PATH)
  } catch (e) {
    console.log('• skip bucket upload:', e.message)
  }
}

const file = await build()
await upload(file)
