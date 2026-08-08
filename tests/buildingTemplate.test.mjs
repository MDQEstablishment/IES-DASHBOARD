// THE TEMPLATE IS THE PRODUCT — so it is proven, not eyeballed.
//
// openpyxl silently drops data validation. A template whose validations
// vanished still opens perfectly, shows every column, and looks correct in a
// screenshot, which is exactly why that defect survives review. ExcelJS is used
// instead — but "we used the good library" is a claim, not evidence.
//
// So every structural assertion below is made TWICE, through two independent
// readers of the same bytes:
//
//   reader 1  ExcelJS, reopening the file it just wrote
//   reader 2  raw sheet XML, from the archive unzipped with fflate
//
// The reason is the lesson already paid for in Constraints #7: a verification
// tool can fail in precisely the way it exists to catch and report success
// while doing so. If ExcelJS ever silently stopped writing a validation, an
// ExcelJS-only test would keep passing. The XML reader has no such blind spot,
// and it cannot be fooled by the writer's in-memory model because it reads what
// actually landed on disk.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { unzipSync, strFromU8 } from 'fflate'
import { writeTemplate, TEMPLATE_FILENAME } from '../scripts/generate-building-template.js'

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ies-tpl-'))
const FILE = path.join(OUT, TEMPLATE_FILENAME)
await writeTemplate(OUT)

const bytes = fs.readFileSync(FILE)
const archive = unzipSync(new Uint8Array(bytes))
const partNames = Object.keys(archive)
const part = (match) => {
  const name = partNames.find((n) => n.includes(match))
  return name ? strFromU8(archive[name]) : ''
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(FILE)

test('T-BT1 — two sheets, named and ordered as the owner specified', () => {
  const names = wb.worksheets.map((w) => w.name)
  assert.deepEqual(names, ['Instructions', 'Buildings'],
    'the corrected spec is two sheets: Instructions then Buildings')
  // reader 2: the workbook part lists the same two, in the same order
  const wbXml = part('xl/workbook.xml')
  const xmlNames = [...wbXml.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(xmlNames, names, 'ExcelJS and the raw workbook part disagree on the sheets')
})

test('T-BT2 — FOUR columns, exactly, and no re-added survey columns', () => {
  const bs = wb.getWorksheet('Buildings')
  const headers = bs.getRow(1).values.slice(1).map(String)
  assert.deepEqual(headers, ['Building Name', 'Latitude', 'Longitude', 'Notes'])

  // The whole point of the owner's correction: survey output must NOT be asked
  // for at import time. Named individually so a future re-add fails loudly.
  const banned = ['floor', 'area', 'meter', 'ownership', 'owner', 'contractor',
    'engineer', 'residential', 'city', 'region', 'code']
  for (const word of banned) {
    assert.ok(!headers.some((h) => h.toLowerCase().includes(word)),
      `"${word}" is survey output and must not be a column on the import sheet`)
  }

  // Reader 2, done properly: pull row 1 out of the raw sheet XML and resolve
  // shared-string indices by hand. An earlier version of this test scanned
  // sharedStrings for the banned words, which was worthless — sharedStrings is
  // workbook-wide, so "code" legitimately appears there from the Instructions
  // sentence "codes are generated". That assertion could only ever have passed.
  const sst = [...part('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join(''))
  const sheetXml = part('xl/worksheets/sheet2.xml')
  const row1 = sheetXml.match(/<row r="1"[^>]*>(.*?)<\/row>/s)?.[1] ?? ''
  // attributes captured as one blob, then tested — an inline optional group let
  // the lazy prefix swallow t="s", so every header resolved to its raw index
  const xmlHeaders = [...row1.matchAll(/<c\b([^>]*)>\s*<v>(.*?)<\/v>\s*<\/c>/gs)]
    .map(([, attrs, v]) => (/\bt="s"/.test(attrs) ? sst[Number(v)] : v))
  assert.deepEqual(xmlHeaders, headers,
    'the raw sheet XML header row disagrees with what ExcelJS reported')
  assert.equal(xmlHeaders.length, 4, 'exactly four columns must reach the file')
})

test('T-BT3 — data validation SURVIVED the write (the openpyxl failure mode)', () => {
  const bs = wb.getWorksheet('Buildings')
  // reader 1
  const dv = bs.getCell('A2').dataValidation
  assert.ok(dv, 'ExcelJS sees no validation on A2')
  assert.equal(dv.type, 'textLength')

  // reader 2 — independent of ExcelJS entirely
  const sheetXml = part('xl/worksheets/sheet2.xml')
  assert.ok(sheetXml, 'could not find the Buildings sheet part in the archive')
  assert.ok(/<dataValidation[\s>]/.test(sheetXml),
    'NO <dataValidation> element in the sheet XML — the validation was dropped on write, ' +
    'which is precisely what openpyxl does silently and why this second reader exists')
})

test('T-BT4 — freeze pane under the header, and the worked example is row 2', () => {
  const bs = wb.getWorksheet('Buildings')
  assert.equal(bs.views[0]?.state, 'frozen')
  assert.equal(bs.views[0]?.ySplit, 1, 'the header row must stay visible while scrolling')

  const ex = bs.getRow(2)
  assert.match(String(ex.getCell(4).value), /EXAMPLE ROW/i,
    'row 2 must be an obviously-replaceable worked example')
  assert.equal(ex.getCell(1).font?.italic, true, 'the example row is italic')
  assert.equal(ex.getCell(1).font?.color?.argb, 'FFA88B4A', 'the example row is gold')
  assert.equal(ex.getCell(1).fill?.fgColor?.argb, 'FFFDF8EE', 'the example row is on cream')

  // reader 2: the pane element is really in the XML
  assert.ok(/<pane[^>]*ySplit="1"[^>]*state="frozen"/.test(part('xl/worksheets/sheet2.xml')),
    'no frozen pane in the raw sheet XML')
})

test('T-BT5 — the example name is Arabic, and coordinate columns are TEXT', () => {
  const bs = wb.getWorksheet('Buildings')
  const name = String(bs.getRow(2).getCell(1).value)
  assert.ok(/[؀-ۿ]/.test(name),
    'the example must show an Arabic name, because that is what TARSHID supplies')

  // '@' is the text format. A DMS string in a numeric column is mangled on save,
  // which would defeat the promise that either format survives to the importer.
  assert.equal(bs.getColumn(2).numFmt, '@', 'Latitude column must be text-formatted')
  assert.equal(bs.getColumn(3).numFmt, '@', 'Longitude column must be text-formatted')
})

test('T-BT6 — the header is the dashboard theme, dark ink on gold accent', () => {
  const bs = wb.getWorksheet('Buildings')
  const h = bs.getRow(1).getCell(1)
  assert.equal(h.fill?.fgColor?.argb, 'FF1F2A37', 'header fill must be the dashboard dark')
  assert.equal(h.font?.bold, true)
  assert.equal(h.font?.color?.argb, 'FFFFFFFF')
})

test('T-BT7 — Instructions states the two things a filler must not guess', () => {
  const ins = wb.getWorksheet('Instructions')
  let text = ''
  ins.eachRow((row) => row.eachCell((c) => { text += ' ' + String(c.value ?? '') }))
  const flat = text.replace(/\s+/g, ' ').toLowerCase()

  assert.ok(/codes are generated|generated, never typed/.test(flat),
    'Instructions must say building codes are generated at import, never typed')
  assert.ok(/survey/.test(flat) && /later/.test(flat),
    'Instructions must say the remaining data comes later, from the survey')
  assert.ok(/delete .*example/.test(flat), 'Instructions must say to delete the example row')
  // seven steps, per the spec
  assert.equal((flat.match(/step \d/g) || []).length, 7, 'the how-to is seven steps')
})

test('T-BT8 — deterministic: same inputs, identical bytes', async () => {
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'ies-tpl2-'))
  await writeTemplate(second)
  const a = fs.readFileSync(FILE)
  const b = fs.readFileSync(path.join(second, TEMPLATE_FILENAME))
  assert.ok(a.equals(b), 'two generations differ — a timestamp is leaking into the bytes')
})
