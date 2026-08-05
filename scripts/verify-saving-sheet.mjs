#!/usr/bin/env node
// ===========================================================================
// THE CROSS-CHECK GATE — design §0.1(4), §0.2 layer 2, §6.1 T-XCHK / T-PIV
// ===========================================================================
// Recalculate a produced saving sheet from its own bytes, with TARSHID's own
// formulas, and compare the result cell-for-cell against what our engine said.
// A mismatch is a WALL, not a warning: §0.1(4).
//
// WHY THIS EXISTS, in the owner's terms and observed on a real file: an
// approved TARSHID lighting workbook was found shipping a Light_Savings summary
// that cached a previously computed project's figures, sitting above input
// sheets that were completely empty. TARSHID had stripped the data and saved
// without recalculating. A workbook can display numbers that do not belong to
// it, and it does so in exactly the sheet a reviewer opens first. Verification
// is therefore not a nicety about float drift; it is the only thing standing
// between that pathology and a delivered file.
//
// That workbook is no longer in the repository — it was a client-supplied
// document and was removed for confidentiality (Constraints #7, design §0.5).
// The pathology is generic, so T-PIV now demonstrates it on a synthetic
// workbook built inside tests/verifySheet.test.mjs: same shape, no client.
//
// ---------------------------------------------------------------------------
// TWO FINDINGS THAT SHAPE THIS SCRIPT. Both were measured, not assumed.
//
// 1. LIBREOFFICE IGNORES fullCalcOnLoad.
//    Design §0.2 layer 1 sets fullCalcOnLoad="1" at patch time and layer 2
//    recalculates headlessly. Converting a stale-cached workbook through
//    `soffice --headless --convert-to xlsx` returns the stale numbers
//    UNCHANGED, with or without the directive — and LibreOffice drops the
//    attribute from its own output. LibreOffice decides recalculation from its
//    profile setting Calc/Formula/Load/OOXMLRecalcMode, which defaults to "do
//    not recalculate". So this script writes a throwaway profile with
//    OOXMLRecalcMode=0 (always) and never relies on the directive to make the
//    recalculation happen.
//    The directive is still REQUIRED and still checked — Excel honours it, and
//    Excel is what the reviewer opens. It is an assertion about the file, not
//    the mechanism of this verification.
//
// 2. RECALCULATION IS OBSERVABLE. With the override, converting a workbook
//    whose summary formulas sum rows that do not exist drives every cached
//    total to 0 and any ratio among them to #DIV/0!. That is the stale cache
//    being evacuated, measured rather than hoped for — and it is exactly what
//    T-PIV asserts against the synthetic workbook.
// ---------------------------------------------------------------------------
//
// USAGE
//   node scripts/verify-saving-sheet.mjs --xlsx <file.xlsx> --snapshot <s.json>
//        [--out result.json] [--sql record.sql] [--keep]
//
// SNAPSHOT FORMAT — deliberately generic, so the verifier is not coupled to AC
// or lighting and a new sheet kind needs no code here:
//   {
//     "sheet_id":  "<saving_sheets.id>",          // optional, for --sql
//     "expect": [
//       { "sheet": "Light_Savings", "cell": "K5", "value": 1234, "label": "BOQ" },
//       ...
//     ]
//   }
//
// EXIT CODES: 0 match · 1 mismatch · 2 could not verify (no LibreOffice, bad
// input). "Could not verify" is never reported as a pass — the whole point of
// a wall is that it does not open when nobody is looking.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { openXlsx, readSheet, findSheet } from '../src/lib/xlsxPatch.js'

export const STATUS = { MATCH: 'match', MISMATCH: 'mismatch', UNAVAILABLE: 'unavailable' }

// ── the recalculation engine ───────────────────────────────────────────────
export function libreOffice() {
  for (const bin of ['soffice', 'libreoffice']) {
    try {
      const out = execFileSync(bin, ['--headless', '--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 })
      return { bin, version: String(out).trim().split('\n')[0] }
    } catch { /* try the next name */ }
  }
  return null
}

// LibreOffice will not recalculate an OOXML file on load unless it is told to,
// and it is told through the user profile, not through the file. Finding 1.
const RECALC_PROFILE = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
`

export function recalculate(xlsxPath, { workDir, bin = 'soffice', timeout = 300000 } = {}) {
  const dir = workDir || join(tmpdir(), `ies-verify-${process.pid}-${Date.now()}`)
  mkdirSync(join(dir, 'profile', 'user'), { recursive: true })
  mkdirSync(join(dir, 'out'), { recursive: true })
  writeFileSync(join(dir, 'profile', 'user', 'registrymodifications.xcu'), RECALC_PROFILE)
  execFileSync(bin, ['--headless', '--norestore', '--nolockcheck', '--nodefault',
    `-env:UserInstallation=file://${join(dir, 'profile')}`,
    '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', join(dir, 'out'), xlsxPath],
  { stdio: ['ignore', 'pipe', 'pipe'], timeout })
  const out = join(dir, 'out', basename(xlsxPath).replace(/\.xlsx$/i, '') + '.xlsx')
  if (!existsSync(out)) throw new Error(`LibreOffice produced no output for ${xlsxPath}`)
  return { path: out, dir }
}

// ── the pre-flight: what must be true of the FILE, before any arithmetic ───
// T-PIV lives here. A file whose numbers are inherited rather than recalculated
// must never verify, and the two ways that happens are a missing recalculation
// directive and a pivot cache that is never refreshed.
export function preflight(bytes) {
  const zip = openXlsx(bytes)
  const findings = []
  const wbXml = zip.files['xl/workbook.xml'] ? Buffer.from(zip.files['xl/workbook.xml']).toString('utf8') : ''
  const calcPr = (wbXml.match(/<calcPr\b[^>]*>/) || [null])[0]
  const fullCalc = !!calcPr && /fullCalcOnLoad="(1|true)"/.test(calcPr)
  if (!fullCalc) {
    findings.push({
      code: 'no-recalc-directive',
      detail: `workbook.xml calcPr is ${calcPr || '(absent)'} — without fullCalcOnLoad="1" Excel shows whatever values the file was saved with. An approved TARSHID template was found shipping exactly this way, displaying another project's numbers.`,
    })
  }
  // Both TARSHID templates contain ZERO pivotCacheDefinition parts (§0.2): the
  // Pivot* sheets are formula-driven. The rule is still enforced rather than
  // assumed away, because a future template revision may add one and it would
  // otherwise arrive unchecked.
  const caches = Object.keys(zip.files).filter((k) => /^xl\/pivotCache\/pivotCacheDefinition\d*\.xml$/.test(k))
  for (const k of caches) {
    const xml = Buffer.from(zip.files[k]).toString('utf8')
    if (!/refreshOnLoad="(1|true)"/.test(xml)) {
      findings.push({ code: 'pivot-cache-not-refreshed', detail: `${k} has no refreshOnLoad="1" — its totals would open stale` })
    }
  }
  return { fullCalcOnLoad: fullCalc, calcPr, pivotCaches: caches.length, findings }
}

// ── comparison ─────────────────────────────────────────────────────────────
const isErr = (v) => typeof v === 'string' && v.startsWith('#')

export function compare(recalcBytes, expectations, { tolerance = 1e-6 } = {}) {
  const zip = openXlsx(recalcBytes)
  const cache = new Map()
  const sheetCells = (name) => {
    if (!cache.has(name)) {
      const s = findSheet(zip, name)
      cache.set(name, s ? readSheet(zip, s).cells : null)
    }
    return cache.get(name)
  }
  const mismatches = []
  let checked = 0
  for (const e of expectations) {
    const cells = sheetCells(e.sheet)
    if (!cells) { mismatches.push({ ...e, actual: null, why: `sheet '${e.sheet}' is not in the recalculated file` }); continue }
    const got = cells.get(e.cell)
    const raw = got ? got.v : null
    checked++
    if (isErr(raw)) { mismatches.push({ ...e, actual: raw, why: `the workbook's own formula errored: ${raw}` }); continue }
    if (typeof e.value === 'number') {
      const actual = raw == null || raw === '' ? null : Number(raw)
      if (actual == null || !Number.isFinite(actual)) { mismatches.push({ ...e, actual: raw, why: 'the workbook produced no number here' }); continue }
      // relative where the number is large enough for relative to mean
      // anything, absolute otherwise — a 0 expectation has no relative scale
      const scale = Math.max(Math.abs(e.value), 1)
      if (Math.abs(actual - e.value) > tolerance * scale) {
        mismatches.push({ ...e, actual, why: `engine ${e.value}, workbook ${actual}, delta ${actual - e.value}` })
      }
    } else {
      const actual = raw == null ? '' : String(raw)
      if (actual !== String(e.value ?? '')) mismatches.push({ ...e, actual, why: `engine ${JSON.stringify(e.value)}, workbook ${JSON.stringify(actual)}` })
    }
  }
  return { checked, mismatches }
}

// ── the whole gate ─────────────────────────────────────────────────────────
export function verifySavingSheet({ xlsxPath, snapshot, workDir, tolerance = 1e-6, keep = false }) {
  const bytes = readFileSync(xlsxPath)
  const file_sha256 = createHash('sha256').update(bytes).digest('hex')
  const pre = preflight(bytes)

  const lo = libreOffice()
  if (!lo) {
    return {
      status: STATUS.UNAVAILABLE, file_sha256, preflight: pre, checked: 0,
      mismatches: [], reason: 'LibreOffice (soffice) is not on PATH — the file was NOT recalculated, so nothing is verified',
    }
  }

  let recalc
  try {
    recalc = recalculate(xlsxPath, { workDir, bin: lo.bin })
  } catch (err) {
    return { status: STATUS.UNAVAILABLE, file_sha256, preflight: pre, checked: 0, mismatches: [], reason: `recalculation failed: ${err.message}` }
  }

  let result
  try {
    result = compare(readFileSync(recalc.path), snapshot.expect || [], { tolerance })
  } finally {
    if (!keep && !workDir) rmSync(recalc.dir, { recursive: true, force: true })
  }

  // The pre-flight findings are mismatches in their own right. A file with the
  // right numbers and no recalculation directive is precisely the TARSHID
  // pathology: correct today, silently wrong the moment an input changes.
  const mismatches = [
    ...pre.findings.map((f) => ({ sheet: '(workbook)', cell: f.code, label: f.code, value: 'required', actual: 'absent', why: f.detail })),
    ...result.mismatches,
  ]
  return {
    status: mismatches.length ? STATUS.MISMATCH : STATUS.MATCH,
    file_sha256, libreoffice: lo.version, preflight: pre,
    checked: result.checked, mismatches,
    verified_at: new Date().toISOString(),
  }
}

// ── recording the result, per migration 0135's release gate ────────────────
// There is no service credential in this environment or in CI (established in
// U1 and unchanged), so this script CANNOT write to the database. It emits the
// exact statement instead, and applying it is a credentialed step. That is not
// a workaround dressed up: the gate lives in Postgres
// (saving_sheet_release_gate, 0135) and reads these columns, so whoever applies
// this SQL is the one opening or keeping shut the draft->approved door.
export function recordSql(result, sheetId) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  if (!sheetId) return '-- no sheet_id in the snapshot: nothing to record\n'
  return [
    '-- Written by scripts/verify-saving-sheet.mjs. Records the cross-check',
    '-- result for EXACTLY these bytes; 0135 refuses draft -> approved/shared',
    '-- unless verify_status is match AND verify_hash = file_sha256.',
    `update public.saving_sheets set`,
    `  file_sha256   = ${q(result.file_sha256)},`,
    `  verify_status = ${q(result.status)},`,
    `  verify_hash   = ${result.status === STATUS.MATCH ? q(result.file_sha256) : 'null'},`,
    `  verified_at   = ${result.status === STATUS.MATCH ? q(result.verified_at) : 'null'}`,
    `where id = ${q(sheetId)};`,
    '',
  ].join('\n')
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const arg = (name, def = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 ? (process.argv[i + 1] ?? true) : def
  }
  const xlsxPath = arg('xlsx')
  const snapPath = arg('snapshot')
  if (!xlsxPath || !snapPath) {
    console.error('usage: node scripts/verify-saving-sheet.mjs --xlsx <file.xlsx> --snapshot <snapshot.json> [--out result.json] [--sql record.sql] [--keep]')
    process.exit(2)
  }
  const snapshot = JSON.parse(readFileSync(snapPath, 'utf8'))
  const result = verifySavingSheet({
    xlsxPath, snapshot, keep: !!arg('keep', false),
    tolerance: Number(arg('tolerance', 1e-6)),
  })

  const out = arg('out')
  if (out) writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
  const sql = arg('sql')
  if (sql) writeFileSync(sql, recordSql(result, snapshot.sheet_id))

  console.log(`status        ${result.status}`)
  console.log(`file sha256   ${result.file_sha256}`)
  console.log(`libreoffice   ${result.libreoffice || '(none)'}`)
  console.log(`fullCalcOnLoad ${result.preflight.fullCalcOnLoad} · pivot caches ${result.preflight.pivotCaches} · cells checked ${result.checked}`)
  if (result.reason) console.log(`reason        ${result.reason}`)
  for (const m of result.mismatches) console.log(`  MISMATCH ${m.sheet}!${m.cell} ${m.label ? `(${m.label}) ` : ''}— ${m.why}`)
  process.exit(result.status === STATUS.MATCH ? 0 : result.status === STATUS.MISMATCH ? 1 : 2)
}
