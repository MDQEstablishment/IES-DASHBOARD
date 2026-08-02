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

// 9J(10a) — three viewports, not two. 1280x800 was added because it is the
// narrowest COMMON laptop width, and the 1.7fr/1fr Dashboard split and the
// dense tables behave differently there than at 1366: it is the width where a
// card is narrow enough to matter but the mobile media query (max-width:767px)
// has not yet collapsed the grids, so nothing rescues a bad layout.
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x800', width: 1280, height: 800 },
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
  const overflow = await page.evaluate(() => {
    // 9Q(1) — TWO assertions, not one.
    //
    // The body-level check below is necessary and insufficient, and 9P(B) is the
    // proof: the Attention List was moved into a one-third column, its table no
    // longer fit, and `.ies-table-wrap` did exactly what it was built to do —
    // it scrolled INSIDE the card. So the page never overflowed, the gate
    // reported ok at all three viewports, and the defect shipped. A crushed
    // table with a horizontal scrollbar is precisely what this project's
    // discipline rule forbids, and the body-level check is structurally blind
    // to it, because a working scroll container is what hides it.
    //
    // So every .ies-table-wrap is now measured against its own client width.
    // Above the mobile breakpoint a table is expected to FIT its card; at 390
    // it is expected to scroll, which is the whole point of the wrapper, so the
    // card-level assertion is applied only at >=768px.
    const wraps = [...document.querySelectorAll('.ies-table-wrap')].map((w) => {
      const card = w.closest('[style*="border-radius"], [style*="borderRadius"]') || w.parentElement
      const label = (card?.querySelector('div')?.textContent || '').trim().slice(0, 28)
      return { label, clientW: w.clientWidth, scrollW: w.scrollWidth }
    })
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      wraps,
    }
  })
  const bodyBad = overflow.scrollW > overflow.innerW + 1
  const cardBad = vp.width >= 768
    ? overflow.wraps.filter((w) => w.scrollW > w.clientW + 1)
    : []
  const bad = bodyBad || cardBad.length > 0
  const detail = bodyBad ? `body scrollW ${overflow.scrollW} vs ${overflow.innerW}` : `scrollW ${overflow.scrollW} vs ${overflow.innerW}`
  console.log(`  ${bad ? 'OVERFLOW' : '   ok   '}  ${vp.name}  ${slug}  (${detail}${overflow.wraps.length ? `; ${overflow.wraps.length} table card(s) checked` : ''})`)
  for (const w of cardBad) {
    console.log(`      ↳ TABLE DOES NOT FIT ITS CARD: "${w.label}" scrollWidth ${w.scrollW} vs clientWidth ${w.clientW}`)
  }
  return bad ? `${vp.name}/${slug}` : null
}

// The preinstalled Chromium is a different build number than this Playwright
// pins, so point at it explicitly rather than downloading a second copy.
const EXE = process.env.IES_SHOT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

// 9J(10a) — Chromium has to go through the egress proxy or it never reaches
// Supabase, and without Supabase there is no session and no authenticated
// screen to shoot. Three things are all required, and each was found by a
// distinct failure:
//
//  · --proxy-server: without it the Supabase host dies at ERR_CONNECTION_RESET.
//    The page renders, the login form submits, nothing happens, and the rig
//    reports "not signed in" as though the credential were wrong.
//  · --proxy-bypass-list: the preview server is on loopback. Left proxied, the
//    proxy answers the plain-HTTP request with 405 Method Not Allowed and the
//    app bundle itself never loads — a blank page and a selector timeout.
//    Playwright's own `proxy.bypass` option did NOT take effect here; the raw
//    Chromium flag did.
//  · --ssl-version-max=tls1.2: the proxy re-terminates TLS, and Chromium's
//    TLS 1.3 negotiation against it is what the cap avoids. The proxy CA is
//    already in the browser NSS store, so verification stays ON — nothing here
//    disables certificate checking, and nothing should.
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || ''
const browser = await chromium.launch({
  ...(fs.existsSync(EXE) ? { executablePath: EXE } : {}),
  args: [
    '--headless=new',
    '--ssl-version-max=tls1.2',
    ...(PROXY ? [`--proxy-server=${PROXY}`, '--proxy-bypass-list=127.0.0.1;localhost;[::1]'] : []),
  ],
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
      // 9J(10a) — the old selector was 'input[type="email"], input[lang="en"]'.
      // Login renders <input lang="en"> for the email and <input lang="en"
      // type="password"> for the password: there is no input[type="email"] at
      // all, and BOTH inputs carry lang="en". So that selector list resolved to
      // two elements and Playwright's strict mode threw — every run, at every
      // viewport, on the very first fill.
      //
      // The throw landed in a bare `catch { authed = false }`, which reported
      // the identical "not signed in — set VITE_DEMO_PASSWORD" message that a
      // MISSING CREDENTIAL produces. So a code defect wore the costume of a
      // configuration problem, and the screenshot gate was recorded as "blocked
      // on egress / pending credential" across nine commits while the credential
      // was fine. The catch now reports what actually failed.
      await page.fill('input[lang="en"]:not([type="password"])', creds.email)
      await page.fill('input[type="password"]', creds.password)
      await page.click('button[type="submit"], button:has-text("Sign in")')
      await page.waitForTimeout(3000)
      authed = !(await page.locator('input[type="password"]').count())
      if (!authed) console.log('  (sign-in submitted but the password field is still present — credential rejected?)')
    } catch (e) {
      authed = false
      console.log(`  [sign-in FAILED] ${e.message.split('\n')[0]}`)
    }
  } else {
    console.log('  (no credential supplied — set VITE_DEMO_PASSWORD in .env.local or IES_SHOT_PASSWORD)')
  }

  if (!authed) {
    console.log(`  → login screen only at ${vp.name}; authenticated screens NOT captured`)
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
