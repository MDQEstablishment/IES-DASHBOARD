// U3 — the LIGHTING savings engine, which did not exist anywhere before this
// commit. Decoded from TARSHID's own Lighting + Lighting Control workbook and
// written to match it term for term, because §0 rules that the delivered file
// is TARSHID's own workbook recomputing TARSHID's own formulas: anything this
// module computes differently is a mismatch the §0.1(4) gate will wall.
//
// THE WORKBOOK'S COLUMNS (Light_Savings, header row 11), so the names below
// can be checked against the artefact rather than trusted:
//
//   G  Operating Hour                          I  Fix Quantity
//   K  LED/CONV                                L  Lamp/Fix
//   M  Lamp Load (W)                           N  Fix Wattage      = L x M
//   O  Lamp Qty            = I x L             P  Total Load [kW]  = I x N / 1000
//   Q  Baseline Energy Consumption (kWh)       = P x G
//   R  Project Unit Description  ("No-Retrofit" excludes the row)
//   S..W  the same chain for the project unit  X  Total Load [kW] (project)
//   Y  Energy Consumption of Project Lighting Units (kWh)
//   Z  Energy Savings (kWh)
//   AB Is there a light control?   AC Sensors Qty
//   AD Control - Baselined kWh     AE Control - Savings kWh
//
// TWO CONSTANTS, EXTRACTED FROM THE WORKBOOK'S OWN FORMULAS rather than
// assumed. The relationships, which are TARSHID's model and not any client's
// data:
//
//   Z  = (Q - Y) x lighting_derating                    -> lighting_derating = 0.9
//   AE = AD x control_derating x control_savings_fraction
//                                                       -> 0.9 x 0.3 = 0.27
//
// So savings are NOT (baseline - project); they are that difference DERATED.
//
// PROVENANCE, stated plainly: both ratios were originally read off an approved
// TARSHID workbook's cached summary, to full float precision. That artefact was
// a client-supplied document and has been removed under Constraints #7, so the
// independent witness no longer lives in this repository — the constants stand
// as extracted and seeded in `tarshid_constants`, and the confirmation returns
// when a genuinely blank template or an anonymised derivative arrives. The
// tests hold a drift guard, not a witness (tests/lightingSavings.test.mjs).
//
// THE ASYMMETRY, DELIBERATE: lighting baselines on OPERATING HOURS
// (operating_hours.hours_per_year), while AC baselines on EFLH. That is not an
// oversight to be tidied — the AC workbook takes EFLH from TARSHID's regional
// calculator because a compressor does not run whenever the room is occupied,
// whereas a lamp is either on or off with the space. The workbook says hours
// for lighting; the design preserves it (§5 U3) and so does this module. Do not
// "fix" it by reaching for eflh.
import { CONST_DEFAULTS } from './savingSheet'

const n = (v) => (v == null || v === '' ? null : Number(v))
const okNum = (v) => typeof v === 'number' && Number.isFinite(v)
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

// The registry's key is the surveyed unit description, and 0134 imports it
// VERBATIM — including the lower-case "1x" on sheet row 315. So the exact
// string is authoritative and a whitespace-collapsed form is only a fallback,
// never a rewrite. Same rule as the AC registry key in savingSheet.js.
export function buildLightingIndex(registry = []) {
  const byId = new Map(), byDesc = new Map(), byDescLoose = new Map(), looseAmbiguous = new Set()
  ;(registry || []).forEach((r) => {
    if (r.id) byId.set(r.id, r)
    const d = r.surveyed_unit_description
    if (d == null || d === '') return
    if (!byDesc.has(d)) byDesc.set(d, r)
    const loose = norm(d).toLowerCase()
    if (byDescLoose.has(loose) && byDescLoose.get(loose) !== r) looseAmbiguous.add(loose)
    else if (!byDescLoose.has(loose)) byDescLoose.set(loose, r)
  })
  return { byId, byDesc, byDescLoose, looseAmbiguous }
}

export function lightingRegistryHit(entry, index) {
  if (!index) return null
  if (entry?.registry_id && index.byId.has(entry.registry_id)) return index.byId.get(entry.registry_id)
  const d = entry?.baseline_unit_description ?? entry?.model
  if (d == null || d === '') return null
  const exact = index.byDesc.get(d)
  if (exact) return exact
  const loose = norm(d).toLowerCase()
  if (index.looseAmbiguous.has(loose)) return null
  return index.byDescLoose.get(loose) || null
}

// The BASELINE FITTING, and where it came from.
//
// §0.5 corrected the design here: the lighting baseline is the CANONICAL
// FITTING from TARSHID's 344-row registry, not the raw surveyed wattage. The
// registry wins whenever the surveyed unit resolves to it, and its provenance
// is 'registry'. Only when it does not do we fall back to what the surveyor
// wrote, and that fallback is labelled 'assumed' so it prints as assumed on the
// sheet remarks and in Murshid's draft (§7.4) instead of passing for measured.
//
// A row that resolves to nothing AND carries no surveyed load is the
// TARSHID-escalation blocker (§9): named, not guessed at. It comes back with
// lamps/load null and the 'no-baseline-fitting' flag, and U4 promotes that flag
// to a hard readiness item.
export function resolveBaselineFitting(entry, index) {
  const hit = lightingRegistryHit(entry, index)
  if (hit) {
    return {
      source: 'registry',
      provenance: 'measured',
      description: hit.surveyed_unit_description,
      lamps_per_fixture: okNum(n(hit.lamps_per_fixture)) ? n(hit.lamps_per_fixture) : null,
      lamp_load_w: okNum(n(hit.wattage_w)) ? n(hit.wattage_w) : null,
      conv_led: hit.conv_led || null,
      registry_id: hit.id || null,
    }
  }
  const lamps = okNum(n(entry?.lamps_per_fixture)) ? n(entry.lamps_per_fixture) : null
  const load = okNum(n(entry?.lamp_load_w)) ? n(entry.lamp_load_w)
    : (okNum(n(entry?.wattage)) && okNum(lamps) && lamps > 0 ? n(entry.wattage) / lamps : n(entry?.wattage))
  if (!okNum(load)) {
    return { source: 'none', provenance: null, description: null, lamps_per_fixture: null, lamp_load_w: null, conv_led: null, registry_id: null }
  }
  return {
    source: 'surveyed',
    provenance: 'assumed',
    description: entry?.model || null,
    lamps_per_fixture: lamps ?? 1,
    lamp_load_w: load,
    conv_led: null,
    registry_id: null,
  }
}

// Conv -> LED or LED -> LED, from the registry's own Conv./LED column. The
// workbook keys its two replacement ESMs off exactly this (Light_Savings K).
export const esmOf = (convLed) => (String(convLed ?? '').trim().toLowerCase() === 'led' ? 'LED' : 'Conv')

// ── ONE LIGHTING ROW ────────────────────────────────────────────────────────
// Every line below is the workbook column named beside it.
export function computeLightingRow({ entry, sel, oh, consts, index }) {
  const C = { ...CONST_DEFAULTS, ...(consts || {}) }
  const fixQty = n(entry?.qty) || 0                                  // I
  const hours  = n(oh?.hours_per_year)                               // G — HOURS, not EFLH
  const base   = resolveBaselineFitting(entry, index)

  const flags = []
  if (base.source === 'none') flags.push('no-baseline-fitting')
  if (base.source === 'surveyed') flags.push('assumed-fitting')
  if (!okNum(hours)) flags.push('no-operating-hours')
  if (!sel) flags.push('no-replacement')
  if (!(fixQty > 0)) flags.push('no-qty')

  // baseline chain
  const bLampPerFix = base.lamps_per_fixture                          // L
  const bLampLoad   = base.lamp_load_w                                // M
  const bFixWatt    = okNum(bLampPerFix) && okNum(bLampLoad) ? bLampPerFix * bLampLoad : null   // N = L x M
  const bLampQty    = okNum(bLampPerFix) ? fixQty * bLampPerFix : null                          // O = I x L
  const bLoadKw     = okNum(bFixWatt) ? (fixQty * bFixWatt) / 1000 : null                       // P = I x N / 1000
  const baselineKwh = okNum(bLoadKw) && okNum(hours) ? bLoadKw * hours : null                   // Q = P x G

  // project chain — same shape, the selected LED fitting's numbers
  const pLampPerFix = sel ? (okNum(n(sel.lamps_per_fixture)) ? n(sel.lamps_per_fixture) : bLampPerFix) : null   // S
  const pLampLoad   = sel ? (n(sel.lamp_load_w) ?? n(sel.wattage) ?? null) : null                               // U
  const pFixWatt    = okNum(pLampPerFix) && okNum(pLampLoad) ? pLampPerFix * pLampLoad : null                   // W
  const pLampQty    = okNum(pLampPerFix) ? fixQty * pLampPerFix : null                                          // V — the BOQ
  const pLoadKw     = okNum(pFixWatt) ? (fixQty * pFixWatt) / 1000 : null                                       // X
  const projectKwh  = okNum(pLoadKw) && okNum(hours) ? pLoadKw * hours : null                                   // Y

  // Z — DERATED, per the artefact's own Z10 / (Q10 - Y10) = 0.9
  const savingsKwh = okNum(baselineKwh) && okNum(projectKwh)
    ? (baselineKwh - projectKwh) * C.lighting_derating : null

  // AD / AE — the control ESM. IF(control = yes, baseline - savings, 0): the
  // control acts on what is left AFTER the lamp swap, and only where control
  // was actually installed. has_control is per row (§9) — no building-level
  // shortcut invents savings for rooms that got none.
  const hasControl = entry?.has_control === true
  const controlBaselineKwh = hasControl && okNum(baselineKwh) && okNum(savingsKwh)
    ? baselineKwh - savingsKwh : 0                                                             // AD
  const controlSavingsKwh = controlBaselineKwh * C.control_derating * C.control_savings_fraction // AE
  const sensorsQty = hasControl ? (n(entry?.sensors_qty) ?? fixQty) : 0                          // AC

  return {
    entry_id: entry?.id ?? null,
    building_id: entry?.building_id ?? null,
    floor: entry?.floor || '',
    space_type: (entry?.room_type || '').trim(),
    fix_qty: fixQty,
    operating_hours: hours,
    baseline_description: base.description,
    baseline_source: base.source,
    baseline_provenance: base.provenance,
    registry_id: base.registry_id,
    esm: esmOf(base.conv_led),
    baseline_lamps_per_fixture: bLampPerFix,
    baseline_lamp_load_w: bLampLoad,
    baseline_fixture_wattage: bFixWatt,
    baseline_lamp_qty: bLampQty,
    baseline_load_kw: bLoadKw,
    baseline_kwh: baselineKwh,
    project_description: sel?.description ?? sel?.model ?? null,
    project_lamps_per_fixture: pLampPerFix,
    project_lamp_load_w: pLampLoad,
    project_fixture_wattage: pFixWatt,
    project_lamp_qty: pLampQty,
    project_load_kw: pLoadKw,
    project_kwh: projectKwh,
    savings_kwh: savingsKwh,
    savings_pct: okNum(baselineKwh) && baselineKwh > 0 && okNum(savingsKwh) ? (savingsKwh / baselineKwh) * 100 : null,
    has_control: hasControl,
    sensors_qty: sensorsQty,
    control_baseline_kwh: controlBaselineKwh,
    control_savings_kwh: controlSavingsKwh,
    retrofit: !!sel,
    flags,
  }
}

// ── THE THREE-ESM SUMMARY (Light_Savings J1:O5) ─────────────────────────────
// Reproduced structurally, including the two things about it that are easy to
// get wrong and that the workbook's own formulas settle:
//
//  * BOQ (K5) is Conv + LED ONLY. The sensor count in K4 is NOT added to it —
//    K5 = SUM(K2:K3), so BOQ = Conv BOQ + LED BOQ and nothing else.
//  * The TOTAL denominator (L5) is likewise Conv + LED only. Control savings
//    appear in the numerator (N5 = SUM(N2:N4)) but the control BASELINE never
//    enters L5, so the headline % is savings-over-lamp-baseline. That is why
//    the headline is strictly higher than the lamp-only figure, and can sit
//    above either replacement ESM's own percentage.
//  * BOQ counts PROJECT lamp qty (column V), not baseline lamp qty.
//  * A row whose project unit is "No-Retrofit" is excluded everywhere.
export function summariseLighting(rows) {
  const live = (rows || []).filter((r) => r.retrofit)
  const pick = (esm) => live.filter((r) => r.esm === esm)
  const sum = (list, k) => list.reduce((a, r) => a + (okNum(r[k]) ? r[k] : 0), 0)

  const mk = (label, list) => {
    const baseline = sum(list, 'baseline_kwh')
    const savings = sum(list, 'savings_kwh')
    return {
      esm: label,
      boq: sum(list, 'project_lamp_qty'),
      baseline_kwh: baseline,
      savings_kwh: savings,
      project_kwh: baseline - savings,
      savings_pct: baseline > 0 ? (savings / baseline) * 100 : null,
    }
  }

  const conv = mk('Lighting Replacement Conventional to LED', pick('Conv'))
  const led = mk('Lighting Replacement LED to LED', pick('LED'))

  const controlBaseline = sum(live, 'control_baseline_kwh')
  const controlSavings = sum(live, 'control_savings_kwh')
  const control = {
    esm: 'Lighting Control',
    boq: live.reduce((a, r) => a + (okNum(r.sensors_qty) ? r.sensors_qty : 0), 0),
    baseline_kwh: controlBaseline,
    savings_kwh: controlSavings,
    project_kwh: controlBaseline - controlSavings,
    savings_pct: controlBaseline > 0 ? (controlSavings / controlBaseline) * 100 : null,
  }

  const totalBaseline = conv.baseline_kwh + led.baseline_kwh          // L5 = SUM(L2:L3)
  const totalSavings = conv.savings_kwh + led.savings_kwh + control.savings_kwh   // N5 = SUM(N2:N4)
  const total = {
    esm: 'Total',
    boq: conv.boq + led.boq,                                          // K5 = SUM(K2:K3)
    baseline_kwh: totalBaseline,
    savings_kwh: totalSavings,
    project_kwh: totalBaseline - totalSavings,                        // M2 = L5 - N5
    savings_pct: totalBaseline > 0 ? (totalSavings / totalBaseline) * 100 : null,
  }

  return { conv, led, control, total, esms: [conv, led, control, total] }
}

// Whole-project lighting computation. `selection` maps a surveyed entry to its
// chosen LED fitting; a row with no selection is the workbook's "No-Retrofit".
export function computeLightingProject({ entries, ohRows, registry, selection = [], consts }) {
  const index = buildLightingIndex(registry)
  const ohKey = (bid, st) => `${bid}|${String(st || '').trim().toLowerCase()}`
  const ohMap = new Map((ohRows || []).map((o) => [ohKey(o.building_id, o.space_type), o]))
  const selByEntry = new Map((selection || []).filter((s) => s.entry_id).map((s) => [s.entry_id, s]))

  const rows = (entries || [])
    .filter((e) => e.category === 'lighting')
    .map((e) => computeLightingRow({
      entry: e,
      sel: selByEntry.get(e.id) || null,
      oh: ohMap.get(ohKey(e.building_id, e.room_type)),
      consts,
      index,
    }))

  const summary = summariseLighting(rows)
  return {
    rows,
    summary,
    totals: {
      rows: rows.length,
      retrofit: rows.filter((r) => r.retrofit).length,
      blocked: rows.filter((r) => r.flags.includes('no-baseline-fitting')).length,
      assumed: rows.filter((r) => r.flags.includes('assumed-fitting')).length,
      boq: summary.total.boq,
      baseline_kwh: summary.total.baseline_kwh,
      savings_kwh: summary.total.savings_kwh,
      savings_pct: summary.total.savings_pct,
    },
  }
}
