// U5 / COMMIT B — the pins for "one fact, one home".
//
// Every assertion here exists because a fact was written down twice and the two
// copies were free to drift. Where the fix is an import, the test is trivial and
// that is the point. Where the fix CANNOT be an import — a frozen generator, a
// Deno file that cannot reach src/lib — the copy stays and this file watches it,
// which is the difference between a known duplicate and an unknown one.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { BUCKETS, ALL_BUCKETS, PHOTO_BUCKETS, PUBLIC_BUCKETS } from '../src/lib/buckets.js'
import { MAX_SELECTION_ROWS, SELECTION_LAST_SHEET_ROW } from '../supabase/functions/_shared/limits.js'
import { MAX_PHOTOS } from '../src/lib/reportPhotoAnnex.js'
import { MAX_SELECTION_ROWS as ENGINE_MAX } from '../src/lib/savingSheet.js'
import { PRICE, priceOf, estimateCostUsd, usageOf, DEFAULT_PRICE } from '../supabase/functions/_shared/pricing.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ═══ 1. THE BUCKET LIST ════════════════════════════════════════════════════
test('T-B1 — the bucket list is complete, unique, and every name is a valid object key', () => {
  assert.equal(new Set(ALL_BUCKETS).size, ALL_BUCKETS.length, 'duplicate bucket name')
  for (const b of ALL_BUCKETS) assert.match(b, /^[a-z0-9-]+$/, `${b} is not a lowercase-kebab bucket name`)
  assert.equal(ALL_BUCKETS.length, 13, 'a bucket was added or removed — update the migration parity check too')
  for (const b of PHOTO_BUCKETS) assert.ok(ALL_BUCKETS.includes(b), `${b} is not in BUCKETS`)
  for (const b of PUBLIC_BUCKETS) assert.ok(ALL_BUCKETS.includes(b), `${b} is not in BUCKETS`)
  assert.deepEqual(PUBLIC_BUCKETS, [BUCKETS.PROJECT_TEMPLATES], 'exactly one bucket is public')
})

test('T-B2 — no bucket name survives as a bare literal outside buckets.js', () => {
  // Two exemptions, both named and both watched by T-B3 below:
  //   src/lib/cocPdf.js  — FROZEN, cannot import
  //   supabase/functions/extract-delivery-pdf/index.ts — Deno, cannot reach src/lib
  const EXEMPT = new Set(['src/lib/buckets.js', 'src/lib/cocPdf.js'])
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name)
      if (e.isDirectory()) walk(rel, out)
      else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(rel)
    }
    return out
  }
  const files = [...walk('src'), ...walk('scripts')]
  const offenders = []
  for (const f of files) {
    if (EXEMPT.has(f)) continue
    const src = read(f)
    for (const b of ALL_BUCKETS) {
      // a quoted bucket name used as a value, not inside a comment or a path
      const re = new RegExp(`(?<![\\w-])['"\`]${b}['"\`]`)
      const line = src.split('\n').find((l) => re.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      if (line) offenders.push(`${f}: ${b} — ${line.trim().slice(0, 90)}`)
    }
  }
  assert.deepEqual(offenders, [], `bucket names must come from BUCKETS:\n${offenders.join('\n')}`)
})

test('T-B3 — the two literals that CANNOT import still agree with BUCKETS', () => {
  // cocPdf.js is frozen by the census (a deliverable generator held byte-
  // identical), so it keeps its literal. A frozen file cannot import — but it
  // can be watched, and a rename of the bucket now fails here instead of at
  // runtime for a user generating a completion certificate.
  const coc = read('src/lib/cocPdf.js')
  assert.match(coc, new RegExp(`uploadToBucket\\('${BUCKETS.COC_PDFS}'`),
    `cocPdf.js no longer writes to ${BUCKETS.COC_PDFS} — it is frozen, so this is either a rename that must be reverted or a deliberate unfreezing`)

  // The Edge Function runs under Deno and cannot import src/lib, so its bucket
  // name is a literal by necessity rather than by neglect.
  const edge = read('supabase/functions/extract-delivery-pdf/index.ts')
  assert.match(edge, new RegExp(`storage\\.from\\("${BUCKETS.DELIVERY_NOTES}"\\)`),
    `extract-delivery-pdf reads a different bucket from BUCKETS.DELIVERY_NOTES`)
})

// ═══ 2. THE CEILINGS ═══════════════════════════════════════════════════════
test('T-L1 — the 20-row selection ceiling is one constant reaching all three sites', () => {
  assert.equal(MAX_SELECTION_ROWS, 20)
  assert.equal(SELECTION_LAST_SHEET_ROW, 21, "TARSHID's VLOOKUP range is B2:N21")
  assert.equal(ENGINE_MAX, MAX_SELECTION_ROWS, 'savingSheet.js must re-export the shared ceiling, not restate it')

  // site 2 — the generator's write guard
  const gen = read('src/lib/savingSheetGen.js')
  assert.match(gen, /s\.row_no > MAX_SELECTION_ROWS/, 'savingSheetGen still hardcodes the ceiling')
  assert.match(gen, /_shared\/limits\.js/)

  // site 3 — the sentence the model reads. This was PROSE, which is why it was
  // the copy most likely to be left behind.
  const agent = read('supabase/functions/saving-sheet-agent/index.ts')
  assert.match(agent, /_shared\/limits\.js/, 'the Edge Function must import the ceiling')
  assert.match(agent, /at most \$\{MAX_SELECTION_ROWS\} models/, 'the prompt sentence must interpolate the ceiling')
  assert.doesNotMatch(agent, /at most 20 models/, 'the prose copy of the ceiling is back')
})

test('T-L2 — the 40-photo ceiling: one live constant, one FROZEN duplicate, watched', () => {
  assert.equal(MAX_PHOTOS, 40)
  // docPdf.js is frozen (census-hashed, byte-identical this unit), so its
  // MAX_INSPECTION_PHOTOS stays a literal. The two caps are the same physical
  // limit — ~150 KB a photograph, ~6 MB a document — and if one moves the other
  // must. This assertion is the only mechanism the freeze leaves us.
  const doc = read('src/lib/docPdf.js')
  const m = doc.match(/const MAX_INSPECTION_PHOTOS = (\d+)/)
  assert.ok(m, 'docPdf.js no longer declares MAX_INSPECTION_PHOTOS')
  assert.equal(Number(m[1]), MAX_PHOTOS,
    'docPdf.js is FROZEN and now disagrees with reportPhotoAnnex.MAX_PHOTOS — raise the freeze before changing either')
})

// ═══ 3. THE PRICE TABLE ════════════════════════════════════════════════════
test('T-P1 — one price table, and every model ai_settings can name is in it', () => {
  // The three former homes now import; none may restate the numbers.
  const core = read('supabase/functions/murshid-chat/core.ts')
  const agent = read('supabase/functions/saving-sheet-agent/index.ts')
  const extract = read('supabase/functions/extract-delivery-pdf/index.ts')
  for (const [name, src] of [['murshid-chat/core.ts', core], ['saving-sheet-agent', agent], ['extract-delivery-pdf', extract]]) {
    assert.match(src, /_shared\/pricing\.ts/, `${name} must import the shared price table`)
    assert.doesNotMatch(src, /cacheWrite:\s*1\.25/, `${name} still carries a copy of the price table`)
  }
  const noComments = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(noComments(extract), /PRICE_IN|PRICE_OUT/, 'the partial Haiku-only table is back in extract-delivery-pdf')

  // every model id the three functions can default to must be priced
  const ids = new Set([
    ...core.matchAll(/"(claude-[a-z0-9.-]+)"/g),
    ...agent.matchAll(/"(claude-[a-z0-9.-]+)"/g),
    ...extract.matchAll(/"(claude-[a-z0-9.-]+)"/g),
  ].map((m) => m[1]))
  assert.ok(ids.size >= 2, 'expected at least the Haiku and Sonnet defaults')
  for (const id of ids) assert.ok(id in PRICE, `${id} is a default in an Edge Function but is not priced`)
})

test('T-P2 — the partial copy under-reported cached calls; the shared one does not', () => {
  const model = 'claude-haiku-4-5-20251001'
  const u = { tokens_in: 1_000_000, tokens_out: 1_000_000, cache_read: 1_000_000, cache_write: 1_000_000 }
  // the OLD extract-delivery-pdf arithmetic, verbatim: in + out only, at 1.0/5.0
  const oldWay = (u.tokens_in / 1e6) * 1.0 + (u.tokens_out / 1e6) * 5.0
  const now = estimateCostUsd(model, u)
  assert.equal(oldWay, 6)
  assert.equal(now, 6 + 0.1 + 1.25)
  assert.ok(now > oldWay, 'the cache tokens the old cost line ignored are now charged')

  // an unknown model is priced as the MOST expensive thing we run, so a wrong
  // estimate trips the cap early rather than spending quietly
  assert.deepEqual(priceOf('claude-something-unreleased'), DEFAULT_PRICE)
  assert.ok(DEFAULT_PRICE.in >= Math.max(...Object.values(PRICE).map((p) => p.in)))

  // usageOf reads all four counters, including the two the old code dropped
  assert.deepEqual(
    usageOf({ usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }),
    { tokens_in: 1, tokens_out: 2, cache_read: 3, cache_write: 4 })
  assert.deepEqual(usageOf({}), { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 })
  assert.deepEqual(usageOf(null), { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 })
})

// ═══ 4. THE MODEL ID AND THE CAP LEAVE THE CODE ════════════════════════════
test('T-S1 — extract-delivery-pdf reads its model and its cap from ai_settings', () => {
  const src = read('supabase/functions/extract-delivery-pdf/index.ts')
  assert.match(src, /from\("ai_settings"\)/, 'the function must read ai_settings')
  assert.match(src, /S\.model_extract/, 'the model id must come from ai_settings.model_extract')
  assert.match(src, /S\.pdf_monthly_cap/, 'the cap must come from ai_settings.pdf_monthly_cap')
  // the constants may survive ONLY as named last-resort defaults
  assert.doesNotMatch(src, /^const MODEL = /m, 'the model id is hardcoded again')
  assert.doesNotMatch(src, /^const MONTHLY_CAP = /m, 'the cap is hardcoded again')

  // and the UI meter reads the SAME row rather than its own copy
  const settings = read('src/pages/Settings.jsx')
  assert.match(settings, /pdf_monthly_cap/, 'the Settings meter must read the ai_settings row')
  assert.doesNotMatch(settings, /const PDF_CAP = 1000\b/, 'the second copy of the cap is back in Settings.jsx')
})

// ═══ 5. THE SURVEY PHOTOGRAPHS HAVE THEIR OWN BUCKET ═══════════════════════
test('T-S2 — survey photographs no longer share the daily-progress bucket', () => {
  assert.equal(BUCKETS.SURVEY_PHOTOS, 'survey-photos')
  assert.notEqual(BUCKETS.SURVEY_PHOTOS, BUCKETS.DAILY_PROGRESS_PHOTOS)
  for (const f of ['src/components/survey/EntryForm.jsx', 'src/lib/surveyExport.js']) {
    const src = read(f)
    assert.match(src, /BUCKETS\.SURVEY_PHOTOS/, `${f} must write survey photos to their own bucket`)
    assert.doesNotMatch(src, /['"]daily-progress-photos['"]/, `${f} still names the daily-progress bucket`)
  }
})
