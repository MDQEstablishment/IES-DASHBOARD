#!/usr/bin/env node
// Saving Sheet sprint, U1 — import TARSHID's three embedded reference sheets
// into their database mirrors.
//
//   node scripts/import-tarshid-registries.mjs            # regenerate the seed
//   node scripts/import-tarshid-registries.mjs --report   # inspect, write nothing
//
// ###########################################################################
// NOT CURRENTLY RE-RUNNABLE — ITS SOURCE ARTEFACTS HAVE BEEN REMOVED.
// ###########################################################################
// The two `templates/tarshid/*.xlsx` workbooks this script reads were
// client-supplied documents and have been deleted from the repository for
// confidentiality (Constraints #7, design §0.5). Running this script today
// fails at the missing-file check, by design — it is kept, not deleted,
// because it is the readable record of exactly how the registries were
// derived, and because it is the thing to re-point at a genuinely blank
// TARSHID template when one arrives.
//
// THE ARTEFACT OF RECORD IS ITS OUTPUT: supabase/migrations/0134_registry_seed.sql,
// already applied and verified to contain no client-identifying data — it holds
// TARSHID's equipment registries (manufacturer, model, capacity, efficiency),
// which are TARSHID's catalogue, not any client's operational data.
//
// THE BYTE-STABLE-REGENERATION CLAIM BELOW IS NO LONGER VERIFIABLE and must not
// be relied on until a clean template exists: with the inputs gone there is
// nothing to re-run against, so "same artefacts in, byte-identical file out"
// is an unchecked assertion about a past run rather than a property anyone can
// currently confirm. Likewise the sha256 assertions and the populated-row
// counts below describe the removed artefacts and cannot fire.
//
// WHAT THIS IS, AND WHY IT IS NOT A DATABASE CLIENT
// -------------------------------------------------
// Per design §0.4 TARSHID's EMBEDDED reference sheets are authoritative and our
// tables are a mirror imported from them, so the import source was the artefact
// itself: templates/tarshid/*.xlsx, the former files of record (§0.5).
//
// This environment holds no service credential — .env.production carries only
// the publishable key, which is RLS-bound to `authenticated` and cannot write
// pmo/admin tables, and no SUPABASE_* secret is present in the environment. So
// the script does not talk to Postgres at all: it EMITS
// supabase/migrations/0134_registry_seed.sql, which is committed and applied
// through the normal migration path. That also makes the import reviewable as
// a diff, which a live upsert would not be.
//
// The output was deterministic: same artefacts in, byte-identical file out —
// see the re-runnability notice above; that property is UNVERIFIABLE until a
// clean template exists. Once one does, running it again after any template
// swap makes the diff the registry drift that §0.4 says must block generation
// until re-import.
//
// FIDELITY RULES (these are the whole point — read before changing anything)
// -------------------------------------------------------------------------
//  1. VERBATIM. Cached <v> values are written through unchanged: no trimming,
//     no whitespace collapsing, no rounding. Design §9 names "normalising the
//     workbook during import" as one of the two things that would break the
//     fixtures' authority, and the artefact proves the point: four AC rows
//     carry stray spaces inside model_no ("B2424C ", "S242NH ", "S242NC  N52",
//     " HBPUDC24") and collapsing them would MERGE three real registry rows
//     into others — 1,516 rows would silently become 1,513. The shipped
//     client-side importer (src/lib/tarshidImport.js normModel/r2/r0) does
//     normalise and round; that divergence is deliberate here and is flagged
//     in the emitted migration for U3's unified-normaliser work.
//  2. NUMERIC COLUMNS TAKE NUMBERS. Where a numeric target column holds a
//     non-numeric cached value the cell becomes NULL and is counted and
//     reported — never coerced, never guessed. The AC registry does this on
//     109 rows: Equivalent SEER reads the literal text "Inverter" on 11 (no
//     SEER applies to an inverter unit) and "-" on 98 (TARSHID never
//     established one). Neither loses information: compressor_type carries
//     the first, and "-" was never a number to begin with.
//  3. POPULATED ROWS, NOT ROW ELEMENTS. Counting <row> elements gives
//     2,504/300/500 and is wrong (§0.5): TARSHID's saves leave ~1,000 empty
//     styling rows behind. Rows are counted by their KEY columns being
//     populated, and the counts are ASSERTED — a mismatch aborts with the
//     delta and writes nothing.
//
// The artefacts are opened read-only and their sha256 is asserted unchanged at
// exit.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AC_XLSX = path.join(ROOT, 'templates/tarshid/TARSHID-TEMPLATE-AC-SavingSheet.xlsx')
const LIGHT_XLSX = path.join(ROOT, 'templates/tarshid/TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx')
const OUT_SQL = path.join(ROOT, 'supabase/migrations/0134_registry_seed.sql')
const REPORT_ONLY = process.argv.includes('--report')

const EXPECT = { old_model_registry: 1516, approved_baseline_units: 194, lighting_baseline_registry: 344 }

const die = (msg) => { console.error('\nABORT: ' + msg + '\n'); process.exit(1) }
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

// ---------------------------------------------------------------------------
// Minimal OOXML reader. Same idiom as src/lib/xlsxPatch.js (fflate, regex over
// the sheet XML, sharedStrings resolved) — deliberately NOT importing that
// module: it is under the frozen src/lib manifest and this sprint's commit A
// touches no src/ file.
// ---------------------------------------------------------------------------
const unesc = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function openXlsx(file) {
  const files = unzipSync(new Uint8Array(readFileSync(file)))
  const wbXml = strFromU8(files['xl/workbook.xml'])
  const relsXml = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const rels = {}
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '').replace(/^\//, '')
  }
  const sheets = []
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1]
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1]
    if (name && rid && rels[rid]) sheets.push({ name: unesc(name), path: 'xl/' + rels[rid] })
  }
  const sst = []
  if (files['xl/sharedStrings.xml']) {
    const s = strFromU8(files['xl/sharedStrings.xml'])
    for (const si of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sst.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(''))
    }
  }
  return { file, files, sheets, sst }
}

// Rows as Map<rowNumber, {COL: value}>. Formula cells yield their CACHED value
// (t="str" for text results) — which is exactly what §0.4 asks for, since the
// lighting registry's key column is formula-built on 343 of its 344 rows.
function readRows(zip, sheetName) {
  const sh = zip.sheets.find((s) => s.name === sheetName)
  if (!sh) die(`sheet "${sheetName}" not found in ${path.basename(zip.file)} (has: ${zip.sheets.map((s) => s.name).join(', ')})`)
  const xml = strFromU8(zip.files[sh.path])
  const out = new Map()
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1], body = m[2] || ''
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)
    if (!ref) continue
    const t = /t="([^"]+)"/.exec(attrs)?.[1]
    const vm = /<v>([\s\S]*?)<\/v>/.exec(body)
    let v = null
    if (t === 'inlineStr') v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join('')
    else if (t === 's' && vm) v = zip.sst[parseInt(vm[1], 10)] ?? ''
    else if (vm) v = unesc(vm[1])            // covers t="str" (cached formula text) and plain numbers
    const rn = parseInt(ref[2], 10)
    if (!out.has(rn)) out.set(rn, {})
    out.get(rn)[ref[1]] = v
  }
  return out
}

const normHeader = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Resolve column letters from a header row by normalised label. Every mapping
// must resolve or the script aborts — a template whose headers moved is a
// stop-and-ask, not a best-effort import.
function resolveCols(rowCells, spec, where) {
  const byLabel = new Map()
  for (const [col, val] of Object.entries(rowCells || {})) {
    const k = normHeader(val)
    if (k && !byLabel.has(k)) byLabel.set(k, col)
  }
  const cols = {}
  const missing = []
  for (const [field, labels] of Object.entries(spec)) {
    const hit = labels.map(normHeader).find((l) => byLabel.has(l))
    if (!hit) missing.push(`${field} (wanted one of: ${labels.join(' | ')})`)
    else cols[field] = byLabel.get(hit)
  }
  if (missing.length) die(`${where}: header row does not carry ${missing.length} expected column(s):\n  - ` + missing.join('\n  - '))
  return cols
}

const isBlank = (v) => v == null || String(v).trim() === ''

// ---------------------------------------------------------------------------
// Sheet -> table specs. Header labels are TARSHID's, matched tolerantly.
// ---------------------------------------------------------------------------
const NUMERIC = new Set([
  'sr_no', 'tr', 't1_btu', 't1_w', 't1_eer', 't3_btu', 't3_w', 't3_eer',
  'equivalent_seer', 'lamps_per_fixture', 'wattage_w', 'lumens_lm',
])

const SPECS = [
  {
    table: 'old_model_registry',
    source: 'AC template / Old_Model_Registry',
    xlsx: () => AC_XLSX, sheet: 'Old_Model_Registry', headerRow: 2,
    key: ['equipment_type', 'model_no'],
    conflict: '(equipment_type, model_no)',
    headers: {
      equipment_type: ['Equipment_Type', 'Equipment Type'],
      make: ['Make'],
      model_no: ['Model No (ID/ OD)', 'Model No'],
      compressor_type: ['Compressor Type'],
      size_category: ['Size Category'],
      tr: ['TR'],
      t1_btu: ['T1 (Btu/h)'], t1_w: ['T1 (W)'], t1_eer: ['T1 EER (Btu/h /W)'],
      t3_btu: ['T3 (Btu/h)'], t3_w: ['T3 (W)'], t3_eer: ['T3 EER (Btu/h /W)'],
      equivalent_seer: ['Equivalent SEER'],
      surveyed_unit_description: ['Surveyed Unit Description'],
      equivalent_ac_model_description: ['Equivalent AC Model Description'],
    },
  },
  {
    table: 'approved_baseline_units',
    source: 'AC template / Aprvd Baseline Unit',
    xlsx: () => AC_XLSX, sheet: 'Aprvd Baseline Unit', headerRow: 1,
    key: ['equipment_type', 'model_no'],
    conflict: '(equipment_type, model_no)',
    headers: {
      description: ['Description'],
      equipment_type: ['Equipment Type', 'Equipment_Type'],
      make: ['Make'],
      model_no: ['Model No (ID/ OD)', 'Model No'],
      t1_btu: ['T1 BTU'], t1_w: ['T1 W'], t1_eer: ['T1 EER'],
      t3_btu: ['T3 BTU'], t3_w: ['T3 W'], t3_eer: ['T3 EER'],
      equivalent_seer: ['Equivalent SEER'],
      nameplate_ref: ['Reference Nameplate Photo'],
      datasheet_ref: ['Reference Datasheet'],
    },
  },
  {
    table: 'lighting_baseline_registry',
    source: 'Lighting template / Old_Model_Registry',
    xlsx: () => LIGHT_XLSX, sheet: 'Old_Model_Registry', headerRow: 1,
    key: ['surveyed_unit_description'],
    conflict: '(surveyed_unit_description)',
    headers: {
      sr_no: ['Sr. No.'],
      surveyed_unit_description: ['Surveyed Unit Description'],
      lamp_type: ['Lamp Type'],
      conv_led: ['Conv./LED'],
      location_type: ['Location Type (Interior/Exterior)'],
      shape_size_base: ['Shape/Size/Base'],
      length_width_diameter: ['Length/Width/Diameter'],
      // numeric "Lamp/Fix", NOT the text "Lamp/Fixture" NX token — see 0133.
      lamps_per_fixture: ['Lamp/Fix'],
      wattage_w: ['Wattage (W)'],
      lumens_lm: ['Lumens (lm)'],
    },
  },
]

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/

function extract(spec) {
  const zip = openXlsx(spec.xlsx())
  const rows = readRows(zip, spec.sheet)
  const cols = resolveCols(rows.get(spec.headerRow), spec.headers, `${spec.source}`)
  const fields = Object.keys(spec.headers)

  const max = Math.max(...rows.keys())
  const records = []
  const nonNumeric = []      // numeric target column holding text
  const arabic = []
  let firstRow = null, lastRow = null

  for (let r = spec.headerRow + 1; r <= max; r++) {
    const cells = rows.get(r)
    if (!cells) continue
    // POPULATED = every key column carries something. Row elements are not rows.
    if (spec.key.some((k) => isBlank(cells[cols[k]]))) continue
    if (firstRow == null) firstRow = r
    lastRow = r
    const rec = { __row: r }
    for (const f of fields) {
      const raw = cells[cols[f]]
      if (isBlank(raw)) { rec[f] = null; continue }
      const s = String(raw)
      if (ARABIC.test(s)) arabic.push([r, f, s])
      if (NUMERIC.has(f)) {
        if (Number.isFinite(Number(s))) rec[f] = { num: s }       // verbatim numeric text
        else { rec[f] = null; nonNumeric.push([r, f, s]) }
      } else rec[f] = s                                           // verbatim text
    }
    records.push(rec)
  }
  return { spec, records, nonNumeric, arabic, firstRow, lastRow, rowElements: rows.size }
}

// ---------------------------------------------------------------------------
// Key handling: assert the populated count, then collapse EXACT duplicates.
// A duplicate key whose other columns differ is a genuine conflict and aborts.
// ---------------------------------------------------------------------------
function dedupe(ex) {
  const { spec, records } = ex
  const keyOf = (r) => spec.key.map((k) => String(r[k])).join(String.fromCharCode(31))
  const seen = new Map()
  const kept = [], collapsed = []
  for (const r of records) {
    const k = keyOf(r)
    const prior = seen.get(k)
    if (!prior) { seen.set(k, r); kept.push(r); continue }
    const cmp = (x) => JSON.stringify(Object.fromEntries(
      Object.entries(x).filter(([f]) => f !== '__row' && f !== 'sr_no')))
    if (cmp(prior) !== cmp(r)) {
      die(`${spec.source}: rows ${prior.__row} and ${r.__row} share the key `
        + `${spec.key.join('+')} = ${spec.key.map((k2) => JSON.stringify(r[k2])).join(', ')} `
        + `but DIFFER in their other columns. That is real data loss, not a duplicate; `
        + `nothing was written.\n  first : ${cmp(prior)}\n  second: ${cmp(r)}`)
    }
    collapsed.push([prior.__row, r.__row, spec.key.map((k2) => r[k2]).join(' / ')])
  }
  return { kept, collapsed }
}

// ---------------------------------------------------------------------------
// SQL emission — deterministic, no timestamps, no generated ids.
// ---------------------------------------------------------------------------
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`
const lit = (v) => v == null ? 'null' : (typeof v === 'object' && v.num !== undefined ? v.num : q(v))

// Rows are emitted in numbered CHUNKS. The chunk markers are not decoration:
// this environment applies the file through the Supabase MCP one statement at a
// time, and the markers make "which statements have been applied" a fact you
// can read off the file rather than a count you have to keep in your head.
const CHUNK_ROWS = 200
let chunkNo = 0
function insertBlock(spec, rows, fields, totalChunks) {
  const cols = fields.join(', ')
  const setList = fields.filter((f) => !spec.key.includes(f))
  const out = []
  for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
    const slice = rows.slice(i, i + CHUNK_ROWS)
    chunkNo++
    out.push(`-- >>> CHUNK ${chunkNo}/${totalChunks} — ${spec.table} rows ${i + 1}-${i + slice.length} of ${rows.length}`)
    out.push(`insert into public.${spec.table} as t (${cols}) values`)
    out.push(slice.map((r) => '(' + fields.map((f) => lit(r[f])).join(',') + ')').join(',\n'))
    out.push(`on conflict ${spec.conflict} do update set`)
    out.push(setList.map((f) => `  ${f} = excluded.${f}`).join(',\n'))
    // The WHERE makes re-application a true no-op: without it every rerun would
    // fire tarshid_ref_touch and bump updated_at on every row.
    out.push(`where (${setList.map((f) => 't.' + f).join(', ')})`)
    out.push(`   is distinct from (${setList.map((f) => 'excluded.' + f).join(', ')});`)
    out.push('')
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Content digest. The point: prove that what is IN the database is what is in
// the artefact — every row, every column, not just the ten spot rows. The same
// digest is computed here from the parsed sheet and, in SQL, from the table;
// if they agree, the transfer was exact whatever route it took to get there.
// Order-independent by construction (row digests are sorted, not the rows).
// ---------------------------------------------------------------------------
const US = String.fromCharCode(31)          // the same separator chr(31) uses in SQL
const rowDigest = (r, fields) => createHash('md5')
  .update(fields.map((f) => {
    const v = r[f]
    if (v == null) return '\\N'
    return typeof v === 'object' && v.num !== undefined ? v.num : String(v)
  }).join(US)).digest('hex')

function tableDigest(rows, fields) {
  const ds = rows.map((r) => rowDigest(r, fields)).sort()
  return createHash('md5').update(ds.join('')).digest('hex')
}

function digestSql(spec, fields) {
  const cols = fields.map((f) => `coalesce(${f}::text,'\\N')`).join(', ')
  return [
    `  select md5(string_agg(rd, '' order by rd collate "C")) into s from (`,
    `    select md5(concat_ws(chr(31), ${cols})) rd from public.${spec.table}) x;`,
  ].join('\n')
}

function spotBlock(spec, rows, fields) {
  // 10 evenly spread rows, deterministic, asserted IN THE DATABASE against the
  // artefact's cached values so the proof travels with the migration.
  const n = Math.min(10, rows.length)
  const picks = []
  for (let i = 0; i < n; i++) picks.push(rows[Math.floor(i * (rows.length - 1) / (n - 1))])
  const out = []
  for (const r of picks) {
    const where = spec.key.map((k) => `${k} = ${q(r[k])}`).join(' and ')
    const checks = fields.filter((f) => !spec.key.includes(f))
      .map((f) => `${f} is not distinct from ${lit(r[f])}`)
    out.push(`  select count(*) into n from public.${spec.table} where ${where}`)
    out.push(`    and ${checks.join('\n    and ')};`)
    out.push(`  if n <> 1 then raise exception 'FAIL spot-check ${spec.table} sheet row ${r.__row}: row absent or a column differs from the artefact'; end if;`)
  }
  out.push(`  raise notice 'PASS: ${n} spot rows of ${spec.table} match the artefact cell for cell';`)
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
// EXPECTED TO FIRE TODAY. The source artefacts were removed for confidentiality
// (Constraints #7, design §0.5), so this script is not re-runnable until a
// genuinely blank TARSHID template replaces them. Its output of record,
// supabase/migrations/0134_registry_seed.sql, is already applied.
for (const f of [AC_XLSX, LIGHT_XLSX]) {
  if (!existsSync(f)) {
    die(`missing artefact ${f}\n`
      + '  This is the expected state. The client-supplied source workbooks were\n'
      + '  removed for confidentiality (Constraints #7, design §0.5), so this\n'
      + '  import cannot be re-run and its byte-stable-regeneration property\n'
      + '  cannot be re-verified until a clean TARSHID template arrives.\n'
      + '  The artefact of record is supabase/migrations/0134_registry_seed.sql,\n'
      + '  already applied and verified clean of client data.')
  }
}
const hashBefore = { ac: sha256(AC_XLSX), light: sha256(LIGHT_XLSX) }

console.log('TARSHID registry import — source artefacts')
console.log('  ' + path.relative(ROOT, AC_XLSX) + '  sha256 ' + hashBefore.ac)
console.log('  ' + path.relative(ROOT, LIGHT_XLSX) + '  sha256 ' + hashBefore.light)
console.log('')

const results = []
for (const spec of SPECS) {
  const ex = extract(spec)
  const want = EXPECT[spec.table]
  console.log(`${spec.source} -> ${spec.table}`)
  console.log(`  <row> elements in the sheet : ${ex.rowElements}   <- NOT the row count`)
  console.log(`  populated rows (key columns): ${ex.records.length}  (sheet rows ${ex.firstRow}-${ex.lastRow})`)
  if (ex.records.length !== want) {
    die(`${spec.source}: expected ${want} populated rows, found ${ex.records.length} `
      + `(delta ${ex.records.length - want > 0 ? '+' : ''}${ex.records.length - want}). `
      + `Nothing was written — no partial import.`)
  }
  console.log(`  count matches the expected ${want}`)
  const { kept, collapsed } = dedupe(ex)
  if (collapsed.length) {
    console.log(`  !! ${collapsed.length} EXACT DUPLICATE key(s) in TARSHID's own sheet — collapsed (first wins):`)
    for (const [a, b, k] of collapsed) console.log(`       sheet rows ${a} and ${b}: ${k}`)
    console.log(`     rows landing in the database: ${kept.length}`)
  }
  if (ex.nonNumeric.length) {
    const byField = {}
    for (const [, f, v] of ex.nonNumeric) (byField[f] ||= new Set()).add(v)
    console.log(`  ${ex.nonNumeric.length} non-numeric value(s) in numeric column(s) -> NULL: `
      + Object.entries(byField).map(([f, s]) => `${f} (${[...s].join(', ')})`).join('; '))
  }
  console.log(`  Arabic characters in the imported values: ${ex.arabic.length}`)
  console.log('')
  results.push({ spec, ex, kept, collapsed })
}

// the wart, asserted at extraction time so a silent "clean-up" upstream is caught
const wart = results.find((r) => r.spec.table === 'lighting_baseline_registry')
  .kept.find((r) => r.__row === 315)
if (!wart || wart.surveyed_unit_description !== 'Conv-Candle-E14-1x-10W') {
  die(`the recorded lighting wart is gone: sheet row 315 should read `
    + `"Conv-Candle-E14-1x-10W" (lower-case 1x), found ${JSON.stringify(wart?.surveyed_unit_description)}`)
}
console.log(`wart intact: lighting sheet row 315 = ${JSON.stringify(wart.surveyed_unit_description)} (lower-case "1x", imported as-is)`)
console.log('')

if (REPORT_ONLY) {
  console.log('--report: no file written')
} else {
  const totalCollapsed = results.reduce((a, r) => a + r.collapsed.length, 0)
  const L = []
  L.push('-- GENERATED FILE — do not hand-edit.')
  L.push('--   node scripts/import-tarshid-registries.mjs')
  L.push('-- regenerates it byte for byte from the committed artefacts. Edit the')
  L.push('-- script, or the artefacts, never this file.')
  L.push('--')
  L.push('-- Saving Sheet sprint, U1 (commit A of two) — the TARSHID registry mirrors.')
  L.push('--')
  L.push('-- Source of truth: the reference sheets EMBEDDED in TARSHID\'s own blank')
  L.push('-- templates, which is what their formulas look up (design §0.4). Values are')
  L.push('-- the sheets\' cached <v> contents, VERBATIM: no trimming, no rounding, no')
  L.push('-- whitespace collapsing. Verbatim is not fussiness — collapsing whitespace')
  L.push('-- in model_no would merge three distinct AC rows and turn 1,516 into 1,513.')
  L.push('--')
  for (const { spec, ex, kept, collapsed } of results) {
    L.push(`--   ${spec.source}`)
    L.push(`--     -> public.${spec.table}: ${ex.records.length} populated rows`
      + (collapsed.length ? `, ${collapsed.length} exact duplicate key(s) collapsed, ${kept.length} rows` : ''))
  }
  L.push('--')
  if (totalCollapsed) {
    L.push('-- DUPLICATE KEYS IN TARSHID\'S OWN DATA (named, not swept):')
    for (const { spec, collapsed } of results) {
      for (const [a, b, k] of collapsed) {
        L.push(`--   ${spec.table}: sheet rows ${a} and ${b} are byte-identical apart from`)
        L.push(`--     their serial number — "${k}". The later one is dropped.`)
      }
    }
    L.push('--   The script ABORTS instead if two rows share a key and DIFFER anywhere')
    L.push('--   else, so a real conflict can never be collapsed away quietly.')
    L.push('--')
  }
  const acRes = results.find((r) => r.spec.table === 'old_model_registry')
  const inv = acRes.ex.nonNumeric
  const nullSeer = acRes.kept.filter((r) => r.equivalent_seer == null).length
  if (inv.length) {
    const tally = {}
    for (const [, , v] of inv) tally[v] = (tally[v] || 0) + 1
    L.push(`-- TEXT IN A NUMERIC COLUMN: ${inv.length} of the AC rows carry non-numeric text in`)
    L.push('--   Equivalent SEER — ' + Object.entries(tally).map(([v, c]) => `"${v}" on ${c}`).join(', ') + '. "Inverter" is')
    L.push('--   TARSHID\'s marker that no SEER applies to an inverter unit (out of')
    L.push('--   replacement scope anyway, §1.1); "-" is a SEER they never established.')
    L.push('--   Both import as NULL rather than being coerced to a number. Nothing is')
    L.push('--   lost: compressor_type still names every inverter unit.')
    L.push(`--   equivalent_seer is NULL on ${nullSeer} rows in total — those ${inv.length} plus`)
    L.push(`--   ${nullSeer - inv.length} whose cell is simply empty in the sheet.`)
    L.push('--')
  }
  L.push('-- KNOWN DIVERGENCE FROM src/lib/tarshidImport.js, deliberate: that module')
  L.push('--   collapses whitespace in model_no and rounds SEER/EER to 2dp and BTU/W to')
  L.push('--   integers. This import does neither. §1.2 already schedules a single')
  L.push('--   unified normaliser for U3; until it lands, re-importing these sheets')
  L.push('--   through the client-side TarshidImportModal would add near-duplicate rows')
  L.push('--   rather than update these. Do not do that.')
  L.push('--')
  L.push('-- Re-applying this file is a no-op: every upsert carries an IS DISTINCT FROM')
  L.push('-- guard, so an unchanged row is not even touched and updated_at does not move.')
  L.push('--')
  L.push('-- THE CONTENT DIGEST at the bottom is the strong proof and the reason the')
  L.push('-- ten spot rows are not the whole story. It hashes EVERY cell of EVERY row —')
  L.push('-- md5 per row, row digests sorted, md5 of the concatenation — and compares')
  L.push('-- it to the digest computed by the script directly from the .xlsx. The two')
  L.push('-- agree only if the database holds exactly the artefact, whatever route the')
  L.push('-- bytes took to get there. This matters here because this environment can')
  L.push('-- only reach Postgres through an MCP call, so the statements below are')
  L.push('-- applied a chunk at a time rather than by a migration runner; the digest is')
  L.push('-- what makes that route trustworthy instead of merely careful.')
  L.push('')
  L.push(`-- artefact sha256:`)
  L.push(`--   templates/tarshid/TARSHID-TEMPLATE-AC-SavingSheet.xlsx        ${hashBefore.ac}`)
  L.push(`--   templates/tarshid/TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx  ${hashBefore.light}`)
  L.push('')

  const totalChunks = results.reduce((a, r) => a + Math.ceil(r.kept.length / CHUNK_ROWS), 0)
  for (const { spec, kept } of results) {
    const fields = Object.keys(spec.headers)
    L.push('-- ' + '-'.repeat(74))
    L.push(`-- ${spec.table} — ${kept.length} rows from ${spec.source}`)
    L.push('-- ' + '-'.repeat(74))
    L.push(insertBlock(spec, kept, fields, totalChunks))
  }

  L.push('-- ' + '-'.repeat(74))
  L.push('-- Proof (0128/0131 idiom). Counts, uniqueness, ten spot rows per table')
  L.push('-- asserted cell-for-cell against the artefact, and the recorded wart.')
  L.push('-- ' + '-'.repeat(74))
  L.push('do $$')
  L.push('declare n int; s text;')
  L.push('begin')
  for (const { spec, kept } of results) {
    L.push(`  select count(*) into n from public.${spec.table};`)
    L.push(`  if n <> ${kept.length} then raise exception 'FAIL: ${spec.table} has % rows, expected ${kept.length}', n; end if;`)
  }
  L.push('')
  for (const { spec, kept } of results) {
    L.push(`  select count(*) into n from (select ${spec.key.join(', ')} from public.${spec.table}`)
    L.push(`                               group by ${spec.key.join(', ')} having count(*) > 1) d;`)
    L.push(`  if n <> 0 then raise exception 'FAIL: ${spec.table} has % duplicate key(s)', n; end if;`)
  }
  L.push(`  raise notice 'PASS: row counts are ${results.map((r) => r.spec.table + '=' + r.kept.length).join(', ')} and every natural key is unique';`)
  L.push('')
  for (const { spec, kept } of results) {
    const fields = Object.keys(spec.headers)
    L.push(spotBlock(spec, kept, fields))
    L.push('')
  }
  L.push("  select surveyed_unit_description into s from public.lighting_baseline_registry")
  L.push("   where surveyed_unit_description like 'Conv-Candle-E14-1%-10W';")
  L.push("  if s <> 'Conv-Candle-E14-1x-10W' then")
  L.push("    raise exception 'FAIL: the lighting row-315 wart was normalised — expected the lower-case \"1x\", found %', s;")
  L.push('  end if;')
  L.push("  raise notice 'PASS: the row-315 wart survived import verbatim — %', s;")
  L.push('')
  L.push('  select count(*) into n from public.old_model_registry where equivalent_seer is null;')
  L.push(`  if n <> ${nullSeer} then raise exception 'FAIL: expected ${nullSeer} null equivalent_seer, found %', n; end if;`)
  L.push('  select count(*) into n from public.old_model_registry')
  L.push("   where equivalent_seer is null and compressor_type = 'Inverter';")
  L.push(`  if n < 11 then raise exception 'FAIL: the inverter rows lost their compressor_type — the "Inverter" SEER text is only safe to null because that column keeps the fact'; end if;`)
  L.push(`  raise notice 'PASS: equivalent_seer is NULL on ${nullSeer} rows (${inv.length} textual + ${nullSeer - inv.length} empty) and compressor_type still names every inverter unit';`)
  L.push('')
  L.push('  -- verbatim proof: the four AC model_no values that carry stray spaces are')
  L.push('  -- still carrying them. If a normaliser ever creeps in, this fails first.')
  L.push('  select count(*) into n from public.old_model_registry')
  L.push("   where model_no <> btrim(regexp_replace(model_no, '\\s+', ' ', 'g'));")
  L.push("  if n <> 4 then raise exception 'FAIL: expected 4 model_no values with stray whitespace (verbatim import), found %', n; end if;")
  L.push("  raise notice 'PASS: model_no imported verbatim — the 4 whitespace warts are intact, so no two rows were merged';")
  L.push('')
  L.push('  -- the whole-content digests: every cell of every row, compared with the')
  L.push('  -- value the script computed straight from the .xlsx.')
  for (const { spec, kept } of results) {
    const fields = Object.keys(spec.headers)
    const d = tableDigest(kept, fields)
    L.push(digestSql(spec, fields))
    L.push(`  if s <> '${d}' then`)
    L.push(`    raise exception 'FAIL: ${spec.table} content digest is % but the artefact says ${d} — the table is not what the workbook holds', s;`)
    L.push('  end if;')
  }
  L.push(`  raise notice 'PASS: all three content digests match the artefacts cell for cell';`)
  L.push('end $$;')
  L.push('')

  const sql = L.join('\n')
  const prior = existsSync(OUT_SQL) ? readFileSync(OUT_SQL, 'utf8') : null
  writeFileSync(OUT_SQL, sql)
  console.log(`wrote ${path.relative(ROOT, OUT_SQL)}  (${sql.length} bytes, sha256 ${createHash('sha256').update(sql).digest('hex')})`)
  console.log(prior == null ? '  (new file)' : (prior === sql ? '  IDENTICAL to the previous generation — regeneration is byte-stable'
    : '  CHANGED from the previous generation — review the diff'))
}

const hashAfter = { ac: sha256(AC_XLSX), light: sha256(LIGHT_XLSX) }
if (hashAfter.ac !== hashBefore.ac || hashAfter.light !== hashBefore.light) {
  die('an artefact changed on disk during this run — the templates are read-only by contract')
}
console.log('')
console.log('artefacts unchanged (sha256 re-asserted): AC ' + hashAfter.ac.slice(0, 16) + '…, Lighting ' + hashAfter.light.slice(0, 16) + '…')
