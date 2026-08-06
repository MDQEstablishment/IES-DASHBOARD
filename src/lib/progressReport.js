// 9F — progress-report data assembly. PURE: no supabase, no DOM, no clock of
// its own (the caller passes `asOf`), so the whole thing is node-testable and
// the numbers can be asserted against SQL ground truth.
//
// Everything here mirrors what the app already shows on screen. Two rules that
// must not drift:
//   · INSTALLED = every install_log row NOT rejected (9F Part A: a logged
//     installation is the truth; there is no approval step).
//   · ESM identity comes from the scope's project_esm_id -> esms.code, never
//     from parsing material_code (imported codes like LED-T8-120-14W don't
//     start with ESM1/2/3 and would silently fall out of every bucket).

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ISO date strings compare correctly as strings — no Date objects, so no
// timezone can shift a row into the wrong day.
const inRange = (d, from, to) => !!d && (!from || d >= from) && (!to || d <= to)

// TEST-ONLY EXPORT — nothing in the app imports this; it is exported so the
// generator harness can exercise it directly. Do not assume it is dead code.
export function dayName(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return ''
  return DAY_NAMES[new Date(+m[1], +m[2] - 1, +m[3]).getDay()]
}

// every calendar day in [from,to] inclusive, as ISO strings
// TEST-ONLY EXPORT — nothing in the app imports this; it is exported so the
// generator harness can exercise it directly. Do not assume it is dead code.
export function daysBetween(from, to, max = 400) {
  const out = []
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(from || ''))
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(to || ''))
  if (!m || !n || from > to) return out
  const cur = new Date(+m[1], +m[2] - 1, +m[3])
  const end = new Date(+n[1], +n[2] - 1, +n[3])
  const p2 = (x) => String(x).padStart(2, '0')
  while (cur <= end && out.length < max) {
    out.push(`${cur.getFullYear()}-${p2(cur.getMonth() + 1)}-${p2(cur.getDate())}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export const daysInclusive = (from, to) => daysBetween(from, to, 100000).length

// project start + total weeks — the owner's rule, editable at generation time
export function estimatedCompletion(project) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(project?.start_date || ''))
  const weeks = Number(project?.total_weeks)
  if (!m || !Number.isFinite(weeks) || weeks <= 0) return ''
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  d.setDate(d.getDate() + Math.round(weeks * 7))
  const p2 = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

const round1 = (v) => Math.round(v * 10) / 10
const pctOf = (part, whole) => (whole > 0 ? Math.min(100, round1((part / whole) * 100)) : 0)

// ── S-curve series ──────────────────────────────────────────────────────────
// A4 commit A. The Dashboard's largest panel used to SYNTHESIZE its curve:
// `Math.pow(t, 0.85)` for "planned" and a linear ramp from the single scalar
// `overall` for "actual", drawn against three fixed axis labels and a NOW
// gridline pinned to the viewBox midpoint. Against an empty database it drew a
// confident healthy programme. This function replaces that with the real thing.
//
// PURE, like everything else in this module — no supabase, no clock of its own
// (`asOf` is passed in), so it is asserted in tests/sCurve.test.mjs rather than
// eyeballed on screen.
//
// THE ONE RULE: there is no fallback shape. If the inputs cannot produce a real
// curve, this returns { ok: false, reason } naming the missing input, and the
// caller renders an empty state saying what has to happen first. It never
// returns a series it invented.
//
//   planned  linear over each project's own contracted window
//            (projects.start_date .. start_date + total_weeks*7), summed across
//            projects — the same start/duration pair estimatedCompletion() uses.
//   actual   cumulative install_log.qty by entry_date, capped per scope at
//            building_item_scope.planned_qty. That cap is the same rule the KPI
//            ring, Projects, ProjectDetail and assembleReportData() apply, so
//            the curve's endpoint and Portfolio Progress cannot disagree.
//            Drawn only up to `asOf` — the future is not measured.
const MAX_POINTS = 53   // one year of weekly samples; longer programmes step by n weeks

const addDays = (iso, n) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return ''
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  d.setDate(d.getDate() + n)
  const p2 = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))

export function sCurveSeries({
  projects = [], plannedByProject = {}, plannedByScope = {}, scopeProject = {},
  installs = [], asOf,
}) {
  const plannedTotalAll = Object.values(plannedByProject).reduce((a, v) => a + (Number(v) || 0), 0)
  if (!(plannedTotalAll > 0)) return { ok: false, reason: 'no_scope' }

  // A project contributes a planned ramp only when it has BOTH ends of the
  // contract pair and some planned scope. One without a schedule is not
  // guessed at — it is named in `unscheduled` so the panel can say so.
  const scheduled = []
  const unscheduled = []
  projects.forEach((p) => {
    const planned = Number(plannedByProject[p.id]) || 0
    if (planned <= 0) return
    const end = estimatedCompletion(p)
    if (!isDay(p.start_date) || !end) { unscheduled.push(p); return }
    scheduled.push({ id: p.id, name: p.name || p.code || '', start: p.start_date, end, planned })
  })
  if (scheduled.length === 0) return { ok: false, reason: 'no_schedule', unscheduled }

  const plannedTotal = scheduled.reduce((a, p) => a + p.planned, 0)
  const start = scheduled.reduce((a, p) => (a && a < p.start ? a : p.start), '')
  const end = scheduled.reduce((a, p) => (a && a > p.end ? a : p.end), '')

  // ── actual: cumulative installed by day, capped per scope ─────────────────
  // Only rows on a scope this series knows about, only rows carrying a date.
  const dated = installs
    .filter((r) => isDay(r.entry_date) && r.scope_id in plannedByScope)
    .filter((r) => !scopeProject[r.scope_id] || plannedByProject[scopeProject[r.scope_id]] > 0)
    .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)))
  if (dated.length === 0) return { ok: false, reason: 'no_installs', plannedTotal, start, end }

  const perScope = new Map()
  const cumByDay = []          // [{ date, cum }] one entry per day that has rows
  let cum = 0
  dated.forEach((r) => {
    const cap = Number(plannedByScope[r.scope_id]) || 0
    const was = perScope.get(r.scope_id) || 0
    const now = Math.min(cap, was + (Number(r.qty) || 0))
    cum += now - was
    perScope.set(r.scope_id, now)
    const last = cumByDay[cumByDay.length - 1]
    if (last && last.date === r.entry_date) last.cum = cum
    else cumByDay.push({ date: r.entry_date, cum })
  })

  // ── weekly sample dates across the real timeline ──────────────────────────
  const spanDays = Math.max(1, daysInclusive(start, end) - 1)
  const weeks = Math.max(1, Math.ceil(spanDays / 7))
  const step = Math.max(1, Math.ceil((weeks + 1) / MAX_POINTS))   // weeks per sample
  const dates = []
  for (let w = 0; w <= weeks; w += step) dates.push(addDays(start, Math.min(w * 7, spanDays)))
  if (dates[dates.length - 1] !== end) dates.push(end)

  const plannedAt = (day) => scheduled.reduce((a, p) => {
    if (day < p.start) return a
    const span = Math.max(1, daysInclusive(p.start, p.end) - 1)
    const done = Math.min(span, daysInclusive(p.start, day) - 1)
    return a + p.planned * (done / span)
  }, 0)
  const actualAt = (day) => {
    let v = 0
    for (const d of cumByDay) { if (d.date > day) break; v = d.cum }
    return v
  }

  const today = isDay(asOf) ? asOf : ''
  const points = dates.map((date) => ({
    date,
    planned: Math.round(plannedAt(date)),
    // the actual line stops at today: a value plotted past `asOf` would be a
    // claim about work that has not happened
    actual: today && date > today ? null : actualAt(date),
  }))

  // where NOW sits on the axis, as a 0..1 fraction of the drawn span
  let nowFrac = null
  if (today && today >= start) {
    nowFrac = today >= end ? 1 : Math.min(1, Math.max(0, (daysInclusive(start, today) - 1) / spanDays))
  } else if (today) {
    nowFrac = 0
  }

  const installedNow = today ? actualAt(today) : (cumByDay[cumByDay.length - 1]?.cum ?? 0)
  return {
    ok: true, points, start, end, asOf: today, nowFrac,
    plannedTotal, installedNow,
    plannedNow: today ? Math.round(plannedAt(today > end ? end : today)) : null,
    unscheduled,
  }
}

// The report template's tables are keyed by CATEGORY (Lights / A/C / Sensors),
// not by ESM code, so every ESM has to land in one of three buckets. Order
// matters: "Lighting Control" is a SENSOR row, not a lighting row, so the
// control/sensor test has to run before the lighting test.
// TEST-ONLY EXPORT — nothing in the app imports this; it is exported so the
// generator harness can exercise it directly. Do not assume it is dead code.
export function esmCategory(esm) {
  const t = `${esm?.code || ''} ${esm?.name || ''}`.toLowerCase()
  if (/sensor|control|occupanc|daylight/.test(t)) return 'sensors'
  if (/\ba\/?c\b|air.?cond|hvac|chiller|split/.test(t)) return 'ac'
  if (/light|lamp|luminaire|led/.test(t)) return 'lights'
  return null
}

// Match a label written in the TEMPLATE ("Lights", "A/C", "Sensors") to the
// same bucket, so row order is read from the sheet rather than assumed.
export function labelCategory(label) {
  const t = String(label || '').toLowerCase()
  if (/sensor|control/.test(t)) return 'sensors'
  if (/a\/?c|air|hvac/.test(t)) return 'ac'
  if (/light|lamp/.test(t)) return 'lights'
  return null
}

export function assembleReportData({
  project, buildings = [], scopes = [], projectEsms = [], install = [],
  deliveries = [], warehouse = [], documents = [], cocs = [], photos = [],
  from, to, estDates = {}, asOf,
}) {
  const warnings = []
  const today = asOf || to

  // ── ESM identity ─────────────────────────────────────────────────────────
  const esmOfProjectEsm = new Map(projectEsms.map((pe) => [pe.id, pe.esm?.code || pe.esm_code || null]))
  const esmNameOf = new Map(projectEsms.map((pe) => [pe.esm?.code || pe.esm_code, pe.esm?.name || pe.custom_name || '']))
  const activeBuildingIds = new Set(buildings.map((b) => b.id))
  // surplus/archived buildings are already filtered out by the caller — the
  // same "active buildings only" rule every other screen uses
  const projectScopes = scopes.filter((s) => activeBuildingIds.has(s.building_id))
  const scopeById = new Map(projectScopes.map((s) => [s.id, s]))
  const esmOfScope = (s) => (s ? esmOfProjectEsm.get(s.project_esm_id) || null : null)

  // ── installs (not rejected), scoped to this project's active buildings ────
  const rows = install.filter((r) => r.qa_status !== 'rejected' && scopeById.has(r.scope_id))

  const installedByScope = new Map()
  const installedByScopeToDate = new Map()
  rows.forEach((r) => {
    const q = Number(r.qty) || 0
    if (!inRange(r.entry_date, null, to)) return          // nothing after the TO date counts
    installedByScopeToDate.set(r.scope_id, (installedByScopeToDate.get(r.scope_id) || 0) + q)
    if (inRange(r.entry_date, from, to)) installedByScope.set(r.scope_id, (installedByScope.get(r.scope_id) || 0) + q)
  })

  // ── per-ESM totals ───────────────────────────────────────────────────────
  const codes = [...new Set(projectEsms.map((pe) => pe.esm?.code || pe.esm_code).filter(Boolean))].sort()
  const deliveredByEsm = new Map()
  deliveries.forEach((d) => {
    if (d.status !== 'delivered') return
    if (!inRange(d.actual_date, null, to)) return
    const code = esmOfProjectEsm.get(d.project_esm_id) || d.esm_code || null
    if (!code) return
    deliveredByEsm.set(code, (deliveredByEsm.get(code) || 0) + (Number(d.quantity) || 0))
  })
  const warehouseByEsm = new Map()
  warehouse.forEach((w) => {
    if (!w.esm_code) return
    warehouseByEsm.set(w.esm_code, (warehouseByEsm.get(w.esm_code) || 0) + (Number(w.qty_on_hand) || 0))
  })

  const esms = codes.map((code) => {
    const mine = projectScopes.filter((s) => esmOfScope(s) === code)
    const total = mine.reduce((a, s) => a + (Number(s.planned_qty) || 0), 0)
    // capped per scope — the same rule Dashboard/Projects/ProjectDetail use, so
    // the report can never disagree with the screens
    const installed = mine.reduce((a, s) => a + Math.min(Number(s.planned_qty) || 0, installedByScopeToDate.get(s.id) || 0), 0)
    const installedRaw = mine.reduce((a, s) => a + (installedByScopeToDate.get(s.id) || 0), 0)
    if (installedRaw > installed) {
      warnings.push(`${code}: ${installedRaw - installed} unit(s) logged beyond the planned quantity — the report counts the planned figure`)
    }
    const delivered = deliveredByEsm.get(code) ?? 0
    const warehouseReal = warehouseByEsm.has(code) ? warehouseByEsm.get(code) : null
    const warehouseComputed = delivered - installedRaw
    // Report the REAL ledger figure and surface the gap. A silent difference
    // between the warehouse ledger and delivered-minus-installed is exactly
    // what a client report should expose, not smooth over.
    const inWarehouse = warehouseReal == null ? warehouseComputed : warehouseReal
    const discrepancy = warehouseReal == null ? 0 : warehouseReal - warehouseComputed
    if (discrepancy !== 0) {
      warnings.push(`${code}: warehouse ledger (${warehouseReal}) differs from delivered − installed (${warehouseComputed}) by ${discrepancy > 0 ? '+' : ''}${discrepancy} unit(s)`)
    }

    const remaining = Math.max(0, total - installed)
    const estDate = estDates[code] || estimatedCompletion(project) || ''
    const daysLeft = estDate && today && estDate >= today ? Math.max(0, daysInclusive(today, estDate) - 1) : 0
    const requiredPerDay = daysLeft > 0 ? round1(remaining / daysLeft) : (remaining > 0 ? remaining : 0)
    // actual pace measured over the days actually worked, not the calendar —
    // dividing by idle days would understate a team that works in bursts
    const workedDays = new Set(rows.filter((r) => esmOfScope(scopeById.get(r.scope_id)) === code && inRange(r.entry_date, null, to)).map((r) => r.entry_date)).size
    const actualPerDay = workedDays > 0 ? round1(installedRaw / workedDays) : 0
    return {
      code, name: esmNameOf.get(code) || code,
      category: esmCategory({ code, name: esmNameOf.get(code) }),
      total, installed, installed_raw: installedRaw, delivered,
      in_warehouse: inWarehouse, warehouse_computed: warehouseComputed, discrepancy,
      remaining, completion_pct: pctOf(installed, total),
      est_date: estDate, days_left: daysLeft,
      required_per_day: requiredPerDay, actual_per_day: actualPerDay,
      on_track: remaining === 0 || (actualPerDay > 0 && actualPerDay >= requiredPerDay),
    }
  })

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const unitsTotal = esms.reduce((a, e) => a + e.total, 0)
  const unitsInstalled = esms.reduce((a, e) => a + e.installed, 0)
  const kpis = {
    completion_pct: pctOf(unitsInstalled, unitsTotal),
    units_installed: unitsInstalled,
    units_total: unitsTotal,
    units_remaining: Math.max(0, unitsTotal - unitsInstalled),
  }

  // ── daily log: opening balance row, then one row per calendar day ─────────
  // Cumulative columns are PROJECT-TO-DATE (a client reads them that way), so
  // the first row seeds the pre-period totals and the period's own contribution
  // is visible as (closing − opening).
  const opening = {}
  codes.forEach((c) => { opening[c] = 0 })
  rows.forEach((r) => {
    if (!from || r.entry_date >= from) return
    const code = esmOfScope(scopeById.get(r.scope_id))
    if (code && code in opening) opening[code] += Number(r.qty) || 0
  })

  const dayList = daysBetween(from, to)
  const truncated = daysInclusive(from, to) > dayList.length
  if (truncated) warnings.push(`The period is longer than the report's daily log holds — only the first ${dayList.length} days are listed`)

  const byDay = new Map()
  rows.forEach((r) => {
    if (!inRange(r.entry_date, from, to)) return
    const code = esmOfScope(scopeById.get(r.scope_id))
    if (!code) return
    if (!byDay.has(r.entry_date)) byDay.set(r.entry_date, {})
    const d = byDay.get(r.entry_date)
    d[code] = (d[code] || 0) + (Number(r.qty) || 0)
  })

  const catOfCodeEarly = new Map(codes.map((c) => [c, esmCategory({ code: c, name: esmNameOf.get(c) })]))
  const openingCat = { lights: 0, ac: 0, sensors: 0 }
  codes.forEach((c) => { const k = catOfCodeEarly.get(c); if (k && k in openingCat) openingCat[k] += opening[c] || 0 })
  const cum = { ...opening }
  const daily = [{
    date: '', day_name: 'Opening balance (before period)', opening: true,
    per_esm: { ...opening }, per_category: { ...openingCat }, total: 0, cumulative: { ...opening },
  }]
  dayList.forEach((d) => {
    const perEsm = {}
    let tot = 0
    codes.forEach((c) => {
      const v = (byDay.get(d) || {})[c] || 0
      perEsm[c] = v; tot += v
      cum[c] = (cum[c] || 0) + v
    })
    const perCat = { lights: 0, ac: 0, sensors: 0 }
    codes.forEach((c) => { const k = catOfCodeEarly.get(c); if (k && k in perCat) perCat[k] += perEsm[c] || 0 })
    daily.push({ date: d, day_name: dayName(d), opening: false, per_esm: perEsm, per_category: perCat, total: tot, cumulative: { ...cum } })
  })
  const dailyTotals = {
    per_esm: Object.fromEntries(codes.map((c) => [c, daily.reduce((a, r) => a + (r.opening ? 0 : r.per_esm[c] || 0), 0)])),
    total: daily.reduce((a, r) => a + (r.opening ? 0 : r.total), 0),
  }

  // ── per-building progress (same capped rule) ──────────────────────────────
  const catOfCode = new Map(codes.map((c) => [c, esmCategory({ code: c, name: esmNameOf.get(c) })]))
  const buildingRows = buildings.map((b) => {
    const mine = projectScopes.filter((s) => s.building_id === b.id)
    const planned = mine.reduce((a, s) => a + (Number(s.planned_qty) || 0), 0)
    const installed = mine.reduce((a, s) => a + Math.min(Number(s.planned_qty) || 0, installedByScopeToDate.get(s.id) || 0), 0)
    const per = { lights: { planned: 0, installed: 0 }, ac: { planned: 0, installed: 0 }, sensors: { planned: 0, installed: 0 } }
    mine.forEach((s) => {
      const cat = catOfCode.get(esmOfScope(s))
      if (!cat || !per[cat]) return
      per[cat].planned += Number(s.planned_qty) || 0
      per[cat].installed += Math.min(Number(s.planned_qty) || 0, installedByScopeToDate.get(s.id) || 0)
    })
    return { code: b.code || '', name: b.name || '', planned, installed, per_category: per,
      remaining: Math.max(0, planned - installed), completion_pct: pctOf(installed, planned) }
  }).sort((a, b) => String(a.code).localeCompare(String(b.code)))

  // ── documents / COCs ─────────────────────────────────────────────────────
  const docsInScope = documents.filter((d) => d.doc_type !== 'coc')
  const docTypes = [...new Set(docsInScope.map((d) => d.doc_type))].sort()
  const docStatuses = ['draft', 'submitted', 'under_review', 'approved']
  const docRows = docTypes.map((t) => {
    const mine = docsInScope.filter((d) => d.doc_type === t)
    const counts = Object.fromEntries(docStatuses.map((s) => [s, mine.filter((d) => d.status === s).length]))
    return { doc_type: t, total: mine.length, ...counts }
  })
  const cocRows = {
    total: cocs.length,
    issued: cocs.filter((c) => c.status === 'sent').length,
    pending: cocs.filter((c) => c.status !== 'sent').length,
    by_status: [...new Set(cocs.map((c) => c.status).filter(Boolean))].sort()
      .map((s) => ({ status: s, count: cocs.filter((c) => c.status === s).length })),
  }

  // ── site evidence index (the annex holds the images themselves) ───────────
  const evidence = photos
    .filter((p) => inRange(p.taken_at ? String(p.taken_at).slice(0, 10) : null, from, to) || !p.taken_at)
    .map((p, i) => ({
      no: i + 1,
      building: p.building_code || '',
      room: p.room_name || '',
      date: p.taken_at ? String(p.taken_at).slice(0, 10) : '',
      category: p.esm || p.source || '',
      caption: p.caption || '',
      storage_path: p.storage_path, bucket: p.bucket,
    }))

  return {
    meta: {
      project_code: project?.code || '', project_name: project?.name || '',
      client: project?.client || project?.beneficiary_entity || '',
      reference: project?.project_reference_no || '',
      contractor: project?.contractor_name || '', esco: project?.energy_services_company || '',
      start_date: project?.start_date || '', total_weeks: project?.total_weeks ?? null,
      period_from: from || '', period_to: to || '', generated_on: asOf || '',
    },
    kpis, esms, daily, daily_totals: dailyTotals, buildings: buildingRows,
    documents: docRows, doc_statuses: docStatuses, cocs: cocRows, evidence, warnings,
  }
}
