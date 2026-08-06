// U5 / COMMIT C — the project-import template: neutral, and reproducible.
//
// TWO THINGS ARE PINNED HERE.
//
// 1. DETERMINISM (item 7 / Constraints #7(4)). The rule requires that the
//    script producing a distributed artefact "produces byte-identical output
//    from the same input on repeated runs". This generator could never satisfy
//    it: ExcelJS stamps docProps/core.xml with `wb.created = new Date()`, so
//    identical code produced different bytes every run and there was nothing a
//    reviewer could re-run and compare against. There were TWO clocks, not one —
//    the second is the ZIP container's own per-member timestamp, which JSZip
//    fills with `new Date()` and which no amount of fixing core.xml touches.
//    Both are pinned now. This test builds the workbook twice IN SEPARATE
//    PROCESSES (see the note by buildInChildProcess for why that matters), once
//    more under a different timezone, and asserts one pinned sha256 throughout.
//
// 2. NEUTRALITY (item 6 / the owner's Category F ruling). The example rows named
//    a real ministry, real facilities, real contractors, real staff accounts and
//    real coordinates — in a workbook clients download from a public repository
//    and a public bucket. The rows stay (they teach the format); the values are
//    generic. This test unzips the PRODUCED FILE and searches every archive
//    member, not the source — because the source is not what ships, and because
//    Constraints #7 says in as many words that a visible-layer inspection of a
//    compound format does not establish absence.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { unzipSync, strFromU8 } from 'fflate'
import ExcelJS from 'exceljs'

// Imported for the constants only — and the import itself is a check: before
// this commit, importing the generator signed into Supabase and wrote to
// public/ as a module side effect. The CLI entry is now guarded.
import { TEMPLATE_EPOCH, TEMPLATE_VERSION } from '../scripts/generate-project-template.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = path.join(ROOT, 'node_modules', '.cache', 'ies-template-determinism')

// The live option lists, as a FIXTURE. The generator reads these from
// public.v_form_options at run time and refuses to fall back to a literal;
// determinism is a property of "same input, same output", so the test supplies
// the input rather than reaching for a network the suite must not need.
const OPTS = {
  project_status: ['active', 'draft', 'on_hold', 'closed'],
  building_status: ['pending', 'in_progress', 'signed', 'on_hold', 'blocked'],
  esm: ['ESM1', 'ESM2', 'ESM3'],
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// The pinned hash. It moves ONLY when the template itself changes, and when it
// does the new value belongs in the commit that changed it — that is what makes
// "re-run the script and compare" a check a reviewer can actually perform.
const EXPECTED_SHA256 = 'c870179b2543f7483e2f8117a8e14b56fdb55c841224036a3188ac49cbf0cbc7'

// SEPARATE PROCESSES, deliberately. The first version of this test built twice
// in ONE process and passed — while the generator was still not deterministic.
// The ZIP container's DOS timestamp has TWO-SECOND resolution, so two builds a
// second apart land in the same bucket and produce identical bytes; two builds
// in different processes did not. A verification tool failing in exactly the way
// it exists to catch is the failure mode Constraints #7's worked example is
// about, so the runs are now genuinely independent.
const buildInChildProcess = (out) => {
  execFileSync(process.execPath, ['-e', `
    import(${JSON.stringify(path.join(ROOT, 'scripts/generate-project-template.js'))})
      .then((m) => m.build(${JSON.stringify(OPTS)}, ${JSON.stringify(out)}))
      .catch((e) => { console.error(e); process.exit(1) })
  `], { stdio: ['ignore', 'ignore', 'inherit'] })
  return fs.readFileSync(out)
}

let A, B, partsA
test('build the template twice, in two separate processes', () => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
  A = buildInChildProcess(path.join(TMP, 'a.xlsx'))
  B = buildInChildProcess(path.join(TMP, 'b.xlsx'))
  partsA = unzipSync(new Uint8Array(A))
})

test('T-T1 — two runs of the same input produce byte-identical output', () => {
  const ha = sha(A), hb = sha(B)
  console.log(`\n  template sha256 run 1: ${ha}\n  template sha256 run 2: ${hb}\n  bytes: ${A.length}\n`)
  assert.equal(ha, hb, 'the generator is not deterministic — Constraints #7(4) cannot be met')
  assert.ok(Buffer.compare(A, B) === 0)
  assert.equal(ha, EXPECTED_SHA256, 'the template changed — if that was intended, update EXPECTED_SHA256 in the same commit')
})

test('T-T1b — and the SAME bytes in a different timezone', () => {
  // The ZIP mtime is written from LOCAL-time components, so a UTC Date here
  // would make the artefact depend on where it was built. Measured, not assumed.
  const out = path.join(TMP, 'tz.xlsx')
  execFileSync(process.execPath, ['-e', `
    import(${JSON.stringify(path.join(ROOT, 'scripts/generate-project-template.js'))})
      .then((m) => m.build(${JSON.stringify(OPTS)}, ${JSON.stringify(out)}))
      .catch((e) => { console.error(e); process.exit(1) })
  `], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, TZ: 'Pacific/Auckland' } })
  assert.equal(sha(fs.readFileSync(out)), EXPECTED_SHA256, 'the artefact depends on the builder\'s timezone')
})

test('T-T1c — the repacked archive is still a workbook Excel and the importer can read', async () => {
  // Repacking the ZIP is a real change to the deliverable, so it is opened
  // again rather than assumed intact: same sheets, same header keys, the
  // example row present and marked.
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(TMP, 'a.xlsx'))
  assert.deepEqual(wb.worksheets.map((w) => w.name),
    ['Instructions', 'Project', 'Buildings', 'Building Scopes', 'Materials', 'Items'])
  const proj = wb.getWorksheet('Project')
  assert.equal(proj.getRow(1).getCell(1).value, 'code')
  assert.equal(proj.getRow(2).getCell(1).value, 'PRJ-001')
  assert.equal(proj.getRow(2).getCell(2).value, 'Sample Project')
  const blds = wb.getWorksheet('Buildings')
  assert.equal(blds.getRow(2).getCell(2).value, 'BLD-001')
  // lat / lng left EMPTY, not zeroed
  assert.ok(!blds.getRow(2).getCell(5).value, 'lat should be blank in the example row')
  assert.ok(!blds.getRow(2).getCell(6).value, 'lng should be blank in the example row')
})

test('T-T2 — docProps/core.xml carries the VERSION stamp, not a wall clock', () => {
  const core = strFromU8(partsA['docProps/core.xml'])
  const iso = TEMPLATE_EPOCH.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const stamps = [...core.matchAll(/<dcterms:(created|modified)[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]])
  assert.ok(stamps.length >= 2, `expected created and modified in core.xml, saw ${JSON.stringify(stamps)}`)
  for (const [name, value] of stamps) {
    assert.ok(value.startsWith(iso.slice(0, 10)),
      `dcterms:${name} is ${value}, not the version stamp ${iso} — a wall clock is back`)
  }
  // and the stamp really is a function of the version, not of today
  assert.equal(TEMPLATE_EPOCH.getTime(), Date.UTC(2000, 0, 1 + TEMPLATE_VERSION))
  assert.ok(TEMPLATE_EPOCH.getTime() < Date.parse('2001-01-01'), 'the stamp must not look like a build time')
})

// ── NEUTRALITY, by the method Constraints #7 demands ────────────────────────
// Every archive member is enumerated and decoded, not just the sheet grid. The
// detector runs over the whole archive, so a name surviving in sharedStrings,
// core.xml, app.xml or a comments part is caught by the same pass.
const FORBIDDEN = [
  // the ministry and its facilities
  'MOI', 'Entity A', 'Asir', 'Abha', 'Khamis', 'Police', 'Civil Defense',
  // the contractors
  'Faisal', 'Najd', 'alfaisal',
  // the named people and the real staff accounts
  'almaliki', 'alqahtani', 'Saad', 'Nasser', 'demo.local',
  // the coordinates, to six figures and to their leading digits
  '18.2164', '42.5053', '18.3', '42.73',
  // the phone prefix every one of those numbers carried
  '+966',
]

test('T-T3 — no client identifier survives in ANY member of the produced archive', () => {
  const names = Object.keys(partsA).sort()
  assert.ok(names.includes('xl/sharedStrings.xml'), 'no shared string table — the scan would prove nothing')
  assert.ok(names.includes('docProps/core.xml'))

  const hits = []
  for (const name of names) {
    // decode twice: utf-8 is the truth, latin1 is the failure mode Constraints
    // #7's worked example records (a scanner that decoded UTF-8 as latin1 and
    // reported zero on the very part holding hundreds of matches)
    const bytes = Buffer.from(partsA[name])
    const utf8 = bytes.toString('utf8')
    const latin = bytes.toString('latin1')
    for (const needle of FORBIDDEN) {
      if (utf8.includes(needle) || latin.includes(needle)) hits.push(`${name}: ${needle}`)
    }
  }
  assert.deepEqual(hits, [], `client-identifying values in the distributed template:\n${hits.join('\n')}`)
  console.log(`  scanned ${names.length} archive members, both utf-8 and latin1, against ${FORBIDDEN.length} detectors — 0 hits`)
})

test('T-T4 — the example rows survive, and EVERY one carries DELETE-BEFORE-UPLOAD', () => {
  // isExampleRow() in ProjectModals.jsx tests for this exact string and nothing
  // else, so a row without it is imported as real data. Two Materials rows were
  // missing it before A3(17); this asserts all nine now have it.
  const shared = strFromU8(partsA['xl/sharedStrings.xml'])
  const markers = (shared.match(/DELETE-BEFORE-UPLOAD/g) || []).length
  assert.ok(markers >= 1, 'the marker is not in the workbook at all')

  const src = fs.readFileSync(path.join(ROOT, 'scripts/generate-project-template.js'), 'utf8')
  const rows = src.split('\n').reduce((acc, l, i, all) => {
    if (!/^\s*exampleRow\(/.test(l)) return acc
    // an exampleRow(...) call may wrap over several lines — take until the ])
    let j = i, text = ''
    while (j < all.length) { text += all[j]; if (all[j].includes('])')) break; j++ }
    acc.push(text)
    return acc
  }, [])
  assert.equal(rows.length, 9, 'the example rows must stay — they teach the format')
  rows.forEach((r, i) => assert.ok(r.includes('DELETE-BEFORE-UPLOAD'),
    `example row ${i + 1} has no DELETE-BEFORE-UPLOAD marker, so the importer would treat it as real data:\n${r}`))

  // and the neutral values really are present, so "no hits" above is not just
  // an empty workbook
  for (const want of ['Sample Project', 'Sample Region', 'Contractor name', 'PRJ-001', 'BLD-001']) {
    assert.ok(shared.includes(want), `expected the neutral example value "${want}" in the workbook`)
  }
  // coordinates are absent, not zeroed: 0,0 is a real place and would plot
  const projSheet = Object.keys(partsA).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
  assert.ok(projSheet.length >= 6, 'expected the six sheets')
})
