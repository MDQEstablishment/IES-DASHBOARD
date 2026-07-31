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

export function dayName(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return ''
  return DAY_NAMES[new Date(+m[1], +m[2] - 1, +m[3]).getDay()]
}

// every calendar day in [from,to] inclusive, as ISO strings
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

  const cum = { ...opening }
  const daily = [{
    date: '', day_name: 'Opening balance (before period)', opening: true,
    per_esm: { ...opening }, total: 0, cumulative: { ...opening },
  }]
  dayList.forEach((d) => {
    const perEsm = {}
    let tot = 0
    codes.forEach((c) => {
      const v = (byDay.get(d) || {})[c] || 0
      perEsm[c] = v; tot += v
      cum[c] = (cum[c] || 0) + v
    })
    daily.push({ date: d, day_name: dayName(d), opening: false, per_esm: perEsm, total: tot, cumulative: { ...cum } })
  })
  const dailyTotals = {
    per_esm: Object.fromEntries(codes.map((c) => [c, daily.reduce((a, r) => a + (r.opening ? 0 : r.per_esm[c] || 0), 0)])),
    total: daily.reduce((a, r) => a + (r.opening ? 0 : r.total), 0),
  }

  // ── per-building progress (same capped rule) ──────────────────────────────
  const buildingRows = buildings.map((b) => {
    const mine = projectScopes.filter((s) => s.building_id === b.id)
    const planned = mine.reduce((a, s) => a + (Number(s.planned_qty) || 0), 0)
    const installed = mine.reduce((a, s) => a + Math.min(Number(s.planned_qty) || 0, installedByScopeToDate.get(s.id) || 0), 0)
    return { code: b.code || '', name: b.name || '', planned, installed, remaining: Math.max(0, planned - installed), completion_pct: pctOf(installed, planned) }
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
  }

  // ── site evidence index (the annex holds the images themselves) ───────────
  const evidence = photos
    .filter((p) => inRange(p.taken_at ? String(p.taken_at).slice(0, 10) : null, from, to) || !p.taken_at)
    .map((p, i) => ({
      no: i + 1,
      building: p.building_code || '',
      room: p.room_name || '',
      date: p.taken_at ? String(p.taken_at).slice(0, 10) : '',
      caption: p.caption || p.source || '',
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
