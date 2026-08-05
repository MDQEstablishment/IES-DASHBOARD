// U4B — THE CROSS-CHECK GATE, EXERCISED. Design §0.1(4), §0.2, §6.1.
//
// T-XCHK requires the gate to be SEEN TO CLOSE, not just to open, so every
// "match" assertion here has a paired "mismatch" assertion driven through the
// same functions.
//
// WHAT CHANGED HERE (confidentiality remediation, Constraints #7)
// ---------------------------------------------------------------
// The approved TARSHID lighting workbook these tests were built on was a
// client-supplied document and has been removed from the repository (design
// §0.5). The two families of test in this file part company over it:
//
//   T-PIV IS SYNTHESISED, and is better for it. The pathology it exists to
//   catch — a workbook DISPLAYING cached values that do not belong to it — is
//   generic, not specific to any file. So the file is now built here: a
//   formula cell carrying a stale cached <v> above precedents that do not
//   exist. Verify it against its own displayed values and recalculation
//   refuses to reproduce them. Hermetic, fast, and it needs no artefact.
//
//   T-XCHK IS SKIPPED, not synthesised. Its entire value is comparing our
//   engine against TARSHID'S OWN formulas. Formulas we wrote ourselves would
//   make it self-comparison — the engine agreeing with the engine — which is
//   exactly the degradation design §0.2 layer 3 rejects when it refuses to
//   author into TARSHID's workbook. A test that looks like a cross-check and
//   is not one is worse than an honest skip, so the reason is written on each
//   skipped test and the gate returns with a clean template.
//
// These tests recalculate real workbooks with LibreOffice and take tens of
// seconds. They SKIP — loudly, never silently pass — where LibreOffice Calc is
// absent, which is why .github/workflows/verify-sheet.yml installs it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'
import { CONST_DEFAULTS } from '../src/lib/savingSheet.js'
import { openXlsx, saveXlsx, setFullCalcOnLoad } from '../src/lib/xlsxPatch.js'
import {
  verifySavingSheet, preflight, compare, recalculate, libreOffice, recordSql, STATUS,
} from '../scripts/verify-saving-sheet.mjs'
import {
  populateLightingWorkbook, lightingSnapshot, fixtureProject, needsTemplate, TEMPLATE_MISSING,
} from './harness/lightingWorkbook.mjs'

const LO = libreOffice()

// A skipped wall is not a wall. Locally, no LibreOffice means these tests skip
// with a reason; in the verification workflow IES_REQUIRE_RECALC=1 turns that
// skip into a hard failure, so the gate cannot quietly stop being enforced
// because a runner image dropped a package.
if (process.env.IES_REQUIRE_RECALC && !LO) {
  throw new Error('IES_REQUIRE_RECALC is set but LibreOffice Calc is not installed — the cross-check gate would have been skipped, which is indistinguishable from passing. Install libreoffice-calc.')
}
const needsLO = LO ? {} : { skip: 'LibreOffice Calc is not installed here — the file cannot be recalculated, so nothing would be verified. CI installs it (verify-sheet.yml).' }

const work = mkdtempSync(join(tmpdir(), 'ies-u4b-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))
const writeTmp = (name, bytes) => { const p = join(work, name); writeFileSync(p, bytes); return p }

// ── THE SYNTHETIC PATHOLOGY WORKBOOK ───────────────────────────────────────
// A minimal, valid .xlsx built here rather than read from anywhere. Its
// summary row carries formulas WITH cached <v> values; the rows those formulas
// sum (12..20) do not exist in the file at all. That is the whole pathology in
// four cells: what the sheet DISPLAYS and what its own formulas COMPUTE are
// different numbers, and only recalculation can tell you so.
//
// The stale values below are invented for this test and mean nothing.
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const STALE = { K5: 48210, L5: 3120000, N5: 1716000, O5: 0.55 }

function staleWorkbook({ withDirective = false } = {}) {
  const calcPr = `<calcPr calcId="191029"${withDirective ? ' fullCalcOnLoad="1"' : ''}/>`
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>`
      + '<sheet name="Summary" sheetId="1" r:id="rId1"/></sheets>' + calcPr + '</workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<worksheet xmlns="${NS}"><sheetData><row r="5">`
      + `<c r="K5"><f>SUM(K12:K20)</f><v>${STALE.K5}</v></c>`
      + `<c r="L5"><f>SUM(L12:L20)</f><v>${STALE.L5}</v></c>`
      + `<c r="N5"><f>SUM(N12:N20)</f><v>${STALE.N5}</v></c>`
      + `<c r="O5"><f>N5/L5</f><v>${STALE.O5}</v></c>`
      + '</row></sheetData></worksheet>'),
  }, { level: 6 }))
}

const asDisplayed = () => ({
  expect: [
    { sheet: 'Summary', cell: 'K5', value: STALE.K5, label: 'BOQ as displayed' },
    { sheet: 'Summary', cell: 'L5', value: STALE.L5, label: 'Baseline as displayed' },
    { sheet: 'Summary', cell: 'N5', value: STALE.N5, label: 'Savings as displayed' },
    { sheet: 'Summary', cell: 'O5', value: STALE.O5, label: 'Percentage as displayed' },
  ],
})

// ═══ T-PIV — A FILE WHOSE NUMBERS ARE INHERITED MUST NEVER VERIFY ══════════
test('T-PIV — a workbook without the recalculation directive is flagged, whoever authored it', () => {
  // The approved TARSHID lighting workbook shipped exactly like this: a
  // calcPr with no fullCalcOnLoad, so Excel opens showing whatever was cached.
  // The finding is a property of the FILE, not of who made it, so the check
  // survives the artefact's removal intact.
  const pre = preflight(staleWorkbook())
  assert.equal(pre.fullCalcOnLoad, false)
  assert.match(pre.calcPr, /<calcPr\b/)
  assert.ok(pre.findings.some((f) => f.code === 'no-recalc-directive'))
})

test('T-PIV — the patcher adds the directive, and stripping it is caught', () => {
  // setFullCalcOnLoad is §0.2 layer 1, the one sanctioned mutation outside
  // input cells. Exercised on the synthetic workbook so the assertion is about
  // the patcher, not about any stored file.
  const zip0 = openXlsx(staleWorkbook())
  setFullCalcOnLoad(zip0)
  const bytes = Buffer.from(saveXlsx(zip0))
  assert.equal(preflight(bytes).fullCalcOnLoad, true, 'the patcher must set fullCalcOnLoad')

  // Now strip it back out — the numbers in the file are untouched and correct.
  const zip = unzipSync(new Uint8Array(bytes))
  zip['xl/workbook.xml'] = strToU8(strFromU8(zip['xl/workbook.xml']).replace(/ fullCalcOnLoad="1"/, ''))
  const stripped = Buffer.from(zipSync(zip, { level: 6 }))
  const pre = preflight(stripped)
  assert.equal(pre.fullCalcOnLoad, false)
  assert.equal(pre.findings[0].code, 'no-recalc-directive')
  assert.match(pre.findings[0].detail, /shipping exactly this way/)
})

test('T-PIV — the pivot-cache rule bites, on any file that carries one', () => {
  // §0.2 established by inspection that neither TARSHID template contained a
  // pivotCacheDefinition — the Pivot* sheets are formula-driven. That reading
  // of the artefacts cannot be re-run now they are removed, so what is asserted
  // here is the RULE, which is what protects the next template either way: a
  // template revision that adds a cache must not sail through unchecked.
  const fake = {
    'xl/workbook.xml': strToU8('<workbook><sheets/><calcPr fullCalcOnLoad="1"/></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
    'xl/pivotCache/pivotCacheDefinition1.xml': strToU8('<pivotCacheDefinition recordCount="3"/>'),
  }
  const pre = preflight(Buffer.from(zipSync(fake, { level: 0 })))
  assert.equal(pre.pivotCaches, 1)
  assert.ok(pre.findings.some((f) => f.code === 'pivot-cache-not-refreshed'))
  fake['xl/pivotCache/pivotCacheDefinition1.xml'] = strToU8('<pivotCacheDefinition recordCount="3" refreshOnLoad="1"/>')
  assert.deepEqual(preflight(Buffer.from(zipSync(fake, { level: 0 }))).findings, [])
})

test('T-PIV — the pathology: a file whose numbers are INHERITED must never verify', { ...needsLO, timeout: 300000 }, () => {
  // The workbook displays a summary above input rows that do not exist. Verify
  // it against those very displayed numbers: recalculation must refuse to
  // reproduce them, because they do not belong to the file.
  const p = writeTmp('stale-cache.xlsx', staleWorkbook())
  const result = verifySavingSheet({ xlsxPath: p, snapshot: asDisplayed() })

  assert.equal(result.status, STATUS.MISMATCH)
  const byCell = Object.fromEntries(result.mismatches.map((m) => [m.cell, m]))
  // every displayed figure evaporates: the rows behind them do not exist
  assert.equal(byCell.K5.actual, 0)
  assert.equal(byCell.L5.actual, 0)
  assert.equal(byCell.N5.actual, 0)
  // and the ratio does not merely move, it stops being a number at all
  assert.equal(byCell.O5.actual, '#DIV/0!')
  assert.match(byCell.O5.why, /errored/)
  // the missing directive is itself reported, alongside the arithmetic
  assert.ok(result.mismatches.some((m) => m.cell === 'no-recalc-directive'))
})

test('T-PIV — the same file WITH the directive still fails: the directive is not the fix', { ...needsLO, timeout: 300000 }, () => {
  // Layer 1 makes Excel recalculate on open; it does not make the stale numbers
  // true. The finding disappears, the arithmetic mismatch does not.
  const p = writeTmp('stale-cache-directive.xlsx', staleWorkbook({ withDirective: true }))
  const result = verifySavingSheet({ xlsxPath: p, snapshot: asDisplayed() })
  assert.equal(result.preflight.fullCalcOnLoad, true)
  assert.ok(!result.mismatches.some((m) => m.cell === 'no-recalc-directive'))
  assert.equal(result.status, STATUS.MISMATCH)
  assert.equal(result.mismatches.find((m) => m.cell === 'K5').actual, 0)
})

// ═══ T-XCHK — THE GATE OPENS, THEN THE GATE CLOSES ═════════════════════════
const XCHK_NEEDS_ARTEFACT = 'SKIPPED, not synthesised. This test\'s entire value is comparing our engine against TARSHID\'S OWN formulas, and the approved TARSHID lighting workbook that carried them was a client-supplied document, removed for confidentiality (Constraints #7, design §0.5). Substituting formulas we wrote ourselves would turn an independent cross-check into the engine agreeing with the engine — the exact degradation design §0.2 layer 3 rejects. The gate itself is unchanged and still enforced in Postgres (0135); what is suspended is this exercise of it, and it returns the day a genuinely blank TARSHID template or an anonymised derivative is placed at templates/tarshid/. ' + TEMPLATE_MISSING
const needsArtefact = { ...needsTemplate(), ...(needsTemplate().skip ? { skip: XCHK_NEEDS_ARTEFACT } : {}) }

test('T-XCHK — a populated sheet verifies against TARSHID\'s own summary formulas', { ...needsArtefact, ...needsLO, timeout: 300000 }, () => {
  const project = fixtureProject(CONST_DEFAULTS)
  const { bytes, written, rows } = populateLightingWorkbook(project.rows)
  assert.ok(written > 100 && rows === 5, `wrote ${written} cells across ${rows} rows`)
  const p = writeTmp('populated.xlsx', bytes)
  const result = verifySavingSheet({ xlsxPath: p, snapshot: lightingSnapshot(project), tolerance: 1e-9 })

  assert.deepEqual(result.mismatches, [], 'the workbook disagreed with the engine')
  assert.equal(result.status, STATUS.MATCH)
  assert.ok(result.checked >= 25, `only ${result.checked} cells were checked`)
  assert.equal(result.preflight.fullCalcOnLoad, true)
  assert.match(result.file_sha256, /^[0-9a-f]{64}$/)
})

test('T-XCHK — THE GATE CLOSES: corrupt one engine constant and the same pipeline refuses', { ...needsArtefact, ...needsLO, timeout: 300000 }, () => {
  // The file is produced by the HONEST engine and is not touched again.
  const honest = fixtureProject(CONST_DEFAULTS)
  const p = writeTmp('populated-2.xlsx', populateLightingWorkbook(honest.rows).bytes)

  // One constant moves: lighting_derating 0.9 -> 0.8. Everything else is equal.
  const corrupt = fixtureProject({ ...CONST_DEFAULTS, lighting_derating: 0.8 })
  assert.notEqual(corrupt.summary.total.savings_kwh, honest.summary.total.savings_kwh)

  const result = verifySavingSheet({ xlsxPath: p, snapshot: lightingSnapshot(corrupt), tolerance: 1e-9 })
  assert.equal(result.status, STATUS.MISMATCH)
  // it names the cells, with both numbers, rather than saying "failed"
  const cells = result.mismatches.map((m) => m.cell)
  for (const c of ['N2', 'N3', 'N5', 'Z10']) assert.ok(cells.includes(c), `${c} should have disagreed`)
  const n5 = result.mismatches.find((m) => m.cell === 'N5')
  assert.match(n5.why, /engine .*, workbook .*, delta /)
  // …and the cells that do not depend on the corrupted constant still agree
  for (const c of ['K5', 'L5', 'Q10', 'I10']) assert.ok(!cells.includes(c), `${c} should not have moved`)
})

test('T-XCHK — one recalculation, two verdicts: the difference is the ENGINE, not the file', { ...needsArtefact, ...needsLO, timeout: 300000 }, () => {
  // Same recalculated bytes compared twice, so nothing about the workbook can
  // explain the two answers.
  const honest = fixtureProject(CONST_DEFAULTS)
  const p = writeTmp('populated-3.xlsx', populateLightingWorkbook(honest.rows).bytes)
  const { path: recalced, dir } = recalculate(p, { bin: LO.bin })
  try {
    const bytes = readFileSync(recalced)
    assert.deepEqual(compare(bytes, lightingSnapshot(honest).expect, { tolerance: 1e-9 }).mismatches, [])
    const bad = compare(bytes, lightingSnapshot(fixtureProject({ ...CONST_DEFAULTS, control_savings_fraction: 0.31 })).expect, { tolerance: 1e-9 })
    assert.ok(bad.mismatches.length > 0)
    assert.ok(bad.mismatches.some((m) => m.cell === 'AE10' || m.cell === 'N4'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ═══ THE VERIFIER'S OWN FAILURE MODES ══════════════════════════════════════
test('T-XCHK — "cannot verify" is never reported as a pass', () => {
  // Hermetic: any valid workbook exercises this, so it uses the synthetic one
  // and survives the artefact's removal.
  const r = verifySavingSheet({
    xlsxPath: writeTmp('unverifiable.xlsx', staleWorkbook({ withDirective: true })),
    snapshot: { expect: [] },
  })
  // With LibreOffice present this is a match; the assertion that matters is
  // that UNAVAILABLE is its own status and is not STATUS.MATCH.
  assert.notEqual(STATUS.UNAVAILABLE, STATUS.MATCH)
  assert.ok([STATUS.MATCH, STATUS.UNAVAILABLE].includes(r.status))
  if (r.status === STATUS.UNAVAILABLE) assert.match(r.reason, /NOT recalculated/)
})

test('T-XCHK — a missing sheet, an errored formula and a text cell are all mismatches', () => {
  const cells = {
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1">'
      + '<c r="A1"><v>5</v></c>'
      + '<c r="B1" t="e"><f>1/0</f><v>#DIV/0!</v></c>'
      + '<c r="C1" t="inlineStr"><is><t>hello</t></is></c>'
      + '</row></sheetData></worksheet>'),
  }
  const bytes = Buffer.from(zipSync(cells, { level: 0 }))
  const { mismatches } = compare(bytes, [
    { sheet: 'S', cell: 'A1', value: 5, label: 'ok' },
    { sheet: 'S', cell: 'B1', value: 1, label: 'errored' },
    { sheet: 'S', cell: 'C1', value: 'hello', label: 'text ok' },
    { sheet: 'S', cell: 'D1', value: 3, label: 'empty' },
    { sheet: 'Nope', cell: 'A1', value: 1, label: 'missing sheet' },
  ])
  const by = Object.fromEntries(mismatches.map((m) => [m.label, m]))
  assert.equal(Object.keys(by).length, 3)
  assert.match(by.errored.why, /#DIV\/0!/)
  assert.match(by.empty.why, /produced no number/)
  assert.match(by['missing sheet'].why, /not in the recalculated file/)
})

// ═══ RECORDING THE RESULT — migration 0135's release gate ══════════════════
test('T-XCHK — the recorded SQL opens the gate on a match and keeps it shut otherwise', () => {
  const sha = 'a'.repeat(64)
  const match = recordSql({ status: STATUS.MATCH, file_sha256: sha, verified_at: '2026-08-05T12:00:00.000Z' }, 'sheet-1')
  assert.match(match, /verify_status = 'match'/)
  assert.match(match, new RegExp(`verify_hash   = '${sha}'`))
  assert.match(match, /verified_at   = '2026-08-05T12:00:00.000Z'/)
  assert.match(match, /where id = 'sheet-1';/)

  // A mismatch records the FAILURE and leaves verify_hash null, which is what
  // 0135's saving_sheet_release_gate() reads when it refuses draft -> approved.
  const bad = recordSql({ status: STATUS.MISMATCH, file_sha256: sha, verified_at: '2026-08-05T12:00:00.000Z' }, 'sheet-1')
  assert.match(bad, /verify_status = 'mismatch'/)
  assert.match(bad, /verify_hash   = null/)
  assert.match(bad, /verified_at   = null/)

  assert.match(recordSql({ status: STATUS.MATCH, file_sha256: sha }, null), /nothing to record/)
  // the sheet id is quoted, not interpolated
  assert.match(recordSql({ status: STATUS.MATCH, file_sha256: sha, verified_at: 'x' }, "a'b"), /where id = 'a''b';/)
})
