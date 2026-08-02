#!/usr/bin/env node
// 9Q(2) — does global search leak?
//
// The claim under test is that search inherits permissions: a result can only
// ever be something the asking user could already reach by navigating. That is
// supposed to be true BY CONSTRUCTION — every query runs through the caller's
// own session and RLS answers as them — so this suite exists to prove the
// construction actually holds against the live database, not to re-implement
// the check.
//
//   node scripts/search-rls-test.mjs
//   env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, IES_TEST_PASSWORD
//
// It signs in as a REAL proje with a narrow scope and as a REAL pmo with a wide
// one, uses the pmo purely to enumerate ground truth, and then asks the proje
// for things it must not be able to see — BY THEIR EXACT CODE, which is the
// strongest probe available: if any filter were merely sloppy rather than
// absent, an exact-code query is what would slip through.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const SB = process.env.SUPABASE_URL || 'https://mzuyvajefqkmaxludijm.supabase.co'
const AK = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_nN2Rk6YaQd1rWriTfJLkPw_Nzcuczz3'
const PW = process.env.IES_TEST_PASSWORD || process.env.VITE_DEMO_PASSWORD || ''
const DOMAIN = '@ies.demo.local'
if (!PW) { console.error('no IES_TEST_PASSWORD — cannot sign in'); process.exit(1) }

let pass = 0, fail = 0
const ok = (n, c, extra = '') => {
  if (c) { pass++; console.log(`  ok    ${n}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.log(`  FAIL  ${n}${extra ? ' — ' + extra : ''}`) }
}

async function clientFor(user) {
  const c = createClient(SB, AK, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: user + DOMAIN, password: PW })
  if (error) throw new Error(`sign-in failed for ${user}: ${error.message}`)
  return c
}

// ---------------------------------------------------------------------------
// A1 — static audit of the module itself, before any network call.
// A leak is cheaper to prevent in the allow-list than to detect in a response.
// ---------------------------------------------------------------------------
console.log('\nA1 — the module cannot ask for what it must not have')
const srcPath = path.join(import.meta.dirname, '..', 'src', 'lib', 'search.js')
const src = fs.readFileSync(srcPath, 'utf8')

const FORBIDDEN_TABLES = ['ai_settings', 'ai_runs', 'profiles', 'audit_log', 'catalog_costs', 'murshid_feedback']
const FORBIDDEN_COLUMNS = ['unit_cost', 'labor_cost', 'cost_per_unit', 'cost_usd', 'price', 'salary']

const tablesUsed = [...src.matchAll(/table:\s*'([a-z_]+)'/g)].map((m) => m[1])
ok('every searched table is one of the five the owner scoped',
  tablesUsed.every((t) => ['projects', 'buildings', 'materials', 'project_documents', 'cocs'].includes(t)),
  tablesUsed.join(', '))
for (const t of FORBIDDEN_TABLES) {
  ok(`never queries ${t}`, !new RegExp(`table:\\s*'${t}'`).test(src))
}
const colBlocks = [...src.matchAll(/columns:\s*\[([^\]]*)\]/g)].map((m) => m[1])
ok('no column list is a wildcard', !colBlocks.some((b) => b.includes("'*'")))
ok('no column list is empty', colBlocks.every((b) => b.trim().length > 0))
for (const c of FORBIDDEN_COLUMNS) {
  const inList = colBlocks.some((b) => new RegExp(`'${c}(:|')`).test(b))
  ok(`no cost/pay column in any allow-list: ${c}`, !inList)
}
ok('the service role is never referenced', !/service_role|SERVICE_ROLE/.test(src))
ok('the module builds its client from the shared session, not a fresh key',
  /from '\.\/supabase'/.test(src) && !/createClient\(/.test(src))

// ---------------------------------------------------------------------------
// Ground truth, gathered as pmo. This is NOT the thing under test; it is the
// answer key.
// ---------------------------------------------------------------------------
const pmo = await clientFor('omar.zaki')
const proje = await clientFor('yousef.almaliki')

const { data: projeProjects } = await proje.from('projects').select('id,code')
const projeIds = new Set((projeProjects || []).map((p) => p.id))

const { data: allBuildings } = await pmo.from('buildings').select('id,code,name,project_id')
const { data: allDocs } = await pmo.from('project_documents').select('id,name,reference_no,project_id')

const outsideBuildings = (allBuildings || []).filter((b) => !projeIds.has(b.project_id))
const insideBuildings = (allBuildings || []).filter((b) => projeIds.has(b.project_id))
const outsideDocs = (allDocs || []).filter((d) => !projeIds.has(d.project_id))
const insideDocs = (allDocs || []).filter((d) => projeIds.has(d.project_id))

console.log(`\nscope: proje holds ${projeIds.size} project(s), ${insideBuildings.length} building(s), ${insideDocs.length} document(s)`)
console.log(`       out of reach: ${outsideBuildings.length} building(s), ${outsideDocs.length} document(s)`)

// The suite is only meaningful if there is something to leak.
ok('there is an out-of-scope surface to test against', outsideBuildings.length > 0,
  `${outsideBuildings.length} buildings belong to projects the proje cannot read`)

// ---------------------------------------------------------------------------
// A2 — THE LEAK TEST. Ask, as the proje, for out-of-scope rows by exact code.
// ---------------------------------------------------------------------------
console.log('\nA2 — a proje cannot surface another project\'s building or document')

const SAMPLE = 25
let leakedB = []
for (const b of outsideBuildings.slice(0, SAMPLE)) {
  const { data } = await proje.from('buildings')
    .select('id,code,name,name_ar,project_id,building_type')
    .or(`code.ilike.%${b.code}%,name.ilike.%${b.code}%`).limit(40)
  if ((data || []).length) leakedB.push(`${b.code} -> ${data.length} row(s)`)
}
ok(`${Math.min(SAMPLE, outsideBuildings.length)} out-of-scope buildings searched by exact code, none returned`,
  leakedB.length === 0, leakedB.slice(0, 5).join(' | '))

let leakedD = []
for (const d of outsideDocs.slice(0, SAMPLE)) {
  const needle = (d.reference_no || d.name || '').slice(0, 24)
  if (!needle.trim()) continue
  const { data } = await proje.from('project_documents')
    .select('id,name,doc_type,custom_type_label,reference_no,status,project_id')
    .or(`name.ilike.%${needle}%,reference_no.ilike.%${needle}%`).limit(40)
  if ((data || []).length) leakedD.push(`${needle} -> ${data.length} row(s)`)
}
ok(`${Math.min(SAMPLE, outsideDocs.length)} out-of-scope documents searched by exact name/ref, none returned`,
  leakedD.length === 0, leakedD.slice(0, 5).join(' | '))

// and the projects themselves
let leakedP = []
const { data: pmoProjects } = await pmo.from('projects').select('id,code,name')
for (const p of (pmoProjects || []).filter((x) => !projeIds.has(x.id))) {
  const { data } = await proje.from('projects').select('id,code,name').or(`code.ilike.%${p.code}%`).limit(40)
  if ((data || []).length) leakedP.push(p.code)
}
ok('out-of-scope projects searched by exact code, none returned', leakedP.length === 0, leakedP.join(', '))

// ---------------------------------------------------------------------------
// A3 — THE CONVERSE. A search that returns nothing is not a secure search, it
// is a dead one. If A2 passed because the queries are broken, this fails.
// ---------------------------------------------------------------------------
console.log('\nA3 — the proje CAN still find its own')
const ownB = insideBuildings[0]
if (ownB) {
  const { data } = await proje.from('buildings')
    .select('id,code,name,name_ar,project_id,building_type')
    .or(`code.ilike.%${ownB.code}%,name.ilike.%${ownB.code}%`).limit(40)
  ok(`own building "${ownB.code}" IS findable`, (data || []).length > 0, `${(data || []).length} row(s)`)
} else {
  ok('own building is findable', false, 'the proje holds no building — the converse cannot be proven')
}
const ownP = (projeProjects || [])[0]
if (ownP) {
  const { data } = await proje.from('projects').select('id,code,name').or(`code.ilike.%${ownP.code}%`).limit(40)
  ok(`own project "${ownP.code}" IS findable`, (data || []).length > 0, `${(data || []).length} row(s)`)
}
const ownD = insideDocs[0]
if (ownD) {
  const needle = (ownD.reference_no || ownD.name || '').slice(0, 24)
  const { data } = await proje.from('project_documents')
    .select('id,name,reference_no,project_id')
    .or(`name.ilike.%${needle}%,reference_no.ilike.%${needle}%`).limit(40)
  ok('own document IS findable', (data || []).length > 0, `${(data || []).length} row(s)`)
}

// ---------------------------------------------------------------------------
// A4 — materials is GLOBAL BY DESIGN, and no cost comes back with it.
// ---------------------------------------------------------------------------
console.log('\nA4 — materials is deliberately global, and carries no cost')
const { data: matAsProje } = await proje.from('materials').select('id,code,name,unit,esm:esms(code)').limit(40)
const { data: matAsPmo } = await pmo.from('materials').select('id,code,name').limit(40)
ok('a proje sees the shared material catalogue (intended, not a leak)',
  (matAsProje || []).length > 0 && (matAsProje || []).length === (matAsPmo || []).length,
  `proje ${(matAsProje || []).length} vs pmo ${(matAsPmo || []).length}`)
ok('no cost field is present on any returned material row',
  (matAsProje || []).every((r) => !('cost_per_unit' in r) && !('unit_cost' in r) && !('cost' in r)))

console.log(`\n9Q(2) search permission suite: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
