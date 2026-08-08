// Parsing the uploaded workbook — header-driven, never position-driven.
//
// The ESCO will reorder columns, rename them, translate them, and paste them
// out of another sheet. None of that is a mistake on their part, so none of it
// may be a failure on ours: a column is found by what its header SAYS, and a
// file whose columns are shuffled imports exactly the same as one that is not.
//
// This module only reads the file. It decides nothing about what a row means —
// duplicates, coordinates, codes and defaults are all settled by
// import_buildings() in the database, because a second opinion here would be a
// second implementation, and the two would drift.
import * as XLSX from 'xlsx'

// Header matching is done on a normalised form so that trailing spaces, case,
// a stray asterisk, non-breaking spaces pasted from a web page, and the
// superscript-two in "Area (m²)" cannot decide whether a column is found.
export const normHeader = (h) => String(h ?? '')
  .replace(/ /g, ' ')          // nbsp from pasted HTML
  .replace(/[*:]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

// Canonical field -> the headers we accept for it. Aliases are here rather than
// in the database because this list is about OUR file format; a client renaming
// a column is handled by adding an alias, which is a one-line change and a test.
export const HEADER_ALIASES = {
  name: ['building name', 'name', 'building', 'site name', 'facility name', 'اسم المبنى'],
  lat: ['latitude', 'lat', 'y', 'خط العرض'],
  lng: ['longitude', 'lng', 'long', 'lon', 'x', 'خط الطول'],
  notes: ['notes', 'note', 'remarks', 'comment', 'comments', 'ملاحظات'],
}

const REQUIRED = ['name']

/**
 * Map a header row to column indices.
 * Returns { map, unknown, missing } — `unknown` is reported to the user, never
 * treated as an error: a client who adds a column of their own should hear
 * about it, not be refused.
 */
export function mapHeaders(headerRow) {
  const map = {}
  const unknown = []
  headerRow.forEach((raw, i) => {
    const h = normHeader(raw)
    if (!h) return
    const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(h))
    if (field === undefined) { unknown.push(String(raw).trim()); return }
    if (map[field] === undefined) map[field] = i      // first wins on a duplicate header
  })
  const missing = REQUIRED.filter((f) => map[f] === undefined)
  return { map, unknown, missing }
}

const cell = (row, idx) => {
  if (idx === undefined) return ''
  const v = row[idx]
  if (v === null || v === undefined) return ''
  // Dates and numbers arrive typed; the RPC wants text exactly as the user saw
  // it, so a coordinate that Excel stored as a number still round-trips.
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

const isExampleRow = (r) =>
  /example row/i.test(`${r.notes ?? ''}`) || /^example\b/i.test(`${r.name ?? ''}`)

/**
 * Parse an .xlsx ArrayBuffer into rows ready for import_buildings().
 * Throws only when the file cannot be used at all — a missing REQUIRED header,
 * or no readable sheet. Everything else is reported, not thrown.
 */
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  // Prefer the sheet our own template names; fall back to the first sheet, so a
  // file someone rebuilt by hand still works.
  const sheetName = wb.SheetNames.find((n) => normHeader(n) === 'buildings') || wb.SheetNames[0]
  if (!sheetName) throw new Error('That file has no readable sheet.')

  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })
  if (!grid.length) throw new Error('That sheet is empty — there is no header row to read.')

  const { map, unknown, missing } = mapHeaders(grid[0])
  if (missing.length) {
    throw new Error(
      `The file is missing a required column: ${missing.join(', ')}. ` +
      'Nothing was imported. Download the template if you are unsure of the headers.',
    )
  }

  const rows = []
  const skippedExample = []
  for (let i = 1; i < grid.length; i += 1) {
    const raw = grid[i]
    const r = {
      name: cell(raw, map.name),
      lat: cell(raw, map.lat),
      lng: cell(raw, map.lng),
      notes: cell(raw, map.notes),
    }
    // a wholly blank line in the middle of a sheet is spacing, not a building
    if (!r.name && !r.lat && !r.lng && !r.notes) continue
    // the template's own gold example, if they forgot to delete it
    if (isExampleRow(r)) { skippedExample.push(i + 1); continue }
    rows.push({ ...r, _sheetRow: i + 1 })
  }
  return { sheetName, rows, unknown, skippedExample }
}
