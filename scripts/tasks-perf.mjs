#!/usr/bin/env node
// 9R(7) — measured render + card-fit for the Team Performance widget.
//
//   node scripts/tasks-perf.mjs            → 1000 tasks, 8 people
//   node scripts/tasks-perf.mjs 250 5      → tasks, people
//
// Two numbers the sprint plan asks for, measured rather than asserted:
//
//   1. Render time for a 1000-task dataset through the REAL component. The
//      widget aggregates over every fetched row, so it — not the paginated task
//      table — is the part whose cost scales with the fetch.
//   2. Whether the nine-column table fits INSIDE ITS CARD at 1366 and 1280.
//      Card level, not body level: a body-level check has passed on this repo
//      while a card genuinely overflowed, which is why .ies-table-wrap exists.
//      The table is allowed to scroll inside the wrapper; the card and the page
//      are not allowed to overflow.
//
// It needs no credentials, because it mounts the component directly rather than
// signing in. That is also its limit: it proves what it renders and says
// nothing about the rest of the page.
//
// BROWSER: this environment ships Chromium under PLAYWRIGHT_BROWSERS_PATH at a
// build number the pinned Playwright does not expect, so the executable is
// passed explicitly instead of letting Playwright resolve its own.

import { createServer } from 'vite'
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const TASKS = Number(process.argv[2] || 1000)
const PEOPLE = Number(process.argv[3] || 8)
const BUDGET_MS = 500

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x800', width: 1280, height: 800 },
  // 1040 is the narrowest width at which the shell still shows its 240px
  // sidebar (the collapse is max-width:1023px), so it is the tightest the
  // content column ever gets on a desktop: 1040 − 240 − 48 = 752px against a
  // table whose min-width is 760. It is included precisely because it is the
  // case where .ies-table-wrap has to do its job — the table must scroll inside
  // the wrapper while the CARD stays within its column. Without this row the
  // suite would only ever prove the easy widths.
  { name: '1040x800', width: 1040, height: 800 },
]

function findChromium() {
  if (process.env.IES_CHROMIUM) return process.env.IES_CHROMIUM
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const direct = path.join(base, 'chromium')
  if (fs.existsSync(direct)) return direct
  const dir = fs.existsSync(base) ? fs.readdirSync(base) : []
  for (const d of dir.filter((x) => x.startsWith('chromium-'))) {
    const p = path.join(base, d, 'chrome-linux', 'chrome')
    if (fs.existsSync(p)) return p
  }
  return null
}

const exe = findChromium()
if (!exe) {
  console.error('no chromium found — set IES_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH')
  process.exit(78)
}
console.log(`chromium: ${exe}`)

const server = await createServer({
  configFile: path.join(import.meta.dirname, 'perf', 'vite.config.mjs'),
  logLevel: 'error',
})
await server.listen()
const base = `http://localhost:${server.config.server.port || server.httpServer.address().port}`

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
let fail = 0

console.log(`\nseeded dataset: ${TASKS} tasks across ${PEOPLE} subordinates\n`)

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  // A harness that fails to mount must say why, not time out silently.
  page.on('pageerror', (e) => console.error(`  [page error] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') console.error(`  [console] ${m.text()}`) })
  await page.goto(`${base}/?tasks=${TASKS}&people=${PEOPLE}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__perf, null, { timeout: 30000 })
  const m = await page.evaluate(() => window.__perf)

  console.log(`${vp.name}`)
  console.log(`  render (mount + aggregate + layout)  ${m.ms} ms   ${m.ms < BUDGET_MS ? 'PASS' : 'FAIL'} (budget ${BUDGET_MS} ms)`)
  console.log(`  columns rendered                     ${m.columns}   ${m.columns === 9 ? 'PASS' : 'FAIL'} (expected 9)`)
  console.log(`  employee rows                        ${m.employeeRows}`)
  console.log(`  card  ${m.cardScrollWidth} / ${m.cardClientWidth} px  card overflows: ${m.cardOverflows}   ${m.cardOverflows ? 'FAIL' : 'PASS'}`)
  console.log(`  wrap  ${m.wrapScrollWidth} / ${m.wrapClientWidth} px  table scrolls inside wrap: ${m.tableScrollsInsideWrap}`)
  console.log(`  page horizontal scroll               ${m.pageScrollsHorizontally}   ${m.pageScrollsHorizontally ? 'FAIL' : 'PASS'}`)
  console.log('')

  if (m.ms >= BUDGET_MS) fail++
  if (m.columns !== 9) fail++
  if (m.cardOverflows) fail++
  if (m.pageScrollsHorizontally) fail++
  await page.close()
}

await browser.close()
await server.close()
console.log(fail ? `FAILED — ${fail} assertion(s)` : 'all assertions passed')
process.exit(fail ? 1 : 0)
