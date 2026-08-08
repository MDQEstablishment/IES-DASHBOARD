// CONSTRAINT #8, MADE MACHINE-CHECKED — the unreadable list as a gate.
//
// Constraints.md #8 says a confidentiality sweep that does not publish an
// enumeration of every member it could not read is not a weak sweep — it is
// not a sweep, and its result may not be reported or relied on. That rule was
// written after three failures of one shape: a confident negative produced by
// a method that could not see the whole file.
//
// A rule that lives only in a document is enforced by whoever remembers it.
// This file enforces it instead. It answers one question on every CI run:
//
//   does the tracked tree contain a member that a text scan cannot read,
//   which is NOT declared, with a proof, in the manifest?
//
// The tree currently contains ZERO such members — the confidentiality purge
// removed them all. That is the state worth defending: while it holds, "the
// sweep found nothing" is trivially true and needs no list, because there is
// nothing a text scan cannot see. The moment a binary lands, this test fails
// and stays failing until it is declared and proved.
//
// This is also the gate that keeps a generated artefact from being committed
// as a hand-made binary that rots — a committed .xlsx cannot pass without a
// per-part proof, which is exactly the friction that rule intends.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const MANIFEST = 'docs/unreadable-manifest.json'

// Categories Constraints #8 requires to be named whenever present. Extension
// lists are the FIRST pass only — the NUL-byte sniff below is what catches a
// binary wearing an innocent extension, which is the case a list written from
// expected content never names.
const BY_EXT = {
  archive: ['.xlsx', '.xlsm', '.xltx', '.docx', '.dotx', '.pptx', '.potx', '.zip', '.jar', '.gz', '.tar'],
  font: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
  pdf: ['.pdf'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff'],
}
// .svg is markup: a text scan genuinely reads it, so it is not "unreadable".
// Listing it would dilute the list with members that need no alternative method.

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 << 20 })
    .toString('utf8').split('\0').filter(Boolean)

/** Category if a text scan cannot honestly read this file, else null. */
function unreadableCategory(rel) {
  const ext = path.extname(rel).toLowerCase()
  for (const [cat, exts] of Object.entries(BY_EXT)) if (exts.includes(ext)) return cat
  let fd
  try {
    fd = fs.openSync(path.join(ROOT, rel), 'r')
    const buf = Buffer.alloc(8192)
    const n = fs.readSync(fd, buf, 0, 8192, 0)
    // a NUL byte in the first 8k is the standard "this is not text" signal
    if (buf.subarray(0, n).includes(0)) return 'binary(NUL)'
  } catch { return null } finally { if (fd !== undefined) fs.closeSync(fd) }
  return null
}

const loadManifest = () => {
  const p = path.join(ROOT, MANIFEST)
  if (!fs.existsSync(p)) return { entries: [] }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

test('T-U8A — every unreadable member in the tree is declared in the manifest', () => {
  const manifest = loadManifest()
  const declared = new Map((manifest.entries || []).map((e) => [e.path, e]))
  const found = tracked()
    .map((rel) => ({ rel, cat: unreadableCategory(rel) }))
    .filter((x) => x.cat)

  const undeclared = found.filter((x) => !declared.has(x.rel))
  assert.deepEqual(
    undeclared.map((x) => `${x.rel} [${x.cat}]`), [],
    'UNDECLARED UNREADABLE MEMBERS.\n' +
    'Constraints #8: a sweep that does not enumerate what it could not read is ' +
    'not a sweep. Each file above must either leave the tree, or be added to ' +
    `${MANIFEST} with the alternative method that cleared it — or the plain ` +
    'words "not cleared".\n' +
    'If this fired because a generated artefact was committed: generate it at ' +
    'runtime instead. A committed binary cannot be reviewed in a diff and goes ' +
    'stale against the code that produced it.',
  )
})

test('T-U8B — every manifest entry carries a method and a real proof, or says "not cleared"', () => {
  for (const e of loadManifest().entries || []) {
    assert.ok(e.category, `${e.path}: no category`)
    assert.ok(e.cleared_by, `${e.path}: no "cleared_by" — state the alternative method, ` +
      'or the literal string "not cleared". A negative finding travels with its method.')
    if (e.cleared_by === 'not cleared') continue
    assert.ok(e.proof, `${e.path}: cleared by "${e.cleared_by}" but no proof document referenced`)
    assert.ok(fs.existsSync(path.join(ROOT, e.proof)),
      `${e.path}: proof "${e.proof}" does not exist — Constraints #7(5), a proof that ` +
      'has gone stale means the artefact is unproven')
  }
})

test('T-U8C — the manifest has no stale entries for files that have left the tree', () => {
  const inTree = new Set(tracked())
  const stale = (loadManifest().entries || []).map((e) => e.path).filter((p) => !inTree.has(p))
  assert.deepEqual(stale, [],
    'manifest lists members no longer tracked — remove them, so the list stays a ' +
    'statement about this tree rather than a historical record')
})
