// 9Q(2) — global search: the matcher, the entity allow-list, and the query.
//
// ============================================================================
// PERMISSIONS ARE INHERITED BY CONSTRUCTION, NOT BY A CHECK IN THIS FILE.
//
// Every query below runs through the shared `supabase` client — the same one
// useLiveQuery uses — which carries the signed-in user's JWT. There is no
// service-role key anywhere in this bundle (grep it), so search has no way to
// see more than the person typing could already reach by navigating. RLS does
// the work:
//
//     projects           can_read_project(id)
//     buildings          can_read_building(id)
//     project_documents  can_read_project(project_id)
//     cocs               can_read_project(project_id)
//     materials          true          <-- read the note on MATERIALS below
//
// That is deliberately the whole of the access-control story here. A filter in
// application code that has to be correct on every future query is exactly the
// thing this project keeps refusing; the policy is the fence.
// ============================================================================
//
// MATERIALS IS GLOBAL ON PURPOSE — this is a decision, not an oversight.
//
// Every other entity is RLS-scoped to what the caller may reach. `materials` is
// not: its SELECT policy is `true`, so any signed-in member of staff sees all
// 56 rows, and search reflects that faithfully. That is the existing and
// intended design — the material catalogue is a SHARED REFERENCE LIST, like a
// price book without the prices, not project data. A storekeeper needs to look
// up "LED Floodlight 100W" without belonging to a project.
//
// So search does not narrow it and does not pretend to. A later reader finding
// materials results outside their projects is looking at the intended
// behaviour.
//
// THE COLUMN ALLOW-LIST IS THE DEFENCE, AND HERE IT IS THE ONLY ONE.
//
// `materials.cost_per_unit numeric(12,2)` exists (added in 0063). The 0121
// write-ban trigger does NOT cover it — that trigger is attached to
// lighting_catalog and ac_catalog only, so nothing at the database level stops
// a cost being written to a material row. It happens to be NULL on all 56 rows
// today; that is a fact about the data, not a guarantee.
//
// Which means the explicit column list below is not defence in depth on top of
// the trigger — for this table it is the primary defence, and the only reason a
// cost cannot reach a search result. Never add a cost column to any list in
// this file, and never use `*`.

import { supabase } from './supabase'
import { toLatin } from './format'

// ---------------------------------------------------------------------------
// The matcher. EXTRACTED from OldUnitPicker in components/survey/EntryForm.jsx
// (9D-6) rather than reimplemented — one definition, one behaviour. EntryForm
// now imports these, so a change to the tokeniser changes both call sites and
// the two can never drift.
//
// ON "TRANSLITERATION-AWARE", precisely: `toLatin` folds Arabic-Indic and
// Persian DIGITS to Latin, so ٢ and ۲ match 2. It is NOT Arabic-letter to Latin
// transliteration — `masjid` will not match `مسجد`. Arabic queries match
// because the Arabic COLUMNS are searched directly (buildings.name_ar,
// projects.entity_name_ar). Both scripts are searchable; neither is converted
// into the other. See SEARCH_CROSS_SCRIPT in docs/Backlog.md.
// ---------------------------------------------------------------------------

export const UNIT_WORDS = new Set(['tr', 'w', 'watt', 'watts', 'seer', 'eer', 'btu', 'ton', 'tons', 'hrs'])

export const norm = (s) => toLatin(String(s ?? '')).toLowerCase()

// split, drop standalone unit words, peel unit suffixes ('2tr' -> '2')
export function tokenize(q) {
  return norm(q).split(/\s+/).filter(Boolean)
    .filter((t) => !UNIT_WORDS.has(t))
    .map((t) => {
      const m = /^(\d+(?:\.\d+)?)(tr|w|watts?|seer|eer|btu|tons?)$/.exec(t)
      return m ? m[1] : t
    })
}

// A token hits if it appears in the haystack, or — when numeric — if it is
// within ±10% of one of the row's numbers. That tolerance is TARSHID's, and it
// is why '2 TR' finds a row whose stored string never contains "2 TR".
export function tokenHit(hay, nums, t) {
  if (hay.includes(t)) return true
  const n = /^\d+(?:\.\d+)?$/.test(t) ? parseFloat(t) : NaN
  if (Number.isNaN(n)) return false
  return nums.some((v) => v >= n * 0.9 && v <= n * 1.1)
}

// Relevance, cheapest signal first: an exact code beats a prefix, a prefix
// beats a word-start, a word-start beats a substring buried mid-string.
export function scoreOf(hay, code, tokens) {
  const c = norm(code)
  let s = 0
  for (const t of tokens) {
    if (c === t) s += 100
    else if (c.startsWith(t)) s += 50
    else if (new RegExp(`(^|[\\s\\-_/·])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) s += 20
    else if (hay.includes(t)) s += 8
  }
  return s
}

// Every token must hit (AND, not OR): typing more words narrows, which is what
// a person expects and what keeps a two-letter group from being noise.
export function rankRows(rows, q, { hayOf, numsOf = () => [], codeOf = () => '' }, cap) {
  const tokens = tokenize(q)
  if (!tokens.length) return []
  const out = []
  for (const r of rows) {
    const hay = hayOf(r)
    const nums = numsOf(r)
    if (!tokens.every((t) => tokenHit(hay, nums, t))) continue
    out.push({ row: r, score: scoreOf(hay, codeOf(r), tokens) })
  }
  out.sort((a, b) => b.score - a.score || String(codeOf(a.row) || '').localeCompare(String(codeOf(b.row) || '')))
  return out.slice(0, cap).map((x) => x.row)
}

// ---------------------------------------------------------------------------
// The entities. Owner-chosen scope: projects, buildings, materials, documents,
// COCs. Nothing else is reachable from here.
//
// `columns` is an ALLOW-LIST and is never '*'. `ilike` names the columns the
// server-side coarse filter searches. `to` builds the route the result opens.
// ---------------------------------------------------------------------------

export const FORBIDDEN_COLUMNS = [
  'unit_cost', 'labor_cost', 'cost_per_unit', 'cost', 'cost_usd', 'price', 'amount', 'salary', 'rate',
]
export const FORBIDDEN_TABLES = ['ai_settings', 'ai_runs', 'profiles', 'audit_log', 'catalog_costs', 'murshid_feedback']

export const ENTITIES = [
  {
    key: 'projects', label: 'Projects', table: 'projects',
    columns: ['id', 'code', 'name', 'status', 'project_reference_no', 'entity_name_ar'],
    ilike: ['code', 'name', 'project_reference_no', 'entity_name_ar'],
    // soft-deleted projects are not navigable, so they are not findable
    filter: (q) => q.is('deleted_at', null),
    hayOf: (r) => norm([r.code, r.name, r.project_reference_no, r.entity_name_ar].filter(Boolean).join(' ')),
    codeOf: (r) => r.code,
    title: (r) => r.name || r.code,
    sub: (r) => [r.code, r.status].filter(Boolean).join(' · '),
    to: (r) => `/projects/${r.id}`,
  },
  {
    key: 'buildings', label: 'Buildings', table: 'buildings',
    columns: ['id', 'code', 'name', 'name_ar', 'project_id', 'building_type'],
    ilike: ['code', 'name', 'name_ar'],
    hayOf: (r) => norm([r.code, r.name, r.name_ar, r.building_type].filter(Boolean).join(' ')),
    codeOf: (r) => r.code,
    title: (r) => r.name || r.code,
    sub: (r) => [r.code, r.name_ar].filter(Boolean).join(' · '),
    to: (r) => `/projects/${r.project_id}/buildings/${r.id}`,
  },
  {
    key: 'materials', label: 'Materials', table: 'materials',
    // IDENTITY COLUMNS ONLY. cost_per_unit is deliberately absent and must stay
    // absent — see the note at the top of this file.
    columns: ['id', 'code', 'name', 'unit', 'esm:esms(code)'],
    ilike: ['code', 'name'],
    hayOf: (r) => norm([r.code, r.name, r.esm?.code].filter(Boolean).join(' ')),
    codeOf: (r) => r.code,
    title: (r) => r.name || r.code,
    sub: (r) => [r.code, r.esm?.code].filter(Boolean).join(' · '),
    to: () => '/materials',
  },
  {
    key: 'documents', label: 'Documents', table: 'project_documents',
    columns: ['id', 'name', 'doc_type', 'custom_type_label', 'reference_no', 'status', 'project_id'],
    ilike: ['name', 'reference_no', 'custom_type_label'],
    hayOf: (r) => norm([r.name, r.reference_no, r.custom_type_label, r.doc_type].filter(Boolean).join(' ')),
    codeOf: (r) => r.reference_no || '',
    title: (r) => r.name,
    sub: (r) => [r.custom_type_label || r.doc_type, r.reference_no, r.status].filter(Boolean).join(' · '),
    to: (r) => `/projects/${r.project_id}`,
  },
  {
    key: 'cocs', label: 'COCs', table: 'cocs',
    columns: ['id', 'code', 'reference_no', 'status', 'project_id'],
    ilike: ['code', 'reference_no'],
    hayOf: (r) => norm([r.code, r.reference_no, r.status].filter(Boolean).join(' ')),
    codeOf: (r) => r.code,
    title: (r) => r.code || r.reference_no,
    sub: (r) => [r.reference_no, r.status].filter(Boolean).join(' · '),
    to: (r) => `/projects/${r.project_id}`,
  },
]

// Self-audit, asserted by the test suite rather than trusted: no wildcard, no
// forbidden column, no forbidden table.
export function auditEntities() {
  const problems = []
  for (const e of ENTITIES) {
    if (FORBIDDEN_TABLES.includes(e.table)) problems.push(`${e.key}: forbidden table ${e.table}`)
    if (!e.columns.length || e.columns.includes('*')) problems.push(`${e.key}: wildcard or empty column list`)
    for (const c of e.columns) {
      const bare = String(c).split(':')[0]
      if (FORBIDDEN_COLUMNS.includes(bare)) problems.push(`${e.key}: forbidden column ${bare}`)
    }
    for (const c of e.ilike) if (!e.columns.includes(c)) problems.push(`${e.key}: ilike column ${c} not in the allow-list`)
  }
  return problems
}

export const MIN_QUERY_CHARS = 2
export const SERVER_LIMIT = 40     // rows pulled per entity, before ranking
export const PER_GROUP = 5         // rows shown per entity, after ranking

// ---------------------------------------------------------------------------
// The query. Two stages, because the tokeniser above cannot be expressed in
// PostgREST:
//
//   1. server — one coarse ILIKE across the entity's text columns, capped at
//      SERVER_LIMIT. This is what stops a two-letter query pulling 815
//      buildings over the wire.
//   2. client — the tokenised, numeric-aware matcher ranks what came back and
//      keeps PER_GROUP.
//
// The honest cost of that split: recall is bounded by the coarse filter, so a
// row the matcher WOULD rank can be missed if the raw string never contains the
// first token. Multi-token queries use the longest token for recall, which is
// the most selective one available.
// ---------------------------------------------------------------------------
export async function runSearch(q, { signal } = {}) {
  const query = String(q ?? '').trim()
  if (query.length < MIN_QUERY_CHARS) return []

  const tokens = tokenize(query)
  if (!tokens.length) return []
  const recall = tokens.slice().sort((a, b) => b.length - a.length)[0]
  const esc = recall.replace(/[%,()]/g, ' ').trim()
  if (!esc) return []

  const groups = await Promise.all(ENTITIES.map(async (e) => {
    try {
      let sel = supabase.from(e.table).select(e.columns.join(','))
      if (e.filter) sel = e.filter(sel)
      sel = sel.or(e.ilike.map((c) => `${c}.ilike.%${esc}%`).join(',')).limit(SERVER_LIMIT)
      const { data, error } = await sel
      // A denied or failed read is simply an ABSENT group — it never breaks the
      // whole search. Same rule the مُرشد handler uses for its context packs.
      if (error || !data) return { ...e, rows: [] }
      return { ...e, rows: rankRows(data, query, e, PER_GROUP) }
    } catch {
      return { ...e, rows: [] }
    }
  }))

  if (signal?.aborted) return []
  return groups.filter((g) => g.rows.length > 0)
}
