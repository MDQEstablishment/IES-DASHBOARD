// CONSTRAINT #9, MADE MACHINE-CHECKED.
//
// The rule is one rule, and the gate and the inventory share ONE implementation
// — this file imports the same module the audit script runs, so they cannot
// drift into disagreeing about what a violation is. That mattered: the first
// audit run reported 9 stragglers and a surviving QTY/Qty conflict, both caused
// by the exemption logic rather than by the strings. The word regex dropped
// digits, so "T1 W" tokenised to T + W and the T1 rating labels were never
// recognised as the codes they are; and QTY was wrongly listed as an acronym,
// which exempted it in four files while a fifth wrote Qty.
import test from 'node:test'
import assert from 'node:assert/strict'
import { audit, isViolation, ACRONYMS, UNITS } from '../scripts/audit-capitalisation.mjs'

test('T-CAP1 — no ALL-CAPS headings, labels or column headers remain', () => {
  const r = audit()
  const listed = Object.entries(r.byFile).flatMap(([f, hits]) => hits.map((h) => `${f}: ${h.text}`))
  assert.deepEqual(listed, [],
    'Constraint #9: these render in ALL-CAPS and are not acronyms, units or listed badges')
})

test('T-CAP2 — the same concept is not written two ways', () => {
  const r = audit()
  assert.deepEqual(Object.keys(r.conflicts), [],
    'one concept, one spelling — a column called Qty in one screen and QTY in another is the finding')
})

test('T-CAP3 — acronyms and units are exempt, and stay exactly as written', () => {
  for (const t of ['ESM', 'COC', 'BOQ', 'TARSHID', 'PMO', 'IES', 'SKU', 'SASO', 'T1 BTU', 'T3 EER'])
    assert.equal(isViolation(t), false, `"${t}" must never be re-cased`)
  // kWh is not Kwh. A unit that loses its case stops being the unit.
  assert.ok(UNITS.has('kWh') && UNITS.has('m²'))
  assert.ok(!ACRONYMS.has('QTY'),
    'QTY is an abbreviation of Quantity, written Qty — listing it as an acronym is what let QTY and Qty coexist')
})

test('T-CAP4 — the rule still bites: a planted violation is caught', () => {
  assert.equal(isViolation('IN STOCK'), true)
  assert.equal(isViolation('BUILDINGS SURVEYED'), true)
  assert.equal(isViolation('In Stock'), false)
  assert.equal(isViolation('Buildings Surveyed'), false)
})
