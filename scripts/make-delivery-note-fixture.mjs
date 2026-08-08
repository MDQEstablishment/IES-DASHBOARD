// Generates the delivery-note fixture used by scripts/test-extract-delivery.mjs.
//
// It replaces seeds/fixtures/sample-delivery-note.pdf, which was NOT a sample.
// That file carried a named client engagement, a real supplier, a PO reference
// and an invoice number, all hex-encoded against subset fonts — so a
// literal-string scan of it returned zero characters and every sweep to date
// read it as synthetic because the filename said so.
//
// The fixture is now GENERATED rather than committed, which fixes both halves
// of that problem: there is no client content to leak, and there is no binary
// in the tree for a text scan to be blind to. The output is gitignored; the
// input is this file, which a reviewer can read in a diff.
//
// One honest caveat, since overclaiming here is the whole failure mode: pdf-lib
// writes text as HEX strings (<48656c6c6f> Tj), exactly like the file being
// replaced, so a literal-string scan returns zero from this file too. The
// difference that matters is the font — StandardFonts Helvetica is WinAnsi, not
// a subset, so the hex decodes straight to ASCII with no ToUnicode indirection.
// The reason this file is safe is not that it scans clean; it is that it never
// enters the tree and contains nothing real.
//
// Deterministic on purpose — same bytes every run — so a regenerated fixture
// never shows up as a spurious change. pdf-lib writes no creation timestamp
// when we set the metadata explicitly.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const FIXTURE_PATH = join(ROOT, 'seeds/fixtures/delivery-note.generated.pdf')

// Invented supplier and references. Deliberately not a real trading name:
// "Northwind" is the long-standing sample-data placeholder, and the numbers are
// obvious placeholders rather than plausible-looking real ones. The extraction
// function is being tested on SHAPE — header fields plus a line table — so the
// values only need to be well-formed, never real.
const HEADER = [
  ['Supplier:', 'Northwind Sample Supplies Ltd.'],
  ['PO Ref:', 'PO-0000-0000'],
  ['Invoice No:', 'INV-00000'],
  ['Delivery Date:', '2020-01-01'],
  ['Deliver To:', 'Sample Site A (Demo)'],
]
const COLS = ['Code', 'Description', 'Qty', 'Unit', 'Notes']
const LINES = [
  ['LED-40W', 'LED 40W Ceiling Panel', '120', 'pcs', ''],
  ['AC-S15', 'Split WM 1.5 TR', '8', 'units', ''],
  ['CTRL-OCC', 'Occupancy Sensor Ceiling Mount', '30', 'pcs', ''],
  ['LED-20W', 'LED 20W Down-light', '50', 'pcs', 'partial'],
]

const doc = await PDFDocument.create()
doc.setTitle('Delivery Note (generated fixture)')
doc.setProducer('make-delivery-note-fixture.mjs')
doc.setCreator('make-delivery-note-fixture.mjs')
// fixed dates keep the bytes stable across runs
doc.setCreationDate(new Date(Date.UTC(2020, 0, 1)))
doc.setModificationDate(new Date(Date.UTC(2020, 0, 1)))

const page = doc.addPage([595, 842])          // A4
const font = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)
const ink = rgb(0.1, 0.1, 0.1)
let y = 790

page.drawText('DELIVERY NOTE', { x: 40, y, size: 18, font: bold, color: ink })
y -= 34
for (const [label, value] of HEADER) {
  page.drawText(label, { x: 40, y, size: 10, font: bold, color: ink })
  page.drawText(value, { x: 150, y, size: 10, font, color: ink })
  y -= 16
}

y -= 14
const X = [40, 110, 360, 410, 470]
COLS.forEach((c, i) => page.drawText(c, { x: X[i], y, size: 10, font: bold, color: ink }))
y -= 6
page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.7, color: ink })
y -= 16
for (const row of LINES) {
  row.forEach((cell, i) => page.drawText(cell, { x: X[i], y, size: 10, font, color: ink }))
  y -= 15
}

y -= 24
page.drawText('Received in good condition. Materials inspected on delivery.', { x: 40, y, size: 9, font, color: ink })
y -= 26
page.drawText('Authorized signature: ______________________', { x: 40, y, size: 9, font, color: ink })

mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
writeFileSync(FIXTURE_PATH, await doc.save({ useObjectStreams: false }))
console.log('wrote', FIXTURE_PATH)
