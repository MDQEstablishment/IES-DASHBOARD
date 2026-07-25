// 9D-3 — TARSHID saving-sheet math + readiness, decoded from the real
// "AC Survey & Savings" workbook. All arithmetic lives here in JS so the app
// can show the numbers BEFORE the workbook is generated (and independently of
// Excel recomputation). Constants come from tarshid_constants — never
// hardcoded (defaults below are only a last-resort fallback).
import { supabase } from './supabase'

export const CONST_DEFAULTS = {
  tariff_sar_kwh: 0.32,
  seasonal_factor: 0.9,
  capacity_tolerance_pct: 10,
  min_savings_pct: 15,
}

export async function loadConstants() {
  const { data, error } = await supabase.from('tarshid_constants').select('key,value')
  if (error || !data) return { ...CONST_DEFAULTS }
  const out = { ...CONST_DEFAULTS }
  data.forEach((r) => { if (r.key in out) out[r.key] = Number(r.value) })
  return out
}

const n = (v) => (v == null || v === '' ? null : Number(v))
const okNum = (v) => typeof v === 'number' && Number.isFinite(v)

// Old-unit efficiency: prefer the registry's equivalent SEER for the surveyed
// model; otherwise the assumed_old_eff factor (category_hours_factors, 9C).
// Returns { seer, source }.
export function oldEfficiency(entry, registryByModel, assumedOldEff) {
  const key = String(entry.model || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const hit = key ? registryByModel.get(key) : null
  if (hit && okNum(n(hit.equivalent_seer))) return { seer: n(hit.equivalent_seer), source: 'registry' }
  return { seer: okNum(assumedOldEff) ? assumedOldEff : 8, source: 'assumed' }
}

// Old capacity in BTU: TR x 12000 when the survey captured tonnage, else the
// registry's T1 BTU for that model.
export function oldBtu(entry, registryByModel) {
  const tr = n(entry.tr)
  if (okNum(tr) && tr > 0) return tr * 12000
  const key = String(entry.model || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const hit = key ? registryByModel.get(key) : null
  return okNum(n(hit?.t1_btu)) ? n(hit.t1_btu) : null
}

// One computed AC row. `cat` = the linked ac_catalog replacement (may be null).
// Scope rules (TARSHID Instr.): inverter old units and residential buildings
// are OUT of replacement scope — flagged, never silently dropped.
export function computeRow({ entry, cat, building, oh, consts, registryByModel, assumedOldEff }) {
  const qty = n(entry.qty) || 0
  const eflh = n(oh?.eflh)
  const bt = oldBtu(entry, registryByModel)
  const { seer: oldSeer, source: seerSource } = oldEfficiency(entry, registryByModel, assumedOldEff)
  const newSeer = cat ? (n(cat.seer) ?? n(cat.ieer)) : null
  const newBtu = cat ? n(cat.capacity_btu) : null

  const residential = !!building?.is_residential
  const inverter = entry.inverter === true
  const inScope = !residential && !inverter

  const flags = []
  if (residential) flags.push('residential')
  if (inverter) flags.push('inverter')
  if (!cat) flags.push('no-replacement')
  if (!okNum(eflh)) flags.push('no-eflh')
  if (!okNum(bt)) flags.push('no-capacity')

  let baseline = null, savings = null, savingsPct = null, capacityCheck = null, payback = null
  if (inScope && okNum(eflh) && okNum(bt) && okNum(oldSeer) && oldSeer > 0 && qty > 0) {
    baseline = (bt / oldSeer / 1000) * qty * eflh
    if (okNum(newSeer) && newSeer > 0) {
      savings = ((newSeer - oldSeer) / (newSeer * oldSeer)) * (bt / 1000) * qty * consts.seasonal_factor * eflh
      savingsPct = baseline > 0 ? (savings / baseline) * 100 : null
      const cost = (n(cat?.unit_cost) ?? null) != null && (n(cat?.labor_cost) ?? null) != null
        ? n(cat.unit_cost) + n(cat.labor_cost) : null
      if (cost != null && okNum(savings) && savings > 0 && consts.tariff_sar_kwh > 0) {
        payback = (qty * cost) / (savings * consts.tariff_sar_kwh)
      }
    }
    if (okNum(newBtu) && okNum(bt) && bt > 0) capacityCheck = ((newBtu - bt) / bt) * 100
  }

  if (savingsPct != null && savingsPct < consts.min_savings_pct) flags.push('low-savings')
  if (capacityCheck != null && Math.abs(capacityCheck) > consts.capacity_tolerance_pct) flags.push('capacity-out')
  if (cat && entry.equipment_type && cat.equipment_type &&
      String(cat.equipment_type).trim().toLowerCase() !== String(entry.equipment_type).trim().toLowerCase()) {
    flags.push('type-mismatch')
  }
  if (cat && (n(cat.unit_cost) == null || n(cat.labor_cost) == null)) flags.push('no-cost')

  return {
    entry_id: entry.id,
    building_id: entry.building_id,
    building_code: building?.code || '',
    building_name: building?.name || '',
    floor: entry.floor || '',
    space_type: (entry.room_type || '').trim(),
    room_area: n(entry.room_area),
    qty,
    equipment_type: entry.equipment_type || '',
    make: entry.make || '',
    size_category: entry.size_category || '',
    model: entry.model || '',
    description: [entry.make, entry.model, entry.tr ? `${entry.tr} TR` : null].filter(Boolean).join(' ') || (entry.equipment_type || ''),
    old_btu: bt, old_seer: oldSeer, old_seer_source: seerSource,
    new_description: cat ? [cat.description || cat.equipment_type, cat.make, cat.model].filter(Boolean).join(' · ') : '',
    new_btu: newBtu, new_seer: newSeer,
    unit_cost: n(cat?.unit_cost), labor_cost: n(cat?.labor_cost),
    eflh, oh_ref: oh?.ref_string || '',
    start_time: oh?.start_time || null, end_time: oh?.end_time || null,
    days_per_week: oh?.days_per_week ?? null, weeks_per_year: oh?.weeks_per_year ?? null,
    in_scope: inScope, baseline_kwh: baseline, savings_kwh: savings,
    savings_pct: savingsPct, capacity_check_pct: capacityCheck, payback_years: payback,
    flags,
  }
}

// Whole-project computation: entries + OH + catalogs -> rows + totals.
export function computeProject({ entries, buildings, ohRows, acCatalog, registry, consts, assumedOldEff }) {
  const bById = new Map(buildings.map((b) => [b.id, b]))
  const catById = new Map(acCatalog.map((c) => [c.id, c]))
  const registryByModel = new Map(
    (registry || []).filter((r) => r.model_no).map((r) => [String(r.model_no).replace(/\s+/g, ' ').trim().toLowerCase(), r]))
  const ohKey = (bid, st) => `${bid}|${String(st || '').trim().toLowerCase()}`
  const ohMap = new Map((ohRows || []).map((o) => [ohKey(o.building_id, o.space_type), o]))

  const rows = entries.filter((e) => e.category === 'ac').map((e) => computeRow({
    entry: e,
    cat: e.catalog_item_id ? catById.get(e.catalog_item_id) || null : null,
    building: bById.get(e.building_id),
    oh: ohMap.get(ohKey(e.building_id, e.room_type)),
    consts, registryByModel, assumedOldEff,
  }))

  const inScope = rows.filter((r) => r.in_scope)
  const totals = {
    rows: rows.length,
    in_scope: inScope.length,
    excluded: rows.length - inScope.length,
    units: rows.reduce((a, r) => a + (r.qty || 0), 0),
    baseline_kwh: inScope.reduce((a, r) => a + (r.baseline_kwh || 0), 0),
    savings_kwh: inScope.reduce((a, r) => a + (r.savings_kwh || 0), 0),
    violations: rows.filter((r) => r.flags.some((f) => ['low-savings', 'capacity-out', 'type-mismatch'].includes(f))).length,
  }
  totals.savings_pct = totals.baseline_kwh > 0 ? (totals.savings_kwh / totals.baseline_kwh) * 100 : null
  return { rows, totals }
}

// Readiness checklist — every blocker between "survey done" and "clean sheet".
export function readiness({ project, rows, ohRows, entries, template }) {
  const TARSHID_FIELDS = ['entity_poc_name', 'entity_poc_mobile', 'entity_poc_email',
    'tarshid_poc_name', 'tarshid_poc_position', 'tarshid_poc_mobile', 'tarshid_poc_email',
    'entity_name_ar', 'location_lat', 'location_lng']
  const missingProject = TARSHID_FIELDS.filter((f) => project?.[f] == null || String(project[f]).trim() === '')
  const missingHours = (ohRows || []).filter((o) => o.hours_per_year == null).length
  const missingEflh = (ohRows || []).filter((o) => o.eflh == null).length
  const needMapping = entries.filter((e) => e.category === 'ac' && !e.catalog_item_id).length
  const noCost = rows.filter((r) => r.in_scope && r.flags.includes('no-cost')).length
  const noSpaceType = entries.filter((e) => e.category === 'ac' && !String(e.room_type || '').trim()).length

  const items = [
    { key: 'template', label: 'Saving-sheet template uploaded', count: template ? 0 : 1, blocking: true,
      hint: template ? `Version ${template.version}` : 'Settings → Saving Sheet Template', link: null },
    { key: 'mapping', label: 'AC survey rows with an approved replacement mapped', count: needMapping, blocking: true,
      hint: needMapping ? 'Survey → All entries → filter "Needs mapping"' : 'All mapped', link: 'survey' },
    { key: 'hours', label: 'Spaces with operating hours', count: missingHours, blocking: true,
      hint: missingHours ? 'Survey → Operating Hours' : 'All spaces have hours', link: 'hours' },
    { key: 'eflh', label: 'Spaces with EFLH', count: missingEflh, blocking: true,
      hint: missingEflh ? 'Survey → Operating Hours (EFLH column)' : 'All spaces have EFLH', link: 'hours' },
    { key: 'space', label: 'AC rows carrying a space type', count: noSpaceType, blocking: true,
      hint: noSpaceType ? 'Edit those entries and set a room type' : 'All rows have a space type', link: 'survey' },
    { key: 'cost', label: 'Replacement units priced (unit + labor cost)', count: noCost, blocking: false,
      hint: noCost ? 'Settings → Approved Equipment → import costs' : 'All priced', link: null },
    { key: 'project', label: 'Project TARSHID info complete', count: missingProject.length, blocking: false,
      hint: missingProject.length ? missingProject.map((f) => f.replace(/_/g, ' ')).join(', ') : 'Complete', link: null },
  ]
  return { items, ready: items.every((i) => !i.blocking || i.count === 0) }
}
