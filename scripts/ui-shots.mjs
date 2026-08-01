#!/usr/bin/env node
// 9J — before/after screenshot rig (audit trail, decision (e)).
//
// Shoots every routed screen at the two viewports the sprint cares about:
// 1366x768 (the laptop the programme is actually run on, and the width where
// the dense tables were measured to overflow) and 390x844 (the field team's
// phone, where EntryForm / Operating Hours / Daily Log are used daily).
//
// It also asserts, per page per viewport, that the PAGE does not scroll
// horizontally — wide tables must scroll inside their own card, never push the
// body. That is the measured-overflow lesson from an earlier sprint, encoded so
// it cannot regress unnoticed.
//
//   node scripts/ui-shots.mjs before    → docs/ui-9J/before/
//   node scripts/ui-shots.mjs after     → docs/ui-9J/after/
//
// AUTH: the app's demo sign-in needs VITE_DEMO_PASSWORD, which is deliberately
// never committed. Put it in .env.local (git-ignored) before running, or pass
// IES_SHOT_EMAIL / IES_SHOT_PASSWORD for a real account. Without a credential
// the rig shoots the login screen only and says so, rather than pretending.

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const PHASE = process.argv[2] === 'after' ? 'after' : 'before'
const BASE = process.env.IES_SHOT_BASE || 'http://localhost:5173'
const OUT = path.join(ROOT, 'docs', 'ui-9J', PHASE)

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
]

// Route -> file slug. Drill-ins are included because they carry the densest
// tables in the app; ids are resolved at run time from whatever the account
// can see, so this works against any dataset.
const SCREENS = [
  ['/dashboard', 'dashboard'],
  ['/projects', 'projects'],
  ['/materials', 'materials'],
  ['/tasks', 'tasks'],
  ['/escalations', 'escalations'],
  ['/reports', 'reports'],
  ['/settings', 'settings'],
]

const creds = {
  email: process.env.IES_SHOT_EMAIL || 'omar.zaki@ies.demo.local',
  password: process.env.IES_SHOT_PASSWORD || process.env.VITE_DEMO_PASSWORD || '',
}

async function shoot(page, vp, slug) {
  await page.waitForTimeout(700)
  const file = path.join(OUT, vp.name, `${slug}.png`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file, fullPage: true })
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }))
  const bad = overflow.scrollW > overflow.innerW + 1
  console.log(`  ${bad ? 'OVERFLOW' : '   ok   '}  ${vp.name}  ${slug}  (scrollW ${overflow.scrollW} vs ${overflow.innerW})`)
  return bad ? `${vp.name}/${slug}` : null
}

// The preinstalled Chromium is a different build number than this Playwright
// pins, so point at it explicitly rather than downloading a second copy.
const EXE = process.env.IES_SHOT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
// chromium-1194 dropped the old headless mode this Playwright asks for, so run
// the new one explicitly.
const browser = await chromium.launch({
  ...(fs.existsSync(EXE) ? { executablePath: EXE } : {}),
  args: ['--headless=new'],
})
const overflows = []
let authed = false

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`))

  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
  overflows.push(await shoot(page, vp, '00-login'))

  if (creds.password) {
    try {
      await page.fill('input[type="email"], input[lang="en"]', creds.email)
      await page.fill('input[type="password"]', creds.password)
      await page.click('button:has-text("Sign in"), button[type="submit"]')
      await page.waitForTimeout(2500)
      authed = !(await page.locator('input[type="password"]').count())
    } catch { authed = false }
  }

  if (!authed) {
    console.log(`  (not signed in — set VITE_DEMO_PASSWORD in .env.local or IES_SHOT_PASSWORD)`)
    await ctx.close()
    continue
  }

  for (const [route, slug] of SCREENS) {
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
    overflows.push(await shoot(page, vp, slug))
  }

  // deepest drill-in available: first project, then its first building
  await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle' })
  const href = await page.locator('a[href*="#/projects/"]').first().getAttribute('href').catch(() => null)
  if (href) {
    await page.goto(`${BASE}/${href.replace(/^#?\/?/, '#/').replace('##', '#')}`, { waitUntil: 'networkidle' })
    overflows.push(await shoot(page, vp, 'project-detail'))
    const bhref = await page.locator('a[href*="/buildings/"]').first().getAttribute('href').catch(() => null)
    if (bhref) {
      await page.goto(`${BASE}/${bhref.replace(/^#?\/?/, '#/').replace('##', '#')}`, { waitUntil: 'networkidle' })
      overflows.push(await shoot(page, vp, 'building-detail'))
    }
  }
  await ctx.close()
}

await browser.close()
const bad = overflows.filter(Boolean)
console.log(`\n${PHASE}: ${authed ? 'authenticated' : 'LOGIN ONLY (no credential)'} · ${bad.length} horizontal overflow(s)`)
if (bad.length) { console.log('overflowing:', bad.join(', ')); process.exit(1) }
