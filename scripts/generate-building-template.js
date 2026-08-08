/**
 * Building-list import template — the thing an ESCO actually holds.
 *
 * TWO SHEETS, FOUR COLUMNS. That is the owner's correction and it is the spec:
 * TARSHID's handover gives the ESCO only the building name and its
 * coordinates. Floors, area, meter number, ownership, contractor, engineer —
 * all of that is SURVEY OUTPUT, gathered in the field weeks later. Asking for
 * it on the import sheet asks the ESCO for data it does not have yet, so the
 * columns are not here. Resist re-adding them.
 *
 * Built with ExcelJS, not openpyxl: openpyxl silently drops data validation,
 * and a template whose validation vanished still opens fine, which is how that
 * defect survives review. tests/buildingTemplate.test.mjs reopens the output
 * two independent ways — ExcelJS, and raw XML from the unzipped archive —
 * because a single parser that lost a feature would also fail to report it.
 *
 * Generated at build time into dist/, never committed. A committed binary
 * cannot be reviewed in a diff and drifts from the code that made it; the
 * Constraints #8 gate fails the build if one appears in the tree.
 */
import ExcelJS from 'exceljs'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const TEMPLATE_FILENAME = 'IES-Building-List-Template.xlsx'

// dashboard theme
const INK = 'FF1F2A37'        // dark header
const GOLD = 'FFA88B4A'       // accent
const CREAM = 'FFFDF8EE'      // example-row fill
const HAIR = 'FFE4E7EB'       // thin row borders
const WHITE = 'FFFFFFFF'

const LAST_DATA_ROW = 502     // header + example + 500 blank rows

const COLUMNS = [
  { header: 'Building Name', key: 'name', width: 42,
    guide: 'The building name exactly as TARSHID supplied it. Arabic is fine — do not translate it.' },
  { header: 'Latitude', key: 'lat', width: 20,
    guide: 'Decimal (24.7136) or DMS (24°42\'49"N). Either is accepted.' },
  { header: 'Longitude', key: 'lng', width: 20,
    guide: 'Decimal (46.6753) or DMS (46°40\'31"E). Either is accepted.' },
  { header: 'Notes', key: 'notes', width: 46,
    guide: 'Anything on the TARSHID list worth keeping. Stored on the building as-is.' },
]

const STEPS = [
  'Fill in one row per building on the "Buildings" sheet.',
  'Type the building name exactly as TARSHID supplied it — Arabic names are expected and should not be translated.',
  'Enter the coordinates in either decimal or DMS format. Both are accepted and both are converted for you.',
  'Put anything else from the TARSHID list in the Notes column.',
  'Delete the gold example row before you upload — it is only there to show the format.',
  'Save the file, then use "Import Excel" on the project\'s Buildings card.',
  'Read the import report: every row is either accepted or held with a reason. Nothing is imported silently.',
]

const NOTES = [
  ['Building codes are generated, never typed.',
   'Each building is given a code such as PROJECT-B0001 at the moment of import, in the order of the rows in this file. There is no code column and you should not add one.'],
  ['Everything else comes later, from the survey.',
   'Floors, area, electricity meter, ownership, contractor and the site engineer are recorded in the field during the survey, on the building\'s own page. They are deliberately not asked for here.'],
  ['Duplicate names are held, never merged.',
   'If a name repeats inside this file, or already exists on the project, that row is held and shown to you. Nothing is merged automatically and nothing is overwritten.'],
  ['Your original coordinate text is kept.',
   'Whatever you type is stored on the building exactly as written, alongside the converted decimal value.'],
]

export async function buildWorkbook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IES Dashboard'
  wb.created = new Date(Date.UTC(2020, 0, 1))     // fixed: deterministic bytes
  wb.modified = new Date(Date.UTC(2020, 0, 1))

  // ── Sheet 1: Instructions ────────────────────────────────────────────────
  const ins = wb.addWorksheet('Instructions', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  })
  ins.columns = [{ width: 4 }, { width: 30 }, { width: 82 }]

  const title = ins.getCell('B2')
  title.value = 'Building list — import template'
  title.font = { name: 'Calibri', size: 20, bold: true, color: { argb: WHITE } }
  ins.getRow(2).height = 40
  ;['B2', 'C2'].forEach((a) => {
    ins.getCell(a).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    ins.getCell(a).alignment = { vertical: 'middle' }
  })
  ins.getCell('C2').value = ''

  const sub = ins.getCell('B4')
  sub.value = 'TARSHID gives you the building name and its coordinates. That is all this file asks for.'
  sub.font = { name: 'Calibri', size: 11, italic: true, color: { argb: GOLD } }
  ins.mergeCells('B4:C4')

  let r = 6
  const sectionHeader = (text) => {
    const c = ins.getCell(`B${r}`)
    c.value = text
    c.font = { name: 'Calibri', size: 13, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    ins.getCell(`C${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    ins.getRow(r).height = 24
    r += 2
  }

  sectionHeader('How to use this file')
  STEPS.forEach((s, i) => {
    const n = ins.getCell(`B${r}`)
    n.value = `Step ${i + 1}`
    n.font = { name: 'Calibri', size: 11, bold: true, color: { argb: GOLD } }
    n.alignment = { vertical: 'top' }
    const t = ins.getCell(`C${r}`)
    t.value = s
    t.font = { name: 'Calibri', size: 11 }
    t.alignment = { wrapText: true, vertical: 'top' }
    ins.getRow(r).height = 20
    r += 1
  })
  r += 1

  sectionHeader('The four columns')
  COLUMNS.forEach((c) => {
    const n = ins.getCell(`B${r}`)
    n.value = c.header
    n.font = { name: 'Calibri', size: 11, bold: true }
    n.alignment = { vertical: 'top' }
    const t = ins.getCell(`C${r}`)
    t.value = c.guide
    t.font = { name: 'Calibri', size: 11 }
    t.alignment = { wrapText: true, vertical: 'top' }
    ins.getRow(r).height = 22
    r += 1
  })
  r += 1

  sectionHeader('Things worth knowing')
  NOTES.forEach(([head, body]) => {
    const n = ins.getCell(`B${r}`)
    n.value = head
    n.font = { name: 'Calibri', size: 11, bold: true, color: { argb: GOLD } }
    n.alignment = { wrapText: true, vertical: 'top' }
    const t = ins.getCell(`C${r}`)
    t.value = body
    t.font = { name: 'Calibri', size: 11 }
    t.alignment = { wrapText: true, vertical: 'top' }
    ins.getRow(r).height = 34
    r += 1
  })

  // ── Sheet 2: Buildings ───────────────────────────────────────────────────
  const bs = wb.addWorksheet('Buildings', {
    views: [{ state: 'frozen', ySplit: 1 }],       // freeze pane under the header
  })
  bs.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  const head = bs.getRow(1)
  head.height = 26
  head.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  })

  // the worked example — row 2, gold italic on cream, unmistakably replace-me
  const ex = bs.getRow(2)
  ex.values = {
    name: 'مبنى الإدارة الرئيسي',
    lat: '24.7136',
    lng: '46.6753',
    notes: 'EXAMPLE ROW — delete this row before uploading',
  }
  ex.height = 22
  ex.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: GOLD } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } }
  })

  // thin borders down the sheet so it reads as a form, not a blank grid
  const hair = { style: 'thin', color: { argb: HAIR } }
  for (let i = 2; i <= LAST_DATA_ROW; i += 1) {
    const row = bs.getRow(i)
    for (let c = 1; c <= COLUMNS.length; c += 1) {
      row.getCell(c).border = { top: hair, bottom: hair, left: hair, right: hair }
    }
  }

  // Coordinates are TEXT, not numbers. A decimal typed into a General cell is
  // fine, but "24°42'49\"N" in a numeric column becomes a value Excel mangles
  // on save — and the whole point is that both formats survive to the importer.
  bs.getColumn('lat').numFmt = '@'
  bs.getColumn('lng').numFmt = '@'

  // A real validation, so the file carries one for the proof to find, and so a
  // pasted column of numbers cannot silently truncate the name.
  for (let i = 2; i <= LAST_DATA_ROW; i += 1) {
    bs.getCell(`A${i}`).dataValidation = {
      type: 'textLength', operator: 'lessThanOrEqual', formulae: [200],
      allowBlank: true, showErrorMessage: true,
      errorTitle: 'Name too long',
      error: 'Building names are limited to 200 characters.',
    }
  }

  bs.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } }
  return wb
}

export async function writeTemplate(outDir) {
  const wb = await buildWorkbook()
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, TEMPLATE_FILENAME)
  await wb.xlsx.writeFile(out)
  return out
}

// CLI: node scripts/generate-building-template.js [outDir]
if (process.argv[1] && process.argv[1].endsWith('generate-building-template.js')) {
  const outDir = process.argv[2] || join(ROOT, 'dist', 'templates')
  writeTemplate(outDir).then((p) => console.log('wrote', p))
}
