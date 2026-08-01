#!/usr/bin/env node
// 9J — the acceptance census. THE SPRINT'S SAFETY RAIL.
//
// Sprint 9J is a skin-only reskin: the owner's rule is "المهم ما تتغير أي وظيفة
// أو يضيع شيء، أنا أغير سكين فقط" — change the skin, lose nothing. The danger of
// a reskin is not that it looks wrong; it is that a button quietly stops being
// wired, or a query loses a filter, while the page still looks fine.
//
// So before any restyle lands we take an inventory of every interactive control
// and every database touch in the UI layer, and after every commit we regenerate
// it and diff. An empty diff is the proof that the sprint did what it claimed.
//
// WHAT IT DELIBERATELY RECORDS — and why it survives reformatting:
// a handler is recorded by the FUNCTIONS IT CALLS, not by its source text, so
// re-indenting, re-wrapping or moving JSX cannot change the census. Only
// re-wiring can.
//
//   node scripts/ui-census.mjs            → writes docs/9J-acceptance.md
//   node scripts/ui-census.mjs --check    → regenerates and diffs; exit 1 on drift
//
// LIB MANIFEST: the same run hashes every src/lib module. Those are the document
// generators and the data layer — rule 3 of the sprint says they take zero diffs,
// and a sha256 per file is how that is proven rather than asserted.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'docs', '9J-acceptance.md')
const SCAN_DIRS = ['src/pages', 'src/components']
const LIB_DIR = 'src/lib'

// ── file walk ───────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, out)
    else if (/\.jsx?$/.test(e.name)) out.push(rel)
  }
  return out
}

// Take the balanced {...} expression that starts at `i` (which points at '{').
function balanced(src, i) {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i + 1, j) }
  }
  return src.slice(i + 1)
}

// A handler's identity = the sorted set of functions it calls, or the bare
// identifier when it is just a reference. Reformat-proof by construction.
function handlerIdentity(expr) {
  const calls = [...expr.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])
    .filter((n) => !['if', 'for', 'while', 'switch', 'catch', 'return', 'function'].includes(n))
  if (calls.length) return [...new Set(calls)].sort().join('+')
  const bare = expr.trim().match(/^[A-Za-z_$][\w$]*$/)
  return bare ? bare[0] : '(inline)'
}

const EVENTS = 'Click|Change|Submit|Blur|Focus|KeyDown|KeyUp|Input|MouseEnter|MouseDown|Drop|DragOver|Paste'

function scanFile(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const rec = { handlers: [], db: [], components: [], screens: [] }

  const evRe = new RegExp(`\\bon(${EVENTS})\\s*=\\s*\\{`, 'g')
  let m
  while ((m = evRe.exec(src)) !== null) {
    const braceAt = src.indexOf('{', m.index + m[0].length - 1)
    rec.handlers.push(`on${m[1]}:${handlerIdentity(balanced(src, braceAt))}`)
  }

  // every database touch the UI layer makes, by operation and target
  for (const [re, fmt] of [
    [/\b(bgInsert|bgUpdate|bgDelete)\(\s*'([^']+)'/g, (x) => `${x[1]}:${x[2]}`],
    [/\buseLiveQuery\(\s*'([^']+)'/g, (x) => `read:${x[1]}`],
    [/supabase\s*\n?\s*\.from\(\s*'([^']+)'/g, (x) => `from:${x[1]}`],
    [/supabase\.rpc\(\s*'([^']+)'/g, (x) => `rpc:${x[1]}`],
    [/\b(uploadToBucket|signedUrlFor|downloadBlob)\(/g, (x) => `io:${x[1]}`],
  ]) { while ((m = re.exec(src)) !== null) rec.db.push(fmt(m)) }

  for (const c of ['Modal', 'FileDropZone', 'Btn', 'Field', 'Chip', 'PageTitle', 'Empty', 'Loading'])
    rec.components.push(...Array.from({ length: (src.match(new RegExp(`<${c}[\\s/>]`, 'g')) || []).length }, () => c))

  for (const s of src.matchAll(/data-screen-label="([^"]+)"/g)) rec.screens.push(s[1])
  return rec
}

const tally = (arr) => {
  const map = new Map()
  arr.forEach((k) => map.set(k, (map.get(k) || 0) + 1))
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

// ── routes (the guard surface must not move) ────────────────────────────────
function routes() {
  const src = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  return [...src.matchAll(/<Route\s+([^>]*?)\/?>/g)]
    .map((r) => {
      const p = r[1].match(/path="([^"]+)"/)
      const el = r[1].match(/element=\{<(\w+)/)
      const to = r[1].match(/to="([^"]+)"/)
      return p ? `${p[1]} -> ${el ? el[1] : to ? 'Navigate:' + to[1] : '?'}` : null
    }).filter(Boolean).sort()
}

// ── nav (role -> visible items -> routes) ───────────────────────────────────
function navMap() {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/nav.js'), 'utf8')
  const roles = [...src.matchAll(/^\s{2}(\w+):\s*\[([^\]]*)\]/gm)].map((r) => `${r[1]}: ${r[2].replace(/['\s]/g, '')}`)
  const cat = [...src.matchAll(/^\s{2}(\w+):\s*\{[^}]*to:\s*'([^']+)'/gm)].map((r) => `${r[1]} -> ${r[2]}`)
  return { roles: roles.sort(), cat: cat.sort() }
}

// ── lib manifest (rule 3: zero diffs) ───────────────────────────────────────
function libManifest() {
  return fs.readdirSync(path.join(ROOT, LIB_DIR)).filter((f) => /\.jsx?$/.test(f)).sort()
    .map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, LIB_DIR, f))).digest('hex').slice(0, 16)])
}

// ── render ──────────────────────────────────────────────────────────────────
function build() {
  const files = SCAN_DIRS.flatMap((d) => walk(d)).sort()
  const L = []
  L.push('# 9J acceptance checklist — UI census')
  L.push('')
  L.push('Generated by `scripts/ui-census.mjs`. **The sprint cannot close with an unticked row.**')
  L.push('')
  L.push('Sprint 9J changes the skin and nothing else. This file is the proof: every')
  L.push('interactive control and every database touch in the UI layer, recorded by what')
  L.push('it CALLS rather than how it is written, so re-indenting and moving markup cannot')
  L.push('shift it. Re-run `node scripts/ui-census.mjs --check` after every commit; the')
  L.push('diff must be empty, and any genuine markup move must be whitelisted by hand in')
  L.push('that commit message.')
  L.push('')

  let totH = 0, totD = 0
  const rows = []
  const detail = []
  for (const f of files) {
    const r = scanFile(f)
    totH += r.handlers.length; totD += r.db.length
    rows.push(`| \`${f}\` | ${r.handlers.length} | ${r.db.length} | ${r.screens.join(', ') || '—'} | ☐ |`)
    detail.push(`### \`${f}\``)
    if (r.screens.length) detail.push(`screen label: **${r.screens.join(', ')}**`)
    detail.push('')
    detail.push('| control → handler | count |')
    detail.push('| --- | --- |')
    for (const [k, n] of tally(r.handlers)) detail.push(`| \`${k}\` | ${n} |`)
    if (!r.handlers.length) detail.push('| _(no interactive controls)_ | 0 |')
    detail.push('')
    if (r.db.length) {
      detail.push('| database effect | count |')
      detail.push('| --- | --- |')
      for (const [k, n] of tally(r.db)) detail.push(`| \`${k}\` | ${n} |`)
      detail.push('')
    }
    const comps = tally(r.components)
    if (comps.length) { detail.push(`shared primitives: ${comps.map(([k, n]) => `${k}×${n}`).join(', ')}`); detail.push('') }
  }

  L.push(`**Totals: ${files.length} files · ${totH} interactive controls · ${totD} database touches.**`)
  L.push('')
  L.push('## Per-file summary')
  L.push('')
  L.push('| file | controls | db touches | screen label | restyled & ticked |')
  L.push('| --- | ---: | ---: | --- | :---: |')
  L.push(...rows)
  L.push('')

  L.push('## Routes (must not move)')
  L.push('')
  routes().forEach((r) => L.push(`- \`${r}\``))
  L.push('')

  const nav = navMap()
  L.push('## Navigation (role → items, item → route)')
  L.push('')
  nav.roles.forEach((r) => L.push(`- \`${r}\``))
  L.push('')
  nav.cat.forEach((r) => L.push(`- \`${r}\``))
  L.push('')

  L.push('## `src/lib` manifest — sha256, must not change (sprint rule 3)')
  L.push('')
  L.push('| module | sha256 (16) |')
  L.push('| --- | --- |')
  libManifest().forEach(([f, h]) => L.push(`| \`${f}\` | \`${h}\` |`))
  L.push('')

  L.push('## Detail')
  L.push('')
  L.push(...detail)
  return L.join('\n') + '\n'
}

const out = build()
if (process.argv.includes('--check')) {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  // The tick column is the human's to edit, so it is normalised out of the diff.
  const norm = (s) => s.replace(/\| ☑ \|/g, '| ☐ |').split('\n')
  const a = norm(prev), b = norm(out)
  const diffs = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(`  line ${i + 1}\n  - ${a[i] ?? '(absent)'}\n  + ${b[i] ?? '(absent)'}`)
  if (diffs.length) {
    console.error(`CENSUS DRIFT — ${diffs.length} line(s) changed. Skin-only means this diff is empty.\n`)
    console.error(diffs.slice(0, 40).join('\n'))
    process.exit(1)
  }
  console.log('census clean — no control, query or lib hash changed')
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, out)
  console.log(`wrote ${path.relative(ROOT, OUT)}`)
}
