/**
 * Capitalisation audit — the inventory, reproducible.
 *
 * This lands BEFORE any string is changed, on purpose. The sprint plan quoted
 * "247 violations across 28 files", and that number came from an extractor of
 * mine. Two of my extractors were wrong on the same day this was written: one
 * reported an empty tree because a heredoc ate its stdin, another asserted
 * against a shared-string table in a way that could only ever pass. A number
 * nobody can re-derive is a claim, not a finding — so the tool ships first and
 * the fixes follow it.
 *
 *   node scripts/audit-capitalisation.mjs          # summary
 *   node scripts/audit-capitalisation.mjs --full   # every violation, by file
 *   node scripts/audit-capitalisation.mjs --json   # machine-readable
 *
 * THE RULE (docs/Constraints.md is the prose; this is the executable form)
 *
 *   Title Case  page titles and kickers, tab labels, button labels, card and
 *               section headers, table column headers, KPI labels, modal
 *               titles, form field labels
 *   sentence    helper text, empty states, validation messages, toasts,
 *               placeholders, tooltips, aria-labels
 *   exempt      acronyms, SI/currency units, codes, brand names, and status
 *               badges rendered as micro-chips
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Never re-cased. A unit that loses its case stops being the unit: kWh is not
// Kwh, and m² is not M².
export const ACRONYMS = new Set([
  'ESM', 'ESMS', 'COC', 'COCS', 'BOQ', 'TARSHID', 'PMO', 'IES', 'SKU', 'SASO',
  'SEER', 'IEER', 'EER', 'BTU', 'TR', 'PO', 'AC', 'LED', 'CCT', 'DIP', 'TDS',
  'WIR', 'MIR', 'ID', 'OD', 'AI', 'PDF', 'KSA', 'SR', 'REV', 'SRC', 'CONF',
  'ESC', 'TOK', 'VLOOKUP', 'COL', 'LUX', 'MAND', 'T1', 'T3', 'CEO',
  'RFI', 'NCR', 'FAT', 'SAT', 'EPC', 'KPI', 'UI', 'URL',
])
export const UNITS = new Set(['kWh', 'm²', 'W', 'K', 'lm', 'SAR', 'kW', 'Btu/h', 'm2'])

// ALL-CAPS that is a status/annotation BADGE, not a heading or a label. These
// are the one place caps is doing a job — the same job the status pill does —
// and they are listed by name so the exemption is explicit rather than a
// judgement made at edit time.
export const BADGE_EXEMPT = new Set([
  'PROPOSES · YOU DECIDE', 'FROM MEMORY', 'CACHE READ', 'VIEWING',
  'RESIDENTIAL · EXCLUDED', 'ASSISTANT · VERIFIED', 'PROJECT DECISION',
  'KINGDOM OF SAUDI ARABIA', 'NO ENTRIES', 'FAILED', 'REFUSED', 'MENTION',
  'CLICK A MARKER FOR CONTRACTOR INFO', 'C&H',
  // Added when the gate caught the focal picker's own two chips. Both are the
  // same device as the entries above — mono, ~10px, letterspaced, one on a
  // dark pill and one an empty-state micro-label beside 'NO ENTRIES'. Exempted
  // on that ground, not because they were mine.
  'DRAG · ARROW KEYS', 'NO PHOTO',
])

const isAllCaps = (t) => {
  const letters = t.replace(/[^A-Za-z]/g, '')
  return letters.length > 1 && letters === letters.toUpperCase()
}
/** Every word is an acronym or a unit, so the string is exempt as a whole. */
const allExempt = (t) => {
  const words = t.match(/[A-Za-z0-9²]+/g)
  if (!words) return true
  return words.every((w) => ACRONYMS.has(w.toUpperCase()) || UNITS.has(w))
}
export const isViolation = (t) => {
  const s = t.trim()
  if (!s || BADGE_EXEMPT.has(s)) return false
  if (/^[A-Z]{2,6}-\d/.test(s)) return false          // codes like MDQRE-B0001
  return isAllCaps(s) && !allExempt(s)
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsx')) out.push(p)
  }
  return out
}

export function audit() {
  const files = walk(path.join(ROOT, 'src')).sort()
  const byFile = {}
  const byText = {}
  let total = 0

  for (const abs of files) {
    const rel = path.relative(ROOT, abs)
    const src = fs.readFileSync(abs, 'utf8')
    const hits = new Map()   // text -> kind

    const add = (t, kind) => {
      const s = t.replace(/\s+/g, ' ').trim()
      if (!isViolation(s)) return
      if (!hits.has(s)) hits.set(s, kind)
      ;(byText[s] ||= new Set()).add(rel)
    }

    // table column headers
    for (const m of src.matchAll(/<th\b[^>]*>\s*([^<>{}]+?)\s*<\/th>/gs)) add(m[1], 'table header')
    // visible element text
    for (const m of src.matchAll(/>\s*([A-Z][A-Z0-9 ·/&().\-']{3,44})\s*</g)) add(m[1], 'caption')
    // label props — aria-label deliberately NOT included: it is not visible text
    for (const m of src.matchAll(/\blabel="([^"]{2,44})"/g)) add(m[1], 'label')
    for (const m of src.matchAll(/\blabel:\s*'([^']{2,44})'/g)) add(m[1], 'tab label')

    if (hits.size) {
      byFile[rel] = [...hits].map(([text, kind]) => ({ text, kind })).sort((a, b) => a.text.localeCompare(b.text))
      total += hits.size
    }
  }

  // the same concept written two ways — a finding in its own right
  const conflicts = {}
  const lower = {}
  for (const [text, filesSet] of Object.entries(byText)) lower[text.toLowerCase()] = true
  const seen = {}
  for (const abs of files) {
    const rel = path.relative(ROOT, abs)
    const src = fs.readFileSync(abs, 'utf8')
    for (const m of src.matchAll(/<th\b[^>]*>\s*([^<>{}]+?)\s*<\/th>/gs)) {
      const t = m[1].replace(/\s+/g, ' ').trim()
      if (!t) continue
      ;((seen[t.toLowerCase()] ||= {})[t] ||= new Set()).add(rel)
    }
  }
  for (const [key, forms] of Object.entries(seen)) {
    if (Object.keys(forms).length > 1) {
      conflicts[key] = Object.fromEntries(Object.entries(forms).map(([f, s]) => [f, [...s].sort()]))
    }
  }

  return { total, files: Object.keys(byFile).length, byFile, conflicts }
}

if (process.argv[1] && process.argv[1].endsWith('audit-capitalisation.mjs')) {
  const r = audit()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2))
  } else {
    if (process.argv.includes('--full')) {
      for (const [file, hits] of Object.entries(r.byFile)) {
        console.log(`\n${file}  [${hits.length}]`)
        for (const h of hits) console.log(`    ${h.kind.padEnd(13)} ${h.text}`)
      }
      console.log('\n── same concept, different casing ──')
      for (const [k, forms] of Object.entries(r.conflicts)) {
        console.log(`  "${k}"`)
        for (const [f, files] of Object.entries(forms)) console.log(`      ${f.padEnd(22)} ${files.join(', ')}`)
      }
    }
    console.log(`\nALL-CAPS violations: ${r.total} across ${r.files} files`)
    console.log(`Concepts written two ways: ${Object.keys(r.conflicts).length}`)
  }
}
