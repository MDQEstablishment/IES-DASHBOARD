// The search sits in the middle column of a three-column header.
//
// It was right-of-centre because it was the first child of the marginLeft:auto
// group that also holds Live, the clock and the bell — so it inherited that
// group's alignment. A flex row with margin:auto would drift again the moment
// the breadcrumb grew, which is exactly how it got there. Grid columns are
// structural: the middle column is centred against the viewport, and the side
// columns cannot be reached by it, so a growing field cannot collide with the
// clock.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8')
const SHELL = read('src/components/Shell.jsx')
const SEARCH = read('src/components/GlobalSearch.jsx')
const CSS = read('src/index.css')

test('T-SB1 — the header is a three-column grid, centring the middle column', () => {
  assert.ok(/gridTemplateColumns: '1fr auto 1fr'/.test(SHELL),
    'centring must be structural, not a margin that drifts with the breadcrumb')
  assert.ok(/display: 'grid'/.test(SHELL))
})

test('T-SB2 — the search is the middle child, between the two side groups', () => {
  const left = SHELL.indexOf('ies-topbar-left')
  const mid = SHELL.indexOf('<GlobalSearch />')
  const right = SHELL.indexOf("justifyContent: 'flex-end'")
  assert.ok(left > 0 && mid > left && right > mid,
    'order must be left group, search, right group — that is what makes the grid centre it')
})

test('T-SB3 — the field has a real surface, not a hairline that dissolves', () => {
  assert.ok(/background: focused \? 'var\(--surface-1\)' : 'var\(--track\)'/.test(SEARCH),
    'a fill is what stops it reading as a default input against the white bar')
  assert.ok(/borderRadius: 'var\(--radius-m\)'/.test(SEARCH), "the theme's larger radius")
  assert.ok(/inset 0 1px 2px/.test(SEARCH), 'inset hairline for depth')
})

test('T-SB4 — the focus state belongs to this product', () => {
  assert.ok(/'var\(--accent\)' : 'var\(--line\)'/.test(SEARCH), 'accent border on focus')
  assert.ok(/0 0 0 3px var\(--accent-tint\)/.test(SEARCH), 'accent-tint ring on focus')
  assert.ok(/setFocused\(true\)/.test(SEARCH) && /setFocused\(false\)/.test(SEARCH))
  assert.ok(/outline: 'none'/.test(SEARCH), 'the browser default outline is replaced, not merely removed')
})

test('T-SB5 — the shortcut hint yields as soon as it is in the way', () => {
  assert.ok(/!focused && !q/.test(SEARCH),
    'the chip must disappear on focus or once typing starts, not sit over the text')
  assert.ok(/aria-hidden="true"/.test(SEARCH), 'decorative to a screen reader')
})

test('T-SB6 — below 1024 it still collapses to an icon, and topmeta still hides', () => {
  assert.ok(/@media \(max-width:1023px\)\{[\s\S]*?\.ies-search-trigger\{display:inline-flex/.test(CSS))
  assert.ok(/\.ies-topmeta\{display:none !important\}/.test(CSS),
    'Live and the clock still hide under 768, so the field owns the bar on a phone')
})
