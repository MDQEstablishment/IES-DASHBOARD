// ONE dialog, ONE primary — asserted structurally, because this is exactly the
// kind of thing that quietly grows a second button back.
//
// The header used to carry three sibling controls and the dialog used to carry
// a One Building / From Excel segmented control. Both were rejected: a toggle
// makes a person declare a mode before they have done anything, and it leaves
// two half-forms competing for the same primary. These assertions keep the
// resolved shape from regressing.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8')
// Comments are stripped before these assertions run. The dialog's header
// comment explains WHY the segmented control was removed, and that explanation
// is worth keeping — but a test that greps raw text would match the very words
// it is meant to forbid, and "fixing" it by deleting the rationale would be the
// wrong repair.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const DIALOG = stripComments(read('src/components/AddBuildingsModal.jsx'))
const PAGE = read('src/pages/ProjectDetail.jsx')

test('T-AB1 — the project header offers ONE building control, not three', () => {
  assert.ok(/>Add Buildings</.test(PAGE), 'the single Add Buildings control is missing')
  assert.ok(!/>Download template</i.test(PAGE),
    'Download template must live inside the dialog, not in the page header')
  assert.ok(!/>Import Excel</i.test(PAGE),
    'Import Excel must live inside the dialog, not in the page header')
  assert.equal((PAGE.match(/setAddBldgOpen\(true\)/g) || []).length, 1)
})

test('T-AB2 — no segmented control, tabs or mode switch survived', () => {
  for (const banned of [/One Building/, /From Excel/, /role="tab"/, /aria-selected/, /segmented/i]) {
    assert.ok(!banned.test(DIALOG),
      `the dialog must not reintroduce a mode switch (${banned}) — the primary follows the evidence instead`)
  }
})

test('T-AB3 — exactly one primary action, and its label follows what was done', () => {
  assert.equal((DIALOG.match(/variant="primary"/g) || []).length, 1,
    'two primaries is the inelegance the single panel exists to remove')
  assert.ok(/Add Building'/.test(DIALOG), 'manual label missing')
  assert.ok(/Import \$\{file\.rows\.length\}/.test(DIALOG), 'file label must state the real row count')
  assert.ok(/finished \? 'Done'/.test(DIALOG), 'post-import label missing')
})

test('T-AB4 — both routes go through the ONE write path, with honest sources', () => {
  const calls = DIALOG.match(/supabase\.rpc\('import_buildings'/g) || []
  assert.equal(calls.length, 1, 'one call site: a second would be a second write path')
  assert.ok(/p_source: fileMode \? 'import' : 'app'/.test(DIALOG))
  assert.ok(/p_file_name: fileMode \? file\.name : null/.test(DIALOG))
})

test('T-AB5 — the manual fields RECEDE under a file, they are not unmounted', () => {
  // dimming keeps it visible what the file stands in for; unmounting hides it
  assert.ok(/opacity: fileMode \? 0\.32 : 1/.test(DIALOG))
  assert.ok(/pointerEvents: fileMode \? 'none' : 'auto'/.test(DIALOG))
  assert.ok(/aria-label="Remove file"/.test(DIALOG), 'the file must be removable to hand the panel back')
})

test('T-AB6 — the report leads with held rows', () => {
  const held = DIALOG.indexOf('result.held.length > 0')
  const acc = DIALOG.indexOf('result.accepted.length > 0')
  assert.ok(held > 0 && acc > held,
    'held rows render before imported ones: "48 of 50" hides the two that need a decision')
})
