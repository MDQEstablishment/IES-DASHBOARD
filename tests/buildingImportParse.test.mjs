// The importer must survive the file an ESCO actually sends back.
//
// Nobody returns the template untouched. They reorder columns, rename headers,
// paste from another sheet (bringing non-breaking spaces with them), leave the
// example row in, and add a column of their own. None of that is their mistake,
// so none of it may be our failure — and every one of those cases is below.
//
// These are parser tests only. What a row MEANS — duplicate, coordinate, code,
// default — is decided by import_buildings() in the database and was proven
// there directly; asserting it again here would be a second implementation of
// the rules, which is the very thing this sprint removed.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseWorkbook, mapHeaders, normHeader } from '../src/lib/buildingImport.js'

/** Build an .xlsx in memory from a grid, so no fixture binary is ever committed. */
const book = (grid, sheetName = 'Buildings') => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), sheetName)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return out
}

const HEAD = ['Building Name', 'Latitude', 'Longitude', 'Notes']

test('T-BI1 — the plain case: our own template, filled', () => {
  const { rows } = parseWorkbook(book([
    HEAD,
    ['مبنى الإدارة', '24.7136', '46.6753', 'from list'],
    ['Warehouse B', '24.70', '46.60', ''],
  ]))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'مبنى الإدارة', 'the Arabic name must survive parsing unchanged')
  assert.equal(rows[0].lat, '24.7136')
  assert.equal(rows[1].notes, '')
})

test('T-BI2 — HEADERS REORDERED: the same file, columns shuffled, imports identically', () => {
  const straight = parseWorkbook(book([
    HEAD,
    ['Clinic', '24.1', '46.2', 'n1'],
  ])).rows
  const shuffled = parseWorkbook(book([
    ['Notes', 'Longitude', 'Building Name', 'Latitude'],
    ['n1', '46.2', 'Clinic', '24.1'],
  ])).rows
  assert.deepEqual(shuffled, straight,
    'column order must not change the result — the parser is header-driven, not position-driven')
})

test('T-BI3 — renamed and translated headers still map, via aliases', () => {
  const { rows } = parseWorkbook(book([
    ['Site Name', 'Lat', 'Long', 'Remarks'],
    ['Clinic', '24.1', '46.2', 'n1'],
  ]))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Clinic')
  assert.equal(rows[0].lng, '46.2')

  const ar = parseWorkbook(book([
    ['اسم المبنى', 'خط العرض', 'خط الطول', 'ملاحظات'],
    ['عيادة', '24.1', '46.2', ''],
  ])).rows
  assert.equal(ar[0].name, 'عيادة')
  assert.equal(ar[0].lat, '24.1')
})

test('T-BI4 — encoding round-trips cannot break header matching', () => {
  // nbsp from a pasted web table, a stray asterisk, odd case and padding
  assert.equal(normHeader('  BUILDING NAME * '), 'building name')
  const { rows, missing } = { ...parseWorkbook(book([
    [' Building Name *', ' LATITUDE ', 'Longitude:', 'NOTES'],
    ['Clinic', '24.1', '46.2', 'x'],
  ])) }
  assert.equal(missing, undefined)
  assert.equal(rows[0].name, 'Clinic')
  assert.equal(rows[0].lat, '24.1')
})

test('T-BI5 — an unknown column is REPORTED, never a reason to refuse the file', () => {
  const { rows, unknown } = parseWorkbook(book([
    [...HEAD, 'Floors'],
    ['Clinic', '24.1', '46.2', 'x', '3'],
  ]))
  assert.equal(rows.length, 1, 'the row still imports')
  assert.deepEqual(unknown, ['Floors'],
    'the client added a column — they must hear about it, not be turned away')
})

test('T-BI6 — a missing REQUIRED header rejects the file before anything is written', () => {
  assert.throws(
    () => parseWorkbook(book([['Latitude', 'Longitude'], ['24.1', '46.2']])),
    /missing a required column: name/i,
    'without a name column there is nothing to import, and it must fail loudly and early',
  )
})

test('T-BI7 — the template example row is skipped, not imported as a building', () => {
  const { rows, skippedExample } = parseWorkbook(book([
    HEAD,
    ['مبنى الإدارة الرئيسي', '24.7136', '46.6753', 'EXAMPLE ROW — delete this row before uploading'],
    ['Real Building', '24.1', '46.2', ''],
  ]))
  assert.deepEqual(rows.map((r) => r.name), ['Real Building'])
  assert.deepEqual(skippedExample, [2], 'and the user is told it was skipped, by row number')
})

test('T-BI8 — blank spacing rows are ignored, and sheet row numbers stay true', () => {
  const { rows } = parseWorkbook(book([
    HEAD,
    ['A', '1', '2', ''],
    ['', '', '', ''],
    ['B', '3', '4', ''],
  ]))
  assert.deepEqual(rows.map((r) => r.name), ['A', 'B'])
  // row 4 in the sheet, not row 3 in our filtered array — a held row must be
  // findable in the file the person is looking at
  assert.equal(rows[1]._sheetRow, 4)
})

test('T-BI9 — an empty file yields no rows and no exception', () => {
  const { rows } = parseWorkbook(book([HEAD]))
  assert.deepEqual(rows, [], 'headers with nothing under them is a real thing users do')
})

test('T-BI10 — 500 buildings parse, in order, with coordinates kept as TEXT', () => {
  const grid = [HEAD]
  for (let i = 1; i <= 500; i += 1) grid.push([`Building ${i}`, '24.7136', `46°40'31"E`, ''])
  const { rows } = parseWorkbook(book(grid))
  assert.equal(rows.length, 500)
  assert.equal(rows[0].name, 'Building 1')
  assert.equal(rows[499].name, 'Building 500')
  assert.equal(rows[0].lng, `46°40'31"E`,
    'DMS must reach the server as typed — normalisation happens in one place, and it is not here')
})

test('T-BI11 — a sheet named anything still parses, and Buildings wins when present', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['junk']]), 'Cover')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD, ['Clinic', '1', '2', '']]), 'Buildings')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const { sheetName, rows } = parseWorkbook(buf)
  assert.equal(sheetName, 'Buildings', 'our own sheet is preferred over the first one')
  assert.equal(rows[0].name, 'Clinic')
})

test('T-BI12 — mapHeaders reports exactly what it found and did not find', () => {
  const { map, unknown, missing } = mapHeaders(['Notes', 'Mystery', 'Building Name'])
  assert.equal(map.name, 2)
  assert.equal(map.notes, 0)
  assert.deepEqual(unknown, ['Mystery'])
  assert.deepEqual(missing, [])
})
