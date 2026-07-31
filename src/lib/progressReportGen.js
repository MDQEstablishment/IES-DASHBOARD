// 9F — fill the uploaded progress-report workbook (5 sheets, 1,324 formulas).
//
// The design lives entirely in the template. This writes INPUT CELLS ONLY, and
// patchSheet refuses to overwrite anything containing a formula, so every
// derived column, total row and chart keeps computing as designed.
//
// Sheet-by-sheet contract (owner's spec):
//   Dashboard          all formulas, NO inputs — NEVER PATCHED.
//   Report Data        meta row 5; ESM table header row 8 (inputs C,D,F,I);
//                      daily log header row 15, 65 data rows (inputs B,D,E,F).
//   Buildings          header row 5, 300 rows (inputs B..I; J,K,L formulas).
//   Documents & COCs   docs header row 5, 14 rows (inputs B..F);
//                      COC header row 23, 8 rows (inputs B,C).
//   Site Evidence      header row 5, 80 rows, all inputs.
//
// Header POSITIONS are still discovered with findHeaderRow/colFor rather than
// hardcoded, so a row shift or a renamed column does not break generation —
// the row numbers above are the spec's, used only to bound the scan windows.
// Empty rows are never written to: the template's formulas self-blank, and
// writing 0 into an unused row would turn clean whitespace into a wall of
// zeros.
import { supabase } from './supabase'
import { openXlsx, saveXlsx, findSheet, readSheet, findHeaderRow, colFor, patchSheet, setFullCalcOnLoad, stripChartCaches } from './xlsxPatch'
import { labelCategory } from './progressReport'

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Excel stores a date as days since 1899-12-30 (anchor check: 2024-01-01 =
// 45292). Written as a NUMBER so the template's own date format renders it and
// digits stay Latin under any locale.
export function excelSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000)
}

const nextCol = (col) => col.slice(0, -1) + String.fromCharCode(col.charCodeAt(col.length - 1) + 1)

// Label/value fill bounded to ONE row. Bounding matters: "Date" appears both
// in the meta row and in the daily-log header, and an unbounded scan would
// write the project name into the log.
function fillMetaRow(zip, sheet, row, MAP) {
  if (!sheet) return { written: 0, matched: [] }
  const data = readSheet(zip, sheet)
  const patches = {}
  const matched = []
  data.cells.forEach((cell, ref) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!m || parseInt(m[2], 10) !== row || cell.v == null || cell.isFormula) return
    const label = norm(cell.v)
    if (!label) return
    for (const [keys, value] of MAP) {
      if (value == null || value === '') continue
      if (keys.some((k) => label === k || label.startsWith(k))) {
        patches[`${nextCol(m[1])}${m[2]}`] = value
        matched.push(keys[0])
        break
      }
    }
  })
  return { written: patchSheet(zip, sheet, patches), matched }
}

// ESM table — rows are Lights / A/C / Sensors and their ORDER is read from the
// sheet's own first column, never assumed. Inputs: Total Qty, Delivered,
// Installed, Target Date. In Warehouse, To Install, To Deliver, Report Date,
// Days Left, Req./Day, Actual/Day and Complete % are the template's formulas.
function fillEsmTable(zip, sheet, esms) {
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['esm', 'total qty', 'delivered', 'in warehouse', 'installed', 'target date'], { scan: 14, minHits: 4 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'ESM table header not found on Report Data' }
  const C = {
    esm: colFor(header, 'esm'),
    total: colFor(header, 'total qty', 'total quantity'),
    delivered: colFor(header, 'delivered'),
    installed: colFor(header, 'installed'),
    target: colFor(header, 'target date'),
  }
  if (!C.esm) return { found: true, cells: 0, rows: 0, error: 'ESM label column not found' }

  const byCategory = new Map()
  esms.forEach((e) => { if (e.category && !byCategory.has(e.category)) byCategory.set(e.category, { total: 0, delivered: 0, installed: 0, est: '' }) })
  esms.forEach((e) => {
    if (!e.category) return
    const acc = byCategory.get(e.category)
    acc.total += e.total; acc.delivered += e.delivered; acc.installed += e.installed
    if (!acc.est && e.est_date) acc.est = e.est_date
  })

  const patches = {}
  const mapped = []
  let unmatchedRows = 0
  // walk the label column below the header until the labels run out
  for (let r = header.row + 1; r <= header.row + 8; r++) {
    const label = data.cells.get(`${C.esm}${r}`)?.v
    if (label == null || String(label).trim() === '') continue
    const cat = labelCategory(label)
    if (!cat) { unmatchedRows++; continue }
    const acc = byCategory.get(cat)
    if (!acc) continue                              // no ESM of this kind on the project
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.total, acc.total)
    put(C.delivered, acc.delivered)
    put(C.installed, acc.installed)
    put(C.target, excelSerial(acc.est))
    mapped.push(`${String(label).trim()} -> ${cat}`)
  }
  return {
    found: true, cells: patchSheet(zip, sheet, patches), rows: mapped.length,
    header_row: header.row, mapped, error: unmatchedRows ? `${unmatchedRows} ESM row label(s) did not match Lights/AC/Sensors` : null,
  }
}

// Daily log — 65 data rows. Inputs are Date and the three quantity columns;
// Day, Total/day and the three cumulative columns are the template's formulas,
// so the cumulative series accumulates WITHIN the period. Project-to-date
// figures live in the ESM table's Installed column.
function fillDailyLog(zip, sheet, daily, afterRow, capacity) {
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['date', 'day', 'lights', 'total'], { from: afterRow, scan: afterRow + 30, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Daily log header not found on Report Data' }
  const C = {
    date: colFor(header, 'date'),
    lights: colFor(header, 'lights'),
    ac: colFor(header, 'a/c', 'ac'),
    sensors: colFor(header, 'sensors'),
  }
  // the cumulative columns share the words Lights / A/C / Sensors — make sure
  // colFor picked the QUANTITY columns, not "Cum. Lights"
  ;['lights', 'ac', 'sensors'].forEach((k) => {
    const key = Object.keys(header.cols).find((h) => header.cols[h] === C[k])
    if (key && key.startsWith('cum')) C[k] = null
  })

  const days = daily.filter((d) => !d.opening)
  const used = Math.min(days.length, capacity)
  const patches = {}
  days.slice(0, used).forEach((row, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null) patches[`${col}${r}`] = v }
    put(C.date, excelSerial(row.date))
    put(C.lights, row.per_category.lights)
    put(C.ac, row.per_category.ac)
    put(C.sensors, row.per_category.sensors)
  })
  return {
    found: true, cells: patchSheet(zip, sheet, patches), rows: used,
    header_row: header.row, capacity, truncated: days.length - used,
    error: days.length > capacity
      ? `The period is ${days.length} days but the daily log holds ${capacity} — the last ${days.length - capacity} day(s) are NOT in the workbook`
      : null,
  }
}

// Buildings — inputs B..I (code, name, then planned/installed per category).
// Total Planned, Total Installed and Completion % are the template's formulas.
function fillBuildings(zip, buildings, capacity) {
  const sheet = findSheet(zip, 'Buildings', 'Buildings Progress', 'Building Progress')
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['building code', 'building name', 'lights planned', 'total planned'], { scan: 12, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Buildings header not found' }
  const C = {
    code: colFor(header, 'building code'),
    name: colFor(header, 'building name'),
    lp: colFor(header, 'lights planned'), li: colFor(header, 'lights installed'),
    ap: colFor(header, 'a/c planned', 'ac planned'), ai: colFor(header, 'a/c installed', 'ac installed'),
    sp: colFor(header, 'sensors planned'), si: colFor(header, 'sensors installed'),
  }
  const used = Math.min(buildings.length, capacity)
  const patches = {}
  buildings.slice(0, used).forEach((b, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.code, b.code); put(C.name, b.name)
    put(C.lp, b.per_category.lights.planned); put(C.li, b.per_category.lights.installed)
    put(C.ap, b.per_category.ac.planned); put(C.ai, b.per_category.ac.installed)
    put(C.sp, b.per_category.sensors.planned); put(C.si, b.per_category.sensors.installed)
  })
  return {
    found: true, cells: patchSheet(zip, sheet, patches), rows: used, header_row: header.row,
    error: buildings.length > capacity ? `${buildings.length - capacity} building(s) beyond the sheet's ${capacity} rows are not listed` : null,
  }
}

// Documents & COCs — two tables on one sheet.
function fillDocuments(zip, { documents, cocs }, capacity) {
  const sheet = findSheet(zip, 'Documents & COCs', 'Documents and COCs', 'Documents COCs', 'Documents')
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const dh = findHeaderRow(data, ['document type', 'submitted', 'under review', 'approved'], { scan: 12, minHits: 3 })
  if (!dh) return { found: true, cells: 0, rows: 0, error: 'Documents header not found' }
  const C = {
    type: colFor(dh, 'document type'),
    submitted: colFor(dh, 'submitted'),
    review: colFor(dh, 'under review'),
    approved: colFor(dh, 'approved'),
    rejected: colFor(dh, 'rejected'),
  }
  const patches = {}
  const unmapped = new Map()
  const docs = documents.slice(0, capacity.docs)
  docs.forEach((d, i) => {
    const r = dh.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.type, String(d.doc_type).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    put(C.submitted, d.submitted); put(C.review, d.under_review)
    put(C.approved, d.approved); put(C.rejected, d.rejected)
    // the template has no Draft column — count what would be lost rather than
    // folding it into another status
    if (d.draft) unmapped.set('draft', (unmapped.get('draft') || 0) + d.draft)
  })

  // COC table, further down the same sheet
  const ch = findHeaderRow(data, ['coc status', 'count'], { from: dh.row + 1, scan: dh.row + 40, minHits: 2 })
  let cocCells = 0, cocRows = 0
  if (ch) {
    const cc = { status: colFor(ch, 'coc status'), count: colFor(ch, 'count') }
    const list = (cocs.by_status || []).slice(0, capacity.cocs)
    const cocPatches = {}
    list.forEach((s, i) => {
      const r = ch.row + 1 + i
      if (cc.status) cocPatches[`${cc.status}${r}`] = String(s.status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      if (cc.count) cocPatches[`${cc.count}${r}`] = s.count
    })
    cocCells = patchSheet(zip, sheet, cocPatches)
    cocRows = list.length
  }
  const notes = []
  if (documents.length > capacity.docs) notes.push(`${documents.length - capacity.docs} document type(s) beyond the sheet's ${capacity.docs} rows are not listed`)
  if (!ch) notes.push('COC table header not found')
  unmapped.forEach((n, k) => notes.push(`${n} document(s) with status "${k}" have no column in the template and are not shown`))
  return { found: true, cells: patchSheet(zip, sheet, patches) + cocCells, rows: docs.length, coc_rows: cocRows, error: notes.join(' · ') || null }
}

// Site Evidence — the index into the PDF annex. Every column is an input and
// NO URL is ever written: signed links expire and would be dead by the time a
// client opens the file.
function fillEvidence(zip, evidence, capacity) {
  const sheet = findSheet(zip, 'Site Evidence', 'Evidence', 'Photos')
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['building', 'room', 'date', 'caption', 'annex'], { scan: 12, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Site Evidence header not found' }
  const C = {
    building: colFor(header, 'building'),
    room: colFor(header, 'room / location', 'room'),
    date: colFor(header, 'date'),
    category: colFor(header, 'category'),
    caption: colFor(header, 'caption'),
    annex: colFor(header, 'annex page', 'annex'),
  }
  const used = Math.min(evidence.length, capacity)
  const patches = {}
  evidence.slice(0, used).forEach((e, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.building, e.building); put(C.room, e.room)
    put(C.date, excelSerial(e.date)); put(C.category, e.category)
    put(C.caption, e.caption)
    put(C.annex, e.annex_page ?? null)      // written back from the annex build
  })
  return {
    found: true, cells: patchSheet(zip, sheet, patches), rows: used, header_row: header.row,
    error: evidence.length > capacity ? `${evidence.length - capacity} photo(s) beyond the sheet's ${capacity} rows are not indexed` : null,
  }
}

// Sheet capacities from the template spec. Used only to CLAMP — the alternative
// (inserting rows) would mean rewriting SUM and cumulative ranges across three
// columns plus the chart references, i.e. formula surgery on a 1,324-formula
// workbook. Clamping is reported loudly instead.
export const CAPACITY = { daily: 65, buildings: 300, docs: 14, cocs: 8, evidence: 80 }

export function fillReportWorkbook(zip, data) {
  const dataSheet = findSheet(zip, 'Report Data', 'ReportData')

  // Dashboard is 100% formulas — writing anything there breaks it.
  const meta = fillMetaRow(zip, dataSheet, 5, [
    [['project'], data.meta.project_name || data.meta.project_code],
    [['client', 'beneficiary', 'entity'], data.meta.client],
    [['contract', 'contractor'], data.meta.contractor],
    [['ref', 'referenceno'], data.meta.reference],
  ])

  const esmFill = fillEsmTable(zip, dataSheet, data.esms)
  const dailyFill = fillDailyLog(zip, dataSheet, data.daily, (esmFill.header_row || 8) + 1, CAPACITY.daily)
  const buildingsFill = fillBuildings(zip, data.buildings, CAPACITY.buildings)
  const docsFill = fillDocuments(zip, { documents: data.documents, cocs: data.cocs }, CAPACITY)
  const evidenceFill = fillEvidence(zip, data.evidence, CAPACITY.evidence)

  const charts = stripChartCaches(zip)
  setFullCalcOnLoad(zip)

  return {
    sheets: zip.sheets.map((s) => s.name),
    meta: { found: !!dataSheet, cells: meta.written, matched: meta.matched },
    esm_table: esmFill,
    daily_log: dailyFill,
    buildings: buildingsFill,
    documents: docsFill,
    evidence: evidenceFill,
    charts_refreshed: charts,
    warnings: data.warnings,
  }
}

export async function buildProgressReport({ templatePath, data }) {
  const { data: dl, error } = await supabase.storage.from('report-templates').download(templatePath)
  if (error || !dl) throw new Error('Could not load the report template — ' + (error?.message || 'missing file'))
  const zip = openXlsx(await dl.arrayBuffer())
  const report = fillReportWorkbook(zip, data)
  return { bytes: saveXlsx(zip), report }
}
