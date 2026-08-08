// Where the photo control lives is the design decision, so it is asserted.
//
// The card is a READ surface everywhere it appears — Projects list, project
// page. Its appearance is configured where the PROJECT is configured: Add
// project and Edit project. A reposition handle on the project page would put a
// configuration control on a reading screen, which is the placement the owner
// rejected.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const PICKER = read('src/components/PhotoFocalPicker.jsx')
const PROJECT_MODALS = strip(read('src/components/ProjectModals.jsx'))
const LIST = strip(read('src/pages/Projects.jsx'))
const DETAIL = strip(read('src/pages/ProjectDetail.jsx'))

test('T-PF1 — the picker is mounted in the project dialogs, and only there', () => {
  assert.ok(/<PhotoFocalPicker\b/.test(PROJECT_MODALS), 'Add/Edit project must offer the control')
  assert.ok(!/PhotoFocalPicker/.test(DETAIL), 'the project page must not offer a reposition control')
  assert.ok(!/<PhotoFocalPicker\b/.test(LIST), 'the projects list must not offer a reposition control')
})

test('T-PF2 — the list RENDERS the stored position through the shared helper', () => {
  assert.ok(/focalStyle\(p\)/.test(LIST), 'the card must apply the stored focal point')
  assert.ok(/import \{ focalStyle \}/.test(LIST),
    'it must come from the picker module, so preview and card cannot disagree')
})

test('T-PF3 — focalStyle turns stored columns into CSS, and defaults to today', () => {
  // 50/50/100 is exactly plain object-fit: cover, so untouched projects are unchanged
  // slice to the next export rather than to the first "})" — a lazy match ends
  // inside scale(${...}) and silently drops the rest of the function
  const from = PICKER.indexOf('export const focalStyle')
  const src = PICKER.slice(from, PICKER.indexOf('export default', from))
  assert.ok(/photo_pos_x \?\? 50/.test(src) && /photo_pos_y \?\? 50/.test(src))
  assert.ok(/photo_zoom \?\? 100/.test(src))
  assert.ok(/objectPosition/.test(src) && /transform:/.test(src) && /transformOrigin/.test(src),
    'both axes need scale ABOVE cover to have travel; object-position alone moves only one')
})

test('T-PF4 — the drag is keyboard-operable', () => {
  assert.ok(/ArrowLeft/.test(PICKER) && /ArrowRight/.test(PICKER)
    && /ArrowUp/.test(PICKER) && /ArrowDown/.test(PICKER),
    'drag alone would ship a control a keyboard user cannot reach')
  assert.ok(/tabIndex=\{url \? 0 : -1\}/.test(PICKER), 'focusable only when there is an image to move')
  assert.ok(/aria-label="Photo position"/.test(PICKER))
})

test('T-PF5 — the dialogs persist all three columns', () => {
  for (const col of ['photo_pos_x', 'photo_pos_y', 'photo_zoom']) {
    assert.ok(new RegExp(`${col}: f\\.${col}`).test(PROJECT_MODALS), `${col} must reach the payload`)
    assert.ok(new RegExp(`init\\('${col}'`).test(PROJECT_MODALS), `${col} must load into the form`)
  }
})
