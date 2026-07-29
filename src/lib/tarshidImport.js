// 9D-1 — client-side parser for the TARSHID "AC Survey & Savings" workbook and
// the ESCO Survey Working File. Reads sheets BY NAME with tolerant matching
// (both spellings exist in the wild), detects the header row by content (the
// savings workbook has a sparse row 1), maps headers by normalized text, and
// produces UPSERT-ready rows. NEVER deletes; numbers are rounded sanely
// (SEER/EER 2dp, BTU/W integers, costs 2dp).
import { supabase } from './supabase'
import { toLatin } from './format'

// ---- normalizers ------------------------------------------------------------
const normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const normModel = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const normText = (v) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s || null }
// toLatin folds BOTH Arabic-Indic and Persian digits — the local copy this
// replaces only handled Arabic-Indic, so a Persian-digit cell imported as NaN.
const toNum = (v) => {
  if (v == null || v === '') return null
  const n = Number(toLatin(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const r2 = (v) => { const n = toNum(v); return n == null ? null : Math.round(n * 100) / 100 }
const r0 = (v) => { const n = toNum(v); return n == null ? null : Math.round(n) }

// ---- sheet name matching ------------------------------------------------------
const SHEET_ALIASES = {
  oldreg: ['oldmodelregistry'],
  baseline: ['aprvdbaselineunit', 'aprovdbaslineunit', 'approvedbaselineunit', 'aprvdbaslineunit'],
  costsAc: ['aprvdprojectunit', 'approvedprojectunit'],
  costsLight: ['lightselection'],
}
export function findSheet(wb, kind) {
  const names = wb.SheetNames
  return names.find((n) => SHEET_ALIASES[kind].includes(normKey(n))) || null
}

// ---- header detection + row mapping ----------------------------------------
// aoa = array-of-arrays (sheet_to_json header:1). The header row is located by
// content ("Equipment_Type"/"Equipment Type" or "Unit Cost"), NOT assumed at
// row 1 — the savings workbook has a sparse first row.
function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const keys = (aoa[i] || []).map(normKey)
    if (keys.some((k) => k === 'equipmenttype' || k === 'equipmentype') ||
        (keys.some((k) => k === 'unitcost') && keys.some((k) => k === 'description'))) return i
  }
  return -1
}

// header token -> field name, per target
const HEADER_MAPS = {
  oldreg: {
    equipmenttype: 'equipment_type', equipmentype: 'equipment_type', make: 'make',
    modelnoidod: 'model_no', modelno: 'model_no', compressortype: 'compressor_type',
    sizecategory: 'size_category', tr: 'tr',
    t1btuh: 't1_btu', t1btu: 't1_btu', t1w: 't1_w', t1eerbtuhw: 't1_eer', t1eer: 't1_eer',
    t3btuh: 't3_btu', t3btu: 't3_btu', t3w: 't3_w', t3eerbtuhw: 't3_eer', t3eer: 't3_eer',
    equivalentseer: 'equivalent_seer',
    surveyedunitdescription: 'surveyed_unit_description',
    equivalentacmodeldescription: 'equivalent_ac_model_description',
  },
  baseline: {
    description: 'description', equipmenttype: 'equipment_type', equipmentype: 'equipment_type',
    make: 'make', modelnoidod: 'model_no', modelno: 'model_no',
    t1btu: 't1_btu', t1btuh: 't1_btu', t1w: 't1_w', t1eer: 't1_eer', t1eerbtuhw: 't1_eer',
    t3btu: 't3_btu', t3btuh: 't3_btu', t3w: 't3_w', t3eer: 't3_eer', t3eerbtuhw: 't3_eer',
    equivalentseer: 'equivalent_seer',
    referencenameplatephoto: 'nameplate_ref', referencedatasheet: 'datasheet_ref',
  },
  costs: {
    description: 'description', unitcost: 'unit_cost', laborcost: 'labor_cost',
    equipmenttype: 'equipment_type', equipmentype: 'equipment_type', make: 'make',
    modelnoidod: 'model_no', modelno: 'model_no', t1btu: 't1_btu', t1btuh: 't1_btu',
    tr: 'tr', seer: 'seer', ch: 'ch',
    referencesasocertificate: 'saso_cert_ref', referencedatasheet: 'datasheet_ref',
    // totalcost intentionally unmapped (it is a formula column)
  },
}

const NUM_RULES = {
  tr: r2, t1_btu: r0, t1_w: r0, t1_eer: r2, t3_btu: r0, t3_w: r0, t3_eer: r2,
  equivalent_seer: r2, unit_cost: r2, labor_cost: r2, seer: r2,
}

export function parseSheet(XLSX, wb, sheetName, mapKind) {
  const ws = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const hIdx = findHeaderRow(aoa)
  if (hIdx < 0) return { error: `Couldn't locate the header row in "${sheetName}"` }
  const map = HEADER_MAPS[mapKind]
  const colFields = (aoa[hIdx] || []).map((h) => map[normKey(h)] || null)
  const rows = []
  for (let i = hIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] || []
    if (raw.every((v) => String(v ?? '').trim() === '')) continue
    const rec = {}
    colFields.forEach((f, ci) => {
      if (!f) return
      const v = raw[ci]
      rec[f] = NUM_RULES[f] ? NUM_RULES[f](v) : (f === 'model_no' ? normModel(v) : normText(v))
    })
    // skip rows with no usable identity
    if (mapKind === 'costs') { if (!rec.model_no && !rec.description) continue }
    else if (!rec.equipment_type && !rec.model_no) continue
    rows.push(rec)
  }
  return { rows }
}

// ---- diff for the preview step ----------------------------------------------
// Natural key: equipment_type + model_no ('' when blank — matches the DB
// NOT NULL DEFAULT '' unique pair).
export const rowKey = (r) => `${(r.equipment_type || '').toLowerCase()}${normModel(r.model_no || '').toLowerCase()}`
export function diffRows(existing, incoming, fields) {
  const byKey = new Map(existing.map((r) => [rowKey(r), r]))
  const toInsert = [], toUpdate = [], unchanged = []
  const seen = new Set()
  for (const inc of incoming) {
    const k = rowKey(inc)
    if (seen.has(k)) continue // duplicate rows inside the workbook: first wins
    seen.add(k)
    const cur = byKey.get(k)
    if (!cur) { toInsert.push(inc); continue }
    const changed = fields.some((f) => {
      const a = inc[f] ?? null, b = cur[f] ?? null
      if (typeof a === 'number' || typeof b === 'number') return Number(a ?? NaN) !== Number(b ?? NaN) && !(a == null && b == null)
      return (a ?? null) !== (b ?? null)
    })
    if (changed) toUpdate.push({ ...inc, id: cur.id })
    else unchanged.push(inc)
  }
  return { toInsert, toUpdate, unchanged }
}

// ---- batched writes -----------------------------------------------------------
export async function upsertBatches(table, rows, { chunk = 400 } = {}) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk).map(({ id, ...r }) => ({
      ...r, equipment_type: r.equipment_type || '', model_no: r.model_no || '',
    }))
    const { error } = await supabase.from(table).upsert(slice, { onConflict: 'equipment_type,model_no' })
    if (error) return { error, written: i }
  }
  return { written: rows.length }
}

// fetch a whole table past the 1000-row PostgREST page cap; ordered by id so
// range pages stay stable under concurrent writes
export async function fetchAllRows(table, columns = '*') {
  const out = []
  const CH = 1000
  for (let i = 0; ; i += CH) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(i, i + CH - 1)
    if (error) return { error, rows: out }
    out.push(...(data || []))
    if (!data || data.length < CH) break
  }
  return { rows: out }
}
