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

// 9D-6 — the surveyed unit resolves to old_model_registry by its EXPLICIT link
// first (survey_entries.registry_id, set by the technician or by AI job #1 and
// accepted by a human) and only then by model string. The string path is kept
// for rows imported before the link existed; the id path is what makes the
// workbook's R/S/T/U/V columns (Surveyed Unit Description, Equivalent AC Model
// Description, T1 BTU, T1 EER, Equivalent SEER) derive from the real nameplate
// instead of the assumed factor.
export const modelKey = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

export function buildRegistryIndex(registry = []) {
  const byId = new Map(), byModel = new Map()
  ;(registry || []).forEach((r) => {
    if (r.id) byId.set(r.id, r)
    if (r.model_no && !byModel.has(modelKey(r.model_no))) byModel.set(modelKey(r.model_no), r)
  })
  return { byId, byModel }
}

export function registryHit(entry, index) {
  if (!index) return null
  if (entry?.registry_id && index.byId.has(entry.registry_id)) return index.byId.get(entry.registry_id)
  const k = modelKey(entry?.model)
  return k ? index.byModel.get(k) || null : null
}

// Old-unit efficiency: prefer the registry's equivalent SEER for the surveyed
// model; otherwise the assumed_old_eff factor (category_hours_factors, 9C).
// Returns { seer, source }.
export function oldEfficiency(entry, index, assumedOldEff) {
  const hit = registryHit(entry, index)
  if (hit && okNum(n(hit.equivalent_seer))) return { seer: n(hit.equivalent_seer), source: 'registry' }
  return { seer: okNum(assumedOldEff) ? assumedOldEff : 8, source: 'assumed' }
}

// Old capacity in BTU: TR x 12000 when the survey captured tonnage, else the
// registry's T1 BTU for that model.
export function oldBtu(entry, index) {
  const tr = n(entry.tr)
  if (okNum(tr) && tr > 0) return tr * 12000
  const hit = registryHit(entry, index)
  return okNum(n(hit?.t1_btu)) ? n(hit.t1_btu) : null
}

// Workbook column L — m² served per ton of installed capacity. One definition,
// used by the survey form and anything that reports it: area / (BTU/12000) / qty.
export function m2PerTon({ room_area, btu, qty }) {
  const a = Number(room_area), b = Number(btu), q = Number(qty) || 1
  if (!(a > 0) || !(b > 0) || !(q > 0)) return null
  return Math.round((a / (b / 12000) / q) * 100) / 100
}

// The project's approved shortlist decides the replacement for a surveyed row
// that has none of its own. Deterministic: best verified savings, then cheapest,
// then a stable id tie-break — the same row always resolves to the same unit.
export function bestFromSelection(row, selCats, consts) {
  let best = null
  for (const cat of selCats) {
    const v = isCompliant(row, cat, consts)
    if (!v.ok) continue
    if (!best) { best = { cat, savPct: v.savPct }; continue }
    // Number(null) is 0, so an UNPRICED unit would rank as the cheapest and
    // always win the tie-break — null must mean "most expensive", not free
    const costOf = (c) => (c.unit_cost == null ? Infinity : Number(c.unit_cost))
    const cost = costOf(cat), bcost = costOf(best.cat)
    const better = v.savPct > best.savPct ||
      (v.savPct === best.savPct && (cost < bcost ||
        (cost === bcost && String(cat.id) < String(best.cat.id))))
    if (better) best = { cat, savPct: v.savPct }
  }
  return best?.cat || null
}

// One computed AC row. `cat` = the linked ac_catalog replacement (may be null).
// Scope rules (TARSHID Instr.): inverter old units and residential buildings
// are OUT of replacement scope — flagged, never silently dropped.
export function computeRow({ entry, cat, building, oh, consts, index, assumedOldEff, replacementSource = null }) {
  const qty = n(entry.qty) || 0
  const eflh = n(oh?.eflh)
  const bt = oldBtu(entry, index)
  const { seer: oldSeer, source: seerSource } = oldEfficiency(entry, index, assumedOldEff)
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
  // the baseline came from the assumed factor, not a real nameplate — visible,
  // never silent (9D-6)
  if (seerSource !== 'registry') flags.push('assumed-eff')

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
    registry_id: entry.registry_id || null,
    catalog_item_id: cat?.id || null,
    // what the SURVEY itself mapped (pre-9D-6 rows and anything set by hand) —
    // kept apart from the effective replacement so the selection engine can seed
    // from real survey decisions rather than from its own output
    row_catalog_item_id: entry.catalog_item_id || null,
    replacement_source: cat ? (replacementSource || 'row') : null,
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
export function computeProject({ entries, buildings, ohRows, acCatalog, registry, consts, assumedOldEff, selection = [] }) {
  const bById = new Map(buildings.map((b) => [b.id, b]))
  const catById = new Map(acCatalog.map((c) => [c.id, c]))
  const index = buildRegistryIndex(registry)
  const ohKey = (bid, st) => `${bid}|${String(st || '').trim().toLowerCase()}`
  const ohMap = new Map((ohRows || []).map((o) => [ohKey(o.building_id, o.space_type), o]))
  // 9D-6 — the replacement is a project-level decision, so a surveyed row with
  // no mapping of its own is resolved against the approved shortlist. A row that
  // already carries one (pre-9D-6, or set deliberately) always wins.
  const selCats = (selection || []).map((s) => (s.catalog_item_id ? catById.get(s.catalog_item_id) : null)).filter(Boolean)

  const rows = entries.filter((e) => e.category === 'ac').map((e) => {
    let cat = e.catalog_item_id ? catById.get(e.catalog_item_id) || null : null
    let replacementSource = cat ? 'row' : null
    if (!cat && selCats.length) {
      const probe = { old_btu: oldBtu(e, index), old_seer: oldEfficiency(e, index, assumedOldEff).seer, equipment_type: e.equipment_type }
      cat = bestFromSelection(probe, selCats, consts)
      if (cat) replacementSource = 'selection'
    }
    return computeRow({
      entry: e, cat, replacementSource,
      building: bById.get(e.building_id),
      oh: ohMap.get(ohKey(e.building_id, e.room_type)),
      consts, index, assumedOldEff,
    })
  })

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

// ---------------------------------------------------------------------------
// PROJECT UNIT SELECTION (9D-4b) — the shortlist written to 'Aprvd Project
// Unit' B2:N21. Consolidation is commercial: fewer distinct models = better
// pricing and simpler procurement, so we greedily pick the model that covers
// the most still-uncovered surveyed units while every unit keeps a COMPLIANT
// replacement (capacity within ±tolerance AND savings ≥ minimum).
// This is the deterministic engine; the AI's proposal is re-verified against
// it and any non-compliant pick is dropped in favour of these results.
// ---------------------------------------------------------------------------
export const MAX_SELECTION_ROWS = 20   // VLOOKUP range is fixed at row 21

// Is `cat` a compliant replacement for a surveyed row? Uses the same math as
// computeRow — no AI claim is trusted without passing this.
export function isCompliant(row, cat, consts) {
  const oldBtu = row.old_btu, oldSeer = row.old_seer
  const newBtu = cat?.capacity_btu == null ? null : Number(cat.capacity_btu)
  const newSeer = cat?.seer == null ? (cat?.ieer == null ? null : Number(cat.ieer)) : Number(cat.seer)
  if (!oldBtu || !oldSeer || !newBtu || !newSeer) return { ok: false, why: 'missing capacity or efficiency' }
  const capPct = ((newBtu - oldBtu) / oldBtu) * 100
  if (Math.abs(capPct) > consts.capacity_tolerance_pct) return { ok: false, why: `capacity ${capPct.toFixed(1)}% outside ±${consts.capacity_tolerance_pct}%` }
  // savings % is independent of qty/EFLH: (newSEER-oldSEER)/newSEER × seasonal
  const savPct = ((newSeer - oldSeer) / newSeer) * consts.seasonal_factor * 100
  if (savPct < consts.min_savings_pct) return { ok: false, why: `savings ${savPct.toFixed(1)}% below ${consts.min_savings_pct}%` }
  const typeOk = !row.equipment_type || !cat.equipment_type ||
    String(cat.equipment_type).trim().toLowerCase().includes(String(row.equipment_type).trim().toLowerCase()) ||
    String(row.equipment_type).trim().toLowerCase().includes(String(cat.equipment_type).trim().toLowerCase())
  if (!typeOk) return { ok: false, why: 'different equipment type' }
  return { ok: true, capPct, savPct }
}

// Canonical description = the VLOOKUP key written to column B. It must match
// the Vstack reference sheet, so we use the catalog's own description verbatim
// when present and fall back to a stable composed string.
export const selectionDescription = (cat) =>
  (cat?.description && String(cat.description).trim()) ||
  [cat?.equipment_type, cat?.make, cat?.model].filter(Boolean).join(' ') || ''

// AC_Savings column W must be a string that exists in column B of the
// selection sheet, or the payback VLOOKUP returns #N/A. The selection is the
// authority: where a row's catalog item is in the selection we adopt the
// selection's wording verbatim. Whatever is left over is a hard blocker.
// The readiness report and the generator both call this — one source of truth.
export function resolveSelectionDescriptions(rows, selection = []) {
  const byCat = new Map(selection.filter((s) => s.catalog_item_id && s.description).map((s) => [s.catalog_item_id, String(s.description).trim()]))
  const descs = new Set(selection.filter((s) => s.description).map((s) => String(s.description).trim()))
  const resolved = rows.map((r) => {
    const d = r.catalog_item_id ? byCat.get(r.catalog_item_id) : null
    return d ? { ...r, new_description: d } : r
  })
  const missing = [...new Set(resolved.map((r) => String(r.new_description || '').trim()).filter((d) => d && !descs.has(d)))]
  return { resolved, missing }
}

// Greedy set-cover over the in-scope rows.
export function proposeSelection({ rows, acCatalog, consts, max = MAX_SELECTION_ROWS }) {
  const targets = rows.filter((r) => r.in_scope && r.old_btu && r.old_seer)
  const compliantFor = new Map()   // entry_id -> [{cat, capPct, savPct}]
  targets.forEach((r) => {
    const list = []
    acCatalog.forEach((c) => {
      const v = isCompliant(r, c, consts)
      if (v.ok) list.push({ cat: c, capPct: v.capPct, savPct: v.savPct })
    })
    compliantFor.set(r.entry_id, list)
  })

  const uncovered = new Set(targets.filter((r) => (compliantFor.get(r.entry_id) || []).length > 0).map((r) => r.entry_id))
  const impossible = targets.filter((r) => (compliantFor.get(r.entry_id) || []).length === 0)
  const chosen = []
  const qtyOf = new Map(targets.map((r) => [r.entry_id, r.qty || 1]))

  // Anything the survey has ALREADY mapped is seeded first: AC_Savings column W
  // is written from the row's own replacement, so a selection that omitted it
  // would leave the payback VLOOKUP unresolved. Seeds must still be compliant.
  // Seed from what the SURVEY mapped, not from what this engine resolved on the
  // last pass — otherwise the selection would seed itself and never change.
  const seedIds = []
  targets.forEach((r) => {
    const own = r.row_catalog_item_id ?? (r.replacement_source == null ? r.catalog_item_id : null)
    if (!own || seedIds.includes(own)) return
    if ((compliantFor.get(r.entry_id) || []).some(({ cat }) => cat.id === own)) seedIds.push(own)
  })

  const take = (cat, covers, savTotal, seeded) => {
    covers.forEach((eid) => uncovered.delete(eid))
    const units = covers.reduce((a, eid) => a + (qtyOf.get(eid) || 1), 0)
    chosen.push({
      catalog_item_id: cat.id,
      description: selectionDescription(cat),
      unit_cost: cat.unit_cost ?? null,
      labor_cost: cat.labor_cost ?? null,
      saso_ref: cat.saso_cert_ref ?? null,
      datasheet_ref: cat.datasheet_ref ?? null,
      covers, units, seeded: !!seeded,
      reason: `${seeded ? 'Already the surveyed replacement for' : 'Covers'} ${covers.length} surveyed line${covers.length === 1 ? '' : 's'} (${units} unit${units === 1 ? '' : 's'}) at ~${Math.round(savTotal / covers.length)}% savings within ±${consts.capacity_tolerance_pct}% capacity`,
    })
  }

  for (const id of seedIds) {
    if (chosen.length >= max) break
    const covers = [], hits = []
    uncovered.forEach((eid) => {
      const hit = (compliantFor.get(eid) || []).find(({ cat }) => cat.id === id)
      if (hit) { covers.push(eid); hits.push(hit) }
    })
    if (!covers.length) continue
    take(hits[0].cat, covers, hits.reduce((a, h) => a + h.savPct, 0), true)
  }

  while (uncovered.size > 0 && chosen.length < max) {
    const score = new Map()   // catalog id -> { cat, covers:[], units, savings }
    uncovered.forEach((eid) => {
      ;(compliantFor.get(eid) || []).forEach(({ cat, savPct }) => {
        const s = score.get(cat.id) || { cat, covers: [], units: 0, sav: 0 }
        s.covers.push(eid); s.units += qtyOf.get(eid) || 1; s.sav += savPct
        score.set(cat.id, s)
      })
    })
    if (score.size === 0) break
    // most units covered, then best average savings, then cheapest
    const best = [...score.values()].sort((a, b) =>
      b.units - a.units ||
      (b.sav / b.covers.length) - (a.sav / a.covers.length) ||
      ((Number(a.cat.unit_cost) || Infinity) - (Number(b.cat.unit_cost) || Infinity)))[0]
    take(best.cat, best.covers, best.sav, false)
  }
  return {
    chosen,
    uncovered: [...uncovered],                 // compliant options exist but the 20-row ceiling was hit
    impossible: impossible.map((r) => r.entry_id),   // no compliant catalog unit at all
    overflow: uncovered.size > 0 && chosen.length >= max,
  }
}

// 9D-4b — the agent PROPOSES, this verifies. Every model the AI picked is
// re-checked against the rows it claims to cover using the same isCompliant()
// the app uses everywhere else; a pick that fails our own ±capacity / ≥savings
// math is dropped, and whatever it leaves uncovered is filled by the
// deterministic set-cover. Nothing unverified is ever shown to the ESCO.
export function verifyAiSelection({ aiSelection = [], groupIndex = [], rows, acCatalog, consts, max = MAX_SELECTION_ROWS }) {
  const catById = new Map(acCatalog.map((c) => [c.id, c]))
  const inScope = rows.filter((r) => r.in_scope)
  const rowById = new Map(inScope.map((r) => [r.entry_id, r]))
  const entriesOf = new Map(groupIndex.map((g) => [g.key, g.entry_ids || []]))

  const chosen = [], dropped = [], covered = new Set()
  for (const pick of aiSelection) {
    const cat = catById.get(pick.catalog_item_id)
    if (!cat) { dropped.push({ description: pick.catalog_item_id, why: 'not an approved catalog unit' }); continue }
    const targets = [...new Set((pick.covers || []).flatMap((k) => entriesOf.get(k) || []))]
      .map((id) => rowById.get(id)).filter(Boolean)
    const ok = [], bad = []
    targets.forEach((r) => { const v = isCompliant(r, cat, consts); (v.ok ? ok : bad).push({ r, why: v.why }) })
    const fresh = ok.filter(({ r }) => !covered.has(r.entry_id))
    if (!ok.length) { dropped.push({ description: selectionDescription(cat), why: bad[0]?.why || 'covers nothing we can verify' }); continue }
    if (bad.length) dropped.push({ description: selectionDescription(cat), partial: true, why: `${bad.length} of ${targets.length} claimed rows failed our check — ${bad[0].why}` })
    if (!fresh.length) continue                       // already covered by an earlier pick
    if (chosen.length >= max) break
    fresh.forEach(({ r }) => covered.add(r.entry_id))
    chosen.push({
      catalog_item_id: cat.id,
      description: selectionDescription(cat),
      unit_cost: cat.unit_cost ?? null,
      labor_cost: cat.labor_cost ?? null,
      saso_ref: cat.saso_cert_ref ?? null,
      datasheet_ref: cat.datasheet_ref ?? null,
      covers: fresh.map(({ r }) => r.entry_id),
      units: fresh.reduce((a, { r }) => a + (r.qty || 1), 0),
      reason: pick.reason || 'Proposed by the assistant, verified against the capacity and savings rules',
      from_ai: true,
    })
  }

  // the deterministic engine fills every row the verified picks did not cover
  const remaining = inScope.filter((r) => !covered.has(r.entry_id))
  const det = proposeSelection({ rows: remaining, acCatalog, consts, max: Math.max(0, max - chosen.length) })
  return {
    chosen: [...chosen, ...det.chosen],
    dropped,
    uncovered: det.uncovered,
    impossible: det.impossible,
    overflow: det.overflow || (chosen.length >= max && remaining.length > 0),
  }
}

// Readiness checklist — every blocker between "survey done" and "clean sheet".
export function readiness({ project, rows, ohRows, entries, template, selection = [], selectionIssues = {} }) {
  const TARSHID_FIELDS = ['entity_poc_name', 'entity_poc_mobile', 'entity_poc_email',
    'tarshid_poc_name', 'tarshid_poc_position', 'tarshid_poc_mobile', 'tarshid_poc_email',
    'entity_name_ar', 'location_lat', 'location_lng']
  const missingProject = TARSHID_FIELDS.filter((f) => project?.[f] == null || String(project[f]).trim() === '')
  const missingHours = (ohRows || []).filter((o) => o.hours_per_year == null).length
  const missingEflh = (ohRows || []).filter((o) => o.eflh == null).length
  // 9D-6 — the technician no longer picks the replacement, so this is no longer
  // "did someone fill the per-row field": it is "does the project's approved
  // shortlist actually resolve a compliant unit for every in-scope surveyed row".
  const needMapping = rows.filter((r) => r.in_scope && !r.catalog_item_id).length
  const needMatching = entries.filter((e) => e.category === 'ac' && !e.registry_id).length
  const noNameplate = entries.filter((e) => e.category === 'ac' && !e.registry_id && !e.photo_nameplate_path).length
  const noCost = rows.filter((r) => r.in_scope && r.flags.includes('no-cost')).length
  const noSpaceType = entries.filter((e) => e.category === 'ac' && !String(e.room_type || '').trim()).length

  const items = [
    { key: 'template', label: 'Saving-sheet template uploaded', count: template ? 0 : 1, blocking: true,
      hint: template ? `Version ${template.version}` : 'Settings → Saving Sheet Template', link: null },
    { key: 'mapping', label: 'Every in-scope AC row resolves to an approved replacement', count: needMapping, blocking: true,
      hint: needMapping
        ? `${needMapping} surveyed row${needMapping === 1 ? ' has' : 's have'} no compliant unit in the project selection — Saving Sheet → Project Unit Selection`
        : 'Resolved from the project unit selection', link: null },
    // Non-blocking on purpose: the assumed_old_eff factor is a documented
    // TARSHID fallback, so an unmatched row still produces a defensible number —
    // it just produces a WEAKER one, and the report says so instead of hiding it.
    { key: 'matching', label: 'AC rows matched to an old-model registry entry', count: needMatching, blocking: false,
      hint: needMatching
        ? `${needMatching} row${needMatching === 1 ? '' : 's'} fall back to the assumed old efficiency — AI assist → Resolve unmatched models`
        : 'Every baseline uses a real nameplate efficiency', link: 'survey' },
    { key: 'nameplate', label: 'Unmatched AC rows carry a nameplate photo', count: noNameplate, blocking: false,
      hint: noNameplate ? 'Without the nameplate the model cannot be identified later — Survey → All entries' : 'Every unmatched row is photographed', link: 'table' },
    { key: 'hours', label: 'Spaces with operating hours', count: missingHours, blocking: true,
      hint: missingHours ? 'Survey → Operating Hours' : 'All spaces have hours', link: 'hours' },
    { key: 'eflh', label: 'Spaces with EFLH', count: missingEflh, blocking: true,
      hint: missingEflh ? 'Survey → Operating Hours (EFLH column)' : 'All spaces have EFLH', link: 'hours' },
    { key: 'space', label: 'AC rows carrying a space type', count: noSpaceType, blocking: true,
      hint: noSpaceType ? 'Edit those entries and set a room type' : 'All rows have a space type', link: 'survey' },
    // 9D-4b — the project's own 'Aprvd Project Unit' shortlist: the payback
    // VLOOKUP resolves against it, so unpriced rows and any AC_Savings
    // description missing from it are hard blockers.
    { key: 'selection', label: 'Project unit selection defined', count: selection.length === 0 ? 1 : 0, blocking: true,
      hint: selection.length === 0 ? 'Saving Sheet → Project Unit Selection → Suggest selection' : `${selection.length} of ${MAX_SELECTION_ROWS} rows used`, link: null },
    { key: 'selection_priced', label: 'Selection rows priced (unit + labor cost)', count: selection.filter((s) => s.description && (s.unit_cost == null || s.labor_cost == null)).length, blocking: true,
      hint: 'Payback cannot be computed without both costs', link: null },
    { key: 'selection_match', label: 'Every proposed unit exists in the selection', count: (selectionIssues.missing || []).length, blocking: true,
      hint: (selectionIssues.missing || []).length ? `Not in the selection: ${(selectionIssues.missing || []).slice(0, 3).join(' · ')}${(selectionIssues.missing || []).length > 3 ? ' …' : ''}` : 'All AC_Savings descriptions resolve', link: null },
    { key: 'selection_overflow', label: 'Selection fits the 20-row sheet limit', count: selectionIssues.overflow ? 1 : 0, blocking: true,
      hint: selectionIssues.overflow ? 'More than 20 distinct models are needed — consolidate; the workbook VLOOKUP only covers rows 2-21' : 'Within the limit', link: null },
    { key: 'cost', label: 'Catalog units priced (unit + labor cost)', count: noCost, blocking: false,
      hint: noCost ? 'Settings → Approved Equipment → import costs' : 'All priced', link: null },
    { key: 'project', label: 'Project TARSHID info complete', count: missingProject.length, blocking: false,
      hint: missingProject.length ? missingProject.map((f) => f.replace(/_/g, ' ')).join(', ') : 'Complete', link: null },
  ]
  return { items, ready: items.every((i) => !i.blocking || i.count === 0) }
}
