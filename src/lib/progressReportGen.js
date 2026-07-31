// 9F — fill the uploaded progress-report workbook. The design (branded header,
// logo, KPI + ESM cards, column and line charts, 395 formulas) lives entirely
// in the template; this writes INPUT CELLS ONLY and patchSheet refuses to
// overwrite anything containing a formula, so the Dashboard's cards keep
// computing from the Report Data sheet exactly as designed.
//
// Sheet names and header positions are DISCOVERED at runtime, never hardcoded,
// so a design tweak that shifts a row or renames a column does not break
// generation — and whatever could NOT be found is reported back to the UI
// instead of failing silently.
import { supabase } from './supabase'
import { openXlsx, saveXlsx, findSheet, readSheet, findHeaderRow, colFor, patchSheet, setFullCalcOnLoad, stripChartCaches } from './xlsxPatch'

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Excel stores a date as days since 1899-12-30. Written as a NUMBER so the
// template's own date format renders it — and so Latin digits are guaranteed
// regardless of the reader's locale.
export function excelSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000)
}

// Label/value fill: find a cell whose text matches, write the neighbour to its
// right. Used for the report's header band (project, client, reference,
// period) — the only free-form part of the Dashboard.
function fillLabels(zip, sheet, MAP) {
  if (!sheet) return { written: 0, matched: [] }
  const data = readSheet(zip, sheet)
  const patches = {}
  const matched = []
  data.cells.forEach((cell, ref) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!m || cell.v == null || cell.isFormula) return
    const label = norm(cell.v)
    if (!label) return
    for (const [keys, value] of MAP) {
      if (value == null || value === '') continue
      if (keys.some((k) => label === k || label.startsWith(k))) {
        // write the cell immediately to the right of the label
        const col = m[1].length === 1
          ? String.fromCharCode(m[1].charCodeAt(0) + 1)
          : m[1].slice(0, -1) + String.fromCharCode(m[1].charCodeAt(m[1].length - 1) + 1)
        patches[`${col}${m[2]}`] = value
        matched.push(keys[0])
        break
      }
    }
  })
  return { written: patchSheet(zip, sheet, patches), matched }
}

// The ESM table — the numbers every Dashboard card and the column chart read.
function fillEsmTable(zip, sheet, esms) {
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['esm', 'total quantity', 'installed', 'warehouse', 'remaining', 'completion'], { scan: 20, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'ESM table header not found' }
  const C = {
    esm: colFor(header, 'esm', 'measure', 'scope'),
    name: colFor(header, 'description', 'name'),
    total: colFor(header, 'total quantity', 'total qty', 'total'),
    installed: colFor(header, 'installed'),
    warehouse: colFor(header, 'in warehouse', 'warehouse', 'stock'),
    remaining: colFor(header, 'remaining', 'balance'),
    est: colFor(header, 'estimated completion', 'completion date', 'target date'),
    daysLeft: colFor(header, 'days left', 'days remaining'),
    required: colFor(header, 'required per day', 'required/day', 'required rate'),
    actual: colFor(header, 'actual per day', 'actual average', 'actual rate'),
    completion: colFor(header, 'completion %', 'completion', 'progress'),
    status: colFor(header, 'status', 'flag', 'on track'),
    delivered: colFor(header, 'delivered'),
  }
  const patches = {}
  esms.forEach((e, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.esm, e.code)
    put(C.name, e.name)
    put(C.total, e.total)
    put(C.installed, e.installed)
    put(C.delivered, e.delivered)
    put(C.warehouse, e.in_warehouse)
    put(C.remaining, e.remaining)
    put(C.est, excelSerial(e.est_date))
    put(C.daysLeft, e.days_left)
    put(C.required, e.required_per_day)
    put(C.actual, e.actual_per_day)
    // completion % as a FRACTION — the template's cell is percent-formatted
    put(C.completion, e.total > 0 ? e.installed / e.total : 0)
    put(C.status, e.on_track ? 'ON TRACK' : 'BEHIND PACE')
  })
  return { found: true, cells: patchSheet(zip, sheet, patches), rows: esms.length, header_row: header.row, error: null }
}

// The daily installation log, stacked UNDER the ESM table on the same sheet —
// hence the `from` scan window. Feeds the line chart's three series.
function fillDailyLog(zip, sheet, { daily, codes }, afterRow) {
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['date', 'day', 'total', 'cumulative'], { from: afterRow + 1, scan: afterRow + 60, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Daily log header not found' }
  const C = {
    date: colFor(header, 'date'),
    day: colFor(header, 'day name', 'day'),
    total: colFor(header, 'total per day', 'daily total', 'total'),
  }
  // per-ESM daily columns and their cumulative twins, resolved by code
  const perEsm = {}, cumulative = {}
  codes.forEach((c) => {
    perEsm[c] = colFor(header, `${c} daily`, `${c} installed`, c)
    cumulative[c] = colFor(header, `${c} cumulative`, `cumulative ${c}`, `${c} cum`)
  })
  const patches = {}
  daily.forEach((row, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.date, row.opening ? null : excelSerial(row.date))
    put(C.day, row.day_name)
    if (!row.opening) put(C.total, row.total)
    codes.forEach((c) => {
      if (!row.opening) put(perEsm[c], row.per_esm[c] ?? 0)
      put(cumulative[c], row.cumulative[c] ?? 0)
    })
  })
  return { found: true, cells: patchSheet(zip, sheet, patches), rows: daily.length, header_row: header.row, error: null }
}

// Optional sections — each is skipped cleanly when the template has no such
// sheet, so an older template still generates rather than throwing.
function fillBuildings(zip, buildings) {
  const sheet = findSheet(zip, 'Buildings Progress', 'Buildings', 'Building Progress')
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['building', 'planned', 'installed', 'completion'], { scan: 20, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Buildings header not found' }
  const C = {
    code: colFor(header, 'building code', 'code', 'building'),
    name: colFor(header, 'building name', 'name'),
    planned: colFor(header, 'planned', 'total'),
    installed: colFor(header, 'installed'),
    remaining: colFor(header, 'remaining'),
    completion: colFor(header, 'completion %', 'completion', 'progress'),
  }
  const patches = {}
  buildings.forEach((b, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.code, b.code); put(C.name, b.name)
    put(C.planned, b.planned); put(C.installed, b.installed); put(C.remaining, b.remaining)
    put(C.completion, b.planned > 0 ? b.installed / b.planned : 0)
  })
  return { found: true, cells: patchSheet(zip, sheet, patches), rows: buildings.length, error: null }
}

function fillDocuments(zip, { documents, docStatuses, cocs }) {
  const sheet = findSheet(zip, 'Documents Summary', 'Documents', 'Docs Summary')
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['document', 'type', 'total', 'approved', 'submitted'], { scan: 20, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Documents header not found' }
  const C = {
    type: colFor(header, 'document type', 'type', 'document'),
    total: colFor(header, 'total'),
  }
  const statusCols = Object.fromEntries(docStatuses.map((s) => [s, colFor(header, s.replace(/_/g, ' '))]))
  const patches = {}
  documents.forEach((d, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.type, d.doc_type.replace(/_/g, ' '))
    put(C.total, d.total)
    docStatuses.forEach((s) => put(statusCols[s], d[s]))
  })
  // COC counts sit beside the table as a small label/value block
  const cocPatch = fillLabels(zip, sheet, [
    [['cocsissued', 'issued'], cocs.issued],
    [['cocspending', 'pending'], cocs.pending],
    [['cocstotal', 'totalcocs'], cocs.total],
  ])
  return { found: true, cells: patchSheet(zip, sheet, patches) + cocPatch.written, rows: documents.length, error: null }
}

function fillEvidence(zip, evidence) {
  const sheet = findSheet(zip, 'Site Evidence', 'Evidence', 'Photos')
  if (!sheet) return { found: false, cells: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['building', 'room', 'date', 'caption'], { scan: 20, minHits: 3 })
  if (!header) return { found: true, cells: 0, rows: 0, error: 'Site Evidence header not found' }
  const C = {
    no: colFor(header, 'no', '#'),
    building: colFor(header, 'building'),
    room: colFor(header, 'room', 'location'),
    date: colFor(header, 'date'),
    caption: colFor(header, 'caption', 'description'),
    annex: colFor(header, 'annex', 'photo', 'reference'),
  }
  const patches = {}
  evidence.forEach((e, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.no, e.no); put(C.building, e.building); put(C.room, e.room)
    put(C.date, excelSerial(e.date)); put(C.caption, e.caption)
    put(C.annex, `Annex photo ${e.no}`)
  })
  return { found: true, cells: patchSheet(zip, sheet, patches), rows: evidence.length, error: null }
}

// Patch an already-opened workbook. Split out from the download so the whole
// fill path is testable against a synthetic template with no network.
export function fillReportWorkbook(zip, data) {
  const codes = data.esms.map((e) => e.code)
  const dash = findSheet(zip, 'Dashboard', 'Summary', 'Cover')
  const dataSheet = findSheet(zip, 'Report Data', 'ReportData', 'Data')

  const head = fillLabels(zip, dash, [
    [['projectname', 'project'], data.meta.project_name || data.meta.project_code],
    [['projectcode', 'code'], data.meta.project_code],
    [['client', 'beneficiary', 'entity'], data.meta.client],
    [['referenceno', 'reference', 'refno'], data.meta.reference],
    [['contractor'], data.meta.contractor],
    [['esco', 'energyservicescompany'], data.meta.esco],
    [['periodfrom', 'from', 'startdate'], excelSerial(data.meta.period_from)],
    [['periodto', 'to', 'enddate'], excelSerial(data.meta.period_to)],
    [['reportingperiod', 'period'], `${data.meta.period_from} to ${data.meta.period_to}`],
    [['generatedon', 'generated', 'issuedate'], excelSerial(data.meta.generated_on)],
  ])

  const esmFill = fillEsmTable(zip, dataSheet, data.esms)
  const dailyFill = fillDailyLog(zip, dataSheet, { daily: data.daily, codes }, (esmFill.header_row || 0) + data.esms.length + 1)
  const buildingsFill = fillBuildings(zip, data.buildings)
  const docsFill = fillDocuments(zip, { documents: data.documents, docStatuses: data.doc_statuses, cocs: data.cocs })
  const evidenceFill = fillEvidence(zip, data.evidence)

  // charts must plot the cells we just wrote, not the values cached at design
  // time (see stripChartCaches), and the workbook must recalculate on open
  const charts = stripChartCaches(zip)
  setFullCalcOnLoad(zip)

  return {
    sheets: zip.sheets.map((s) => s.name),
    dashboard: { found: !!dash, cells: head.written, matched: head.matched },
    esm_table: esmFill,
    daily_log: dailyFill,
    buildings: buildingsFill,
    documents: docsFill,
    evidence: evidenceFill,
    charts_refreshed: charts,
    warnings: data.warnings,
  }
}

// Build the report. Returns { bytes, report } — `report` lists what each sheet
// received so a template mismatch is visible in the UI, never silent.
export async function buildProgressReport({ templatePath, data }) {
  const { data: dl, error } = await supabase.storage.from('report-templates').download(templatePath)
  if (error || !dl) throw new Error('Could not load the report template — ' + (error?.message || 'missing file'))
  const zip = openXlsx(await dl.arrayBuffer())
  const report = fillReportWorkbook(zip, data)
  return { bytes: saveXlsx(zip), report }
}
