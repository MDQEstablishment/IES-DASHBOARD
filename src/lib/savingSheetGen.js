// 9D-3 — fill the uploaded TARSHID workbook. Sheet and header positions are
// DISCOVERED at runtime (tolerant to minor shifts); only true input cells are
// written. Formula cells, the genuine reference sheets (Old_Model_Registry,
// Aprvd Baseline Unit, Data_Check, Pivot…) and every style are untouched.
// 'Aprvd Project Unit' is NOT a reference sheet — it is this project's own
// shortlist, so we write B/C/D/M/N there (never E or F:L, which are formulas).
import { supabase } from './supabase'
import { openXlsx, saveXlsx, findSheet, readSheet, findHeaderRow, colFor, patchSheet, setFullCalcOnLoad } from './xlsxPatch'
import { resolveSelectionDescriptions } from './savingSheet'

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
// Excel serial time (fraction of a day) for 'HH:MM'
const timeSerial = (t) => {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t))
  if (!m) return null
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) / 1440
}

// Project_Info is a label/value sheet: match column-A labels, write column B.
function fillProjectInfo(zip, project, buildingCount) {
  const sheet = findSheet(zip, 'Project_Info', 'Project Info', 'ProjectInfo')
  if (!sheet) return { sheet: null, written: 0 }
  const data = readSheet(zip, sheet)
  // label matcher -> value (first match wins, checked in order)
  const MAP = [
    [['esconame', 'esco'], project.energy_services_company || 'IES'],
    [['entitynamear', 'entityarabic', 'arabicname', 'entityar'], project.entity_name_ar],
    [['entitynameen', 'entityname', 'entity', 'beneficiary', 'client'], project.beneficiary_entity || project.client],
    [['acronym', 'shortname'], project.code],
    [['region', 'city'], project.region],
    [['entitypocname', 'entitycontactname'], project.entity_poc_name],
    [['entitypocposition', 'entitycontactposition'], project.entity_poc_position],
    [['entitypocmobile', 'entitycontactmobile', 'entitypocphone'], project.entity_poc_mobile],
    [['entitypocemail', 'entitycontactemail'], project.entity_poc_email],
    [['tarshidpocname', 'tarshidcontactname'], project.tarshid_poc_name],
    [['tarshidpocposition', 'tarshidcontactposition'], project.tarshid_poc_position],
    [['tarshidpocmobile', 'tarshidcontactmobile', 'tarshidpocphone'], project.tarshid_poc_mobile],
    [['tarshidpocemail', 'tarshidcontactemail'], project.tarshid_poc_email],
    [['numberofbuildings', 'buildingcount', 'nobuildings', 'buildings'], buildingCount],
    [['latitude', 'lat'], project.location_lat != null ? Number(project.location_lat) : null],
    [['longitude', 'long', 'lng'], project.location_lng != null ? Number(project.location_lng) : null],
    [['projectname', 'project'], project.name],
  ]
  const patches = {}
  data.cells.forEach((cell, ref) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!m || m[1] !== 'A' || cell.v == null) return
    const label = norm(cell.v)
    if (!label) return
    for (const [keys, value] of MAP) {
      if (value == null || value === '') continue
      if (keys.some((k) => label === k || label.includes(k))) { patches[`B${m[2]}`] = value; break }
    }
  })
  return { sheet, written: patchSheet(zip, sheet, patches) }
}

// OH sheet: one row per operating_hours record. Only inputs are written —
// ref-string / hrs-year cells that carry formulas are skipped by patchSheet.
function fillOperatingHours(zip, { ohRows, project, buildings }) {
  const sheet = findSheet(zip, 'OH', 'Operating Hours', 'Operating_Hours', 'OH Sheet')
  if (!sheet) return { sheet: null, written: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['space type', 'start', 'end', 'building', 'days', 'weeks'], { scan: 12, minHits: 3 })
  if (!header) return { sheet, written: 0, rows: 0, error: 'OH header row not found' }
  const C = {
    region: colFor(header, 'region'),
    entity: colFor(header, 'entity', 'beneficiary'),
    zone: colFor(header, 'zone', 'building no', 'bldg no', 'building number'),
    coords: colFor(header, 'coordinate', 'coordinates', 'gps', 'lat'),
    building: colFor(header, 'building name', 'building'),
    space: colFor(header, 'space type', 'space'),
    start: colFor(header, 'start time', 'start'),
    end: colFor(header, 'end time', 'end'),
    days: colFor(header, 'days per week', 'days/week', 'working days', 'days'),
    weeks: colFor(header, 'weeks per year', 'weeks/year', 'weeks'),
    eflh: colFor(header, 'eflh'),
  }
  const bById = new Map(buildings.map((b) => [b.id, b]))
  const patches = {}
  ohRows.forEach((o, i) => {
    const r = header.row + 1 + i
    const b = bById.get(o.building_id)
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.region, project.region)
    put(C.entity, project.beneficiary_entity || project.client)
    put(C.zone, b?.code)
    put(C.coords, b?.location_lat != null && b?.location_lng != null ? `${b.location_lat}, ${b.location_lng}` : (b?.gps || null))
    put(C.building, b?.name || o.building_name)
    put(C.space, o.space_type)
    put(C.start, timeSerial(o.start_time))
    put(C.end, timeSerial(o.end_time))
    put(C.days, o.days_per_week)
    put(C.weeks, o.weeks_per_year)
    put(C.eflh, o.eflh != null ? Number(o.eflh) : null)
  })
  return { sheet, written: patchSheet(zip, sheet, patches), rows: ohRows.length, cols: C, headerRow: header.row }
}

// AC_Savings: one row per computed AC survey row. Formula columns (m2/ton,
// baseline lookups, savings, %, capacity check, payback, type match) are left
// for Excel — patchSheet refuses to overwrite any cell containing <f>.
function fillAcSavings(zip, { rows, project }) {
  const sheet = findSheet(zip, 'AC_Savings', 'AC Savings', 'ACSavings', 'AC_Saving')
  if (!sheet) return { sheet: null, written: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['building', 'description', 'space type', 'quantity', 'make', 'model'], { scan: 8, minHits: 3 })
  if (!header) return { sheet, written: 0, rows: 0, error: 'AC_Savings header row not found' }
  const C = {
    building: colFor(header, 'building name', 'building'),
    description: colFor(header, 'surveyed unit description', 'description'),
    zone: colFor(header, 'zone'),
    space: colFor(header, 'space type', 'space'),
    ref: colFor(header, 'operating hours reference', 'operating reference', 'oh reference', 'reference'),
    start: colFor(header, 'start time', 'start'),
    end: colFor(header, 'end time', 'end'),
    floor: colFor(header, 'floor'),
    area: colFor(header, 'area m2', 'area', 'room area'),
    qty: colFor(header, 'quantity', 'qty', 'total quantity'),
    equip: colFor(header, 'equipment type', 'equipment'),
    make: colFor(header, 'make', 'brand'),
    size: colFor(header, 'size category', 'size'),
    model: colFor(header, 'model no', 'model'),
    newDesc: colFor(header, 'new unit description', 'new unit', 'proposed unit', 'replacement'),
    eflh: colFor(header, 'eflh'),
  }
  const patches = {}
  rows.forEach((row, i) => {
    const r = header.row + 1 + i
    const put = (col, v) => { if (col && v != null && v !== '') patches[`${col}${r}`] = v }
    put(C.building, row.building_name || row.building_code)
    put(C.description, row.description)
    put(C.zone, row.building_code)
    put(C.space, row.space_type)
    put(C.ref, row.oh_ref)
    put(C.start, timeSerial(row.start_time))
    put(C.end, timeSerial(row.end_time))
    put(C.floor, row.floor)
    put(C.area, row.room_area != null ? Number(row.room_area) : null)
    put(C.qty, row.qty)
    put(C.equip, row.equipment_type)
    put(C.make, row.make)
    put(C.size, row.size_category)
    put(C.model, row.model)
    put(C.newDesc, row.new_description)
    put(C.eflh, row.eflh != null ? Number(row.eflh) : null)
  })
  return { sheet, written: patchSheet(zip, sheet, patches), rows: rows.length, cols: C, headerRow: header.row }
}

// 'Aprvd Project Unit' — the PROJECT'S OWN submittal shortlist and the target
// of the payback VLOOKUP ($B$2:$N$21). Only the manual-input columns are
// written: B description, C unit cost, D labor cost, M SASO ref, N datasheet
// ref. E (=C+D) and F:L (array formulas resolving type/make/model/BTU/TR/
// SEER/C&H from B) are the workbook's own and patchSheet refuses them anyway.
// The uploaded template arrives with rows 2-21 BLANK — never assume otherwise.
function fillProjectUnits(zip, selection) {
  const sheet = findSheet(zip, 'Aprvd Project Unit', 'Aprovd Project Unit', 'Approved Project Unit', 'AprvdProjectUnit')
  if (!sheet) return { sheet: null, written: 0, rows: 0 }
  const data = readSheet(zip, sheet)
  const header = findHeaderRow(data, ['description', 'unit cost', 'labor cost', 'total cost'], { scan: 6, minHits: 2 })
  // The sheet's layout is fixed by the VLOOKUP range: header row 1, data 2..21.
  const headerRow = header?.row ?? 1
  const C = {
    desc: colFor(header, 'description') || 'B',
    unit: colFor(header, 'unit cost') || 'C',
    labor: colFor(header, 'labor cost', 'labour cost') || 'D',
    saso: colFor(header, 'reference saso certificate', 'saso') || 'M',
    ds: colFor(header, 'reference datasheet', 'datasheet') || 'N',
  }
  const patches = {}
  const ordered = [...selection].sort((a, b) => (a.row_no || 0) - (b.row_no || 0))
  ordered.forEach((s) => {
    if (!s.description || !s.row_no || s.row_no < 1 || s.row_no > 20) return
    const r = headerRow + s.row_no                       // row_no 1 -> sheet row 2
    patches[`${C.desc}${r}`] = s.description
    if (s.unit_cost != null) patches[`${C.unit}${r}`] = Number(s.unit_cost)
    if (s.labor_cost != null) patches[`${C.labor}${r}`] = Number(s.labor_cost)
    if (s.saso_ref) patches[`${C.saso}${r}`] = s.saso_ref
    if (s.datasheet_ref) patches[`${C.ds}${r}`] = s.datasheet_ref
  })
  return { sheet, written: patchSheet(zip, sheet, patches), rows: ordered.filter((s) => s.description).length, cols: C, headerRow }
}

// Build the filled workbook. Returns { bytes, report } — report lists which
// sheets were found and how many cells each received (surfaced in the UI so a
// template mismatch is visible, never silent).
// `selection` = project_unit_selection rows; AC_Savings column W is written
// with the SAME description strings so the payback VLOOKUP and the AH
// type-match resolve. A mismatch throws rather than shipping a broken sheet.
export async function buildSavingSheet({ templatePath, project, buildings, ohRows, rows, selection = [] }) {
  const { data: dl, error } = await supabase.storage.from('saving-sheet-templates').download(templatePath)
  if (error || !dl) throw new Error('Could not load the template — ' + (error?.message || 'missing file'))
  const zip = openXlsx(await dl.arrayBuffer())

  // W must equal a description present in the selection, or the VLOOKUP fails
  const { resolved: acRows, missing } = resolveSelectionDescriptions(rows, selection)
  if (missing.length) {
    throw new Error(`These proposed units are not in the project unit selection, so the payback VLOOKUP would fail: ${missing.slice(0, 5).join(' · ')}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ''}`)
  }

  const info = fillProjectInfo(zip, project, buildings.length)
  const oh = fillOperatingHours(zip, { ohRows, project, buildings })
  const units = fillProjectUnits(zip, selection)
  const ac = fillAcSavings(zip, { rows: acRows, project })
  setFullCalcOnLoad(zip)

  const report = {
    sheets: zip.sheets.map((s) => s.name),
    project_info: { found: !!info.sheet, cells: info.written },
    oh: { found: !!oh.sheet, cells: oh.written, rows: oh.rows, header_row: oh.headerRow, error: oh.error || null },
    project_units: { found: !!units.sheet, cells: units.written, rows: units.rows, header_row: units.headerRow },
    ac_savings: { found: !!ac.sheet, cells: ac.written, rows: ac.rows, header_row: ac.headerRow, error: ac.error || null },
  }
  return { bytes: saveXlsx(zip), report }
}
