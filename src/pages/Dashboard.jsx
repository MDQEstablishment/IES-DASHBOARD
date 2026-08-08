import { useState } from 'react'
import Icon from '../components/Icon'
import { Loading, Empty, Drawer } from '../components/ui'
import { useLiveQuery } from '../lib/db'
import { ago, localToday } from '../lib/format'
import { sCurveSeries } from '../lib/progressReport'

// Card documentation (also exported to docs/Dashboard-Cards-Reference.md)
const CARD_DOCS = [
  ['Total Projects', 'Count of non-deleted projects.', 'projects table', 'Add Project / Delete Project actions'],
  ['Portfolio Progress', 'Weighted average installed ÷ planned across active projects. With no planned scope anywhere there is no ratio, so it reads “—” rather than 0%.', 'install_log ÷ building_item_scope', 'Engineer install entries'],
  ['S-Curve', 'Cumulative installed quantity against the contracted plan, sampled weekly. Planned is each project’s scope spread linearly over its own start date + duration; actual is install_log to date, capped per scope at the planned quantity, and drawn only up to today. A project with scope but no schedule is excluded and counted under the chart.', 'install_log.entry_date vs building_item_scope.planned_qty over projects.start_date + total_weeks', 'Daily Report submissions; project start date + duration'],
  ['COCs Signed', 'Certified (building × ESM) pairs out of every pair with planned scope, across active projects. A pair counts as approved once the certificate claiming it is approved or accepted with comments by TARSHID.', 'v_project_doc_progress (approved_count ÷ expected_count, doc_type=coc) — pair-grained, from coc_pool + coc_claims', 'Logging TARSHID feedback on a certificate; scope and installation drive the denominator'],
  ['Progress by Project', 'Per-project weighted %.', 'install_log + building_item_scope', 'Engineer log entries'],
  ['Progress by ESM', 'Per-ESM aggregated % across the portfolio, one bar per row in the ESM catalogue. An ESM with no planned scope reads “—”, not 0%.', 'install_log grouped by building_item_scope.project_esm_id → esms (name and order from the esms table; a project’s custom_name wins when every project agrees on it)', 'Engineer log entries; the ESM catalogue under Materials'],
  ['Attention List', 'Open escalations + blocked tasks.', 'escalations + tasks', 'Auto-detected blockers + manual escalations'],
  ['Recent Activity', 'Writes across the programme in the last 24 hours, newest first, up to six.', 'audit_log (created_at within 24h)', 'Any write action'],
  ['Critical Materials', 'CRITICAL is stock below its reorder threshold. LOW is stock below threshold × the low_stock_multiplier constant; with that row absent there is no LOW band.', 'materials (received vs threshold) × tarshid_constants.low_stock_multiplier', 'Material receipts + install activity; the constant in tarshid_constants'],
]

// A3(11)(12)(13) — three ESM facts that were held in this file are gone.
//
// `esmOf(material_code)` inferred an ESM from a code PREFIX (LED->ESM1,
// SENS->ESM2, AC/BR/RC->ESM3). Its comment called it a fallback for when there
// is no scope->esm join. There has been a join for a long time — building_item_scope
// .project_esm_id -> project_esms -> esms — and this was the ONLY path, so any
// material code outside those five prefixes (every imported code of the form
// LED-T8-120-14W is fine, but PANEL-*, LUM-*, SPLIT-* are not) vanished from
// the ESM card while still counting in Portfolio Progress. The two numbers on
// the same screen disagreed, silently, in the direction that looks better.
// progressReport.js:94-101 already resolves ESM the right way; this file now
// does the same thing.
//
// `ESM_META` hardcoded display names that DID NOT MATCH the database: it said
// "Lighting / Fixtures" and "AC Units" where `esms` says "Lighting Replacement"
// and "AC Units Replacement". The names come from `esms` now, ordered by
// `esms.ordinal` (migration 0139), and `project_esms.custom_name` is honoured.
//
// `['ESM1','ESM2','ESM3']` fixed the card at three bars. A fourth ESM row in
// the catalogue now appears without a deploy.

export default function Dashboard() {
  const [help, setHelp] = useState(false)
  const { rows: projects } = useLiveQuery('projects', (q) => q.select('id,code,name,status,client,region,start_date,total_weeks').is('deleted_at', null))
  const { rows: allBuildings } = useLiveQuery('buildings', (q) => q.select('id,project_id,status_override'))
  // Only count buildings that belong to a live (non-deleted) project. `projects`
  // is already filtered to deleted_at IS NULL, so a building whose project_id is
  // not in this set is an orphan of a soft-deleted project and must be excluded —
  // otherwise its scopes inflate the planned total and skew Portfolio Progress +
  // the S-Curve (which both derive from `overall`). Sprint 8I-A.
  const activeProjectIds = new Set(projects.map((p) => p.id))
  const buildings = allBuildings.filter((b) => b.status_override !== 'archived' && activeProjectIds.has(b.project_id))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,project_esm_id,planned_qty'))
  const { rows: esmCatalog } = useLiveQuery('esms', (q) => q.select('code,name,ordinal').order('ordinal'))
  const { rows: projectEsms } = useLiveQuery('project_esms', (q) => q.select('id,project_id,custom_name,esm:esms(code,name)'))
  const { rows: install, loading } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status,entry_date'))
  const { rows: escs } = useLiveQuery('escalations', (q) =>
    q.select('id,title,severity,status,created_at,building:buildings(code,name),raised_to:profiles!escalations_raised_to_id_fkey(full_name)')
      .neq('status', 'resolved').neq('status', 'closed').order('severity', { ascending: false }))
  const { rows: tasks } = useLiveQuery('tasks', (q) => q.select('id,title,status,priority,created_at'))
  const { rows: materials } = useLiveQuery('materials', (q) => q.select('code,name,received,threshold,esm:esms(code)'))
  // A4(3) — the header says "Last 24h", so the QUERY now says it too. It used
  // to be an unfiltered `order desc limit 6`, which meant the card could show
  // rows from any month under a 24-hour heading. The window is computed at
  // fetch time inside the builder, so a refetch re-reads the clock.
  const { rows: activity } = useLiveQuery('audit_log', (q) => q
    .select('id,actor_name,action,entity_type,summary,created_at')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false }).limit(6))
  const { rows: cocProg } = useLiveQuery('v_project_doc_progress', (q) => q.select('project_id,expected_count,approved_count').eq('doc_type', 'coc'))
  // A4(4) — the LOW-stock band. Business policy, so it lives in the database
  // with the rest of the decoded parameters (migration 0138) and has NO code
  // default: if the row is absent nothing is classified LOW, because a made-up
  // multiplier is exactly the kind of invented number this sprint removes.
  const { rows: constRows } = useLiveQuery('tarshid_constants', (q) => q.select('key,value'))
  const constants = {}; constRows.forEach((r) => { constants[r.key] = Number(r.value) })
  const lowStockMult = Number.isFinite(constants.low_stock_multiplier) ? constants.low_stock_multiplier : null

  // approved-installed per scope, capped at planned_qty
  const installedByScope = {}
  install.forEach((r) => { if (r.qa_status !== 'rejected') installedByScope[r.scope_id] = (installedByScope[r.scope_id] || 0) + (r.qty || 0) })
  const bP = {}; buildings.forEach((b) => { bP[b.id] = b.project_id })
  // scope -> ESM code, by the real join (the same resolution progressReport.js uses)
  const esmOfProjectEsm = {}; projectEsms.forEach((pe) => { esmOfProjectEsm[pe.id] = pe.esm?.code || null })

  let planned = 0, installed = 0
  const per = {}             // project_id -> {planned, installed}
  const esmAgg = {}          // ESMx -> {planned, installed}
  const plannedByScope = {}  // scope_id -> planned_qty   (S-curve per-scope cap)
  const scopeProject = {}    // scope_id -> project_id    (S-curve scoping)
  scopes.forEach((s) => {
    const pid = bP[s.building_id]
    if (!pid) return // scope belongs to a soft-deleted/archived-project building — exclude from all totals
    const ins = Math.min(s.planned_qty || 0, installedByScope[s.id] || 0)
    planned += s.planned_qty || 0; installed += ins
    plannedByScope[s.id] = s.planned_qty || 0
    scopeProject[s.id] = pid
    ;(per[pid] = per[pid] || { planned: 0, installed: 0 }); per[pid].planned += s.planned_qty || 0; per[pid].installed += ins
    const e = esmOfProjectEsm[s.project_esm_id]
    if (e) { (esmAgg[e] = esmAgg[e] || { planned: 0, installed: 0 }); esmAgg[e].planned += s.planned_qty || 0; esmAgg[e].installed += ins }
  })
  // Scope whose project_esm row is missing or unresolvable is counted in
  // Portfolio Progress but cannot be attributed to an ESM. Say so on the card
  // rather than let the two totals disagree in silence, which is what the
  // prefix inference did.
  const unattributed = scopes.reduce((a, s) => (bP[s.building_id] && !esmOfProjectEsm[s.project_esm_id] ? a + (s.planned_qty || 0) : a), 0)
  // Same rule as the two bar charts below: no denominator means UNKNOWN. With
  // no planned scope anywhere this used to read a confident 0% in the largest
  // number on the page, directly above bars that (correctly) read "—".
  const overall = planned ? (installed / planned) * 100 : null

  // KPIs
  const kpiProjects = projects.length
  const kpiActive = projects.filter((p) => p.status === 'active').length
  const kpiDraft = projects.filter((p) => p.status === 'draft').length

  // Portfolio ring dash (r=26 → circ ≈ 163.4)
  const CIRC = (2 * Math.PI * 26)
  const portFrac = overall == null ? 0 : Math.min(1, overall / 100)
  const portRingDash = `${(CIRC * portFrac).toFixed(1)} ${CIRC.toFixed(1)}`

  // Individual COCs approved = SUM(approved_count) ÷ SUM(expected_count) across
  // active projects, at (building × ESM) granularity from v_project_doc_progress. (Sprint 3)
  const activeProjIds = new Set(projects.filter((p) => p.status === 'active').map((p) => p.id))
  const cocRows = cocProg.filter((r) => activeProjIds.has(r.project_id))
  const cocX = cocRows.reduce((s, r) => s + (r.approved_count || 0), 0)
  const cocY = cocRows.reduce((s, r) => s + (r.expected_count || 0), 0)
  const cocFrac = cocY ? Math.min(1, cocX / cocY) : 0
  const cocRingDash = `${(CIRC * cocFrac).toFixed(1)} ${CIRC.toFixed(1)}`

  // Progress by Project bars
  // A percentage with no denominator is UNKNOWN, not zero — a project with no
  // scope yet reads "—", not "0%" in warning amber.
  const projectBars = projects.map((p) => {
    const d = per[p.id] || { planned: 0, installed: 0 }
    const prog = d.planned ? Math.round((d.installed / d.planned) * 100) : null
    const barColor = prog == null ? 'var(--track)' : prog >= 67 ? 'var(--ok)' : prog >= 34 ? 'var(--accent)' : 'var(--warn)'
    return { name: p.name, prog, progW: (prog || 0) + '%', barColor }
  })

  // Progress by ESM bars (portfolio)
  // The bar's label is the catalogue name, unless every project that has
  // adopted this ESM renamed it to the SAME thing — then that shared name is
  // what people call it and it wins. Where projects disagree the portfolio
  // card cannot pick a side, so it shows the catalogue name.
  const customNameOf = (code) => {
    const mine = projectEsms.filter((pe) => pe.esm?.code === code)
    const names = [...new Set(mine.map((pe) => (pe.custom_name || '').trim()).filter(Boolean))]
    return mine.length > 0 && names.length === 1 && names[0] !== '' && mine.every((pe) => (pe.custom_name || '').trim() === names[0]) ? names[0] : null
  }
  const esmBars = esmCatalog.map((e) => {
    const d = esmAgg[e.code] || { planned: 0, installed: 0 }
    const prog = d.planned ? Math.round((d.installed / d.planned) * 100) : null
    return { no: e.code, name: customNameOf(e.code) || e.name, prog, progW: (prog || 0) + '%' }
  })

  // ── S-Curve — REAL, or nothing ─────────────────────────────────────────────
  // A4(1)/(2). This panel used to synthesize both series: planned was
  // Math.pow(t, 0.85), actual was a linear ramp from the single `overall`
  // scalar to the viewBox midpoint, and the axis read "−12 WK / NOW / +12 WK"
  // — three fixed strings over a gridline pinned to x=130. On an empty
  // database it drew a healthy programme. It is now computed from
  // install_log.entry_date against building_item_scope.planned_qty spread over
  // each project's own start_date .. total_weeks window (lib/progressReport.js
  // sCurveSeries), and when it cannot be computed the panel says which input
  // is missing instead of drawing a shape.
  const W = 260, H = 92
  const today = localToday()
  const curve = sCurveSeries({
    projects, plannedByProject: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v.planned])),
    plannedByScope, scopeProject,
    installs: install.filter((r) => r.qa_status !== 'rejected'),
    asOf: today,
  })
  const CURVE_EMPTY = {
    no_scope: 'No planned scope yet. Import a project bundle or add building scope — the curve is planned quantity against what has been installed, and both sides start there.',
    no_schedule: 'No project has a schedule yet. Set a contract start date and duration on a project, and the planned line can be drawn.',
    no_installs: 'Scope and schedule are set, but no installation has been logged. The actual line starts with the first daily progress entry.',
  }
  let curveSvg = null
  if (curve.ok) {
    const maxY = Math.max(1, curve.plannedTotal, ...curve.points.map((p) => p.actual || 0))
    const n = curve.points.length
    const xOf = (i) => (n > 1 ? (i / (n - 1)) * W : 0)
    const yOf = (v) => H - (Math.min(1, v / maxY) * (H - 10))
    const planPoints = curve.points.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.planned).toFixed(1)}`).join(' ')
    const drawn = curve.points.map((p, i) => ({ p, i })).filter(({ p }) => p.actual != null)
    const actualPoints = drawn.map(({ p, i }) => `${xOf(i).toFixed(1)},${yOf(p.actual).toFixed(1)}`).join(' ')
    const last = drawn[drawn.length - 1]
    curveSvg = {
      planPoints, actualPoints, maxY,
      nowX: curve.nowFrac == null ? null : (curve.nowFrac * W).toFixed(1),
      dotX: last ? xOf(last.i).toFixed(1) : null,
      dotY: last ? yOf(last.p.actual).toFixed(1) : null,
    }
  }

  // Attention List — open escalations + blocked tasks
  const blocked = tasks.filter((t) => t.status === 'blocked')
  const sevAgeColor = (s) => (s === 'critical' ? 'var(--bad)' : s === 'high' ? 'var(--warn)' : 'var(--text-3)')
  const attentionList = [
    ...escs.map((e) => ({
      type: 'ESC', tagBg: 'var(--bad-bg)', tagColor: 'var(--bad)',
      item: e.title, project: e.building?.code || e.building?.name || '—',
      who: e.raised_to?.full_name || '—',
      age: ago(e.created_at), ageColor: sevAgeColor(e.severity),
    })),
    ...blocked.map((t) => ({
      type: 'TASK', tagBg: 'var(--warn-bg)', tagColor: 'var(--warn)',
      item: t.title, project: '—', who: '—',
      age: ago(t.created_at), ageColor: t.priority === 'critical' ? 'var(--bad)' : 'var(--text-3)',
    })),
  ]

  // Critical Materials — running low (in-stock = received, low vs threshold). dc 251-263
  const criticalMaterials = materials
    .map((m) => {
      const stock = m.received || 0, t = m.threshold || 0
      // A material with no threshold has no shortfall to rank: Infinity sorts
      // it last honestly, where the old `9` sentinel silently claimed "9x
      // covered" and could outrank a genuinely over-stocked item.
      const ratio = t ? stock / t : Infinity
      // LOW needs the multiplier from the database (0138). Without the row
      // there is no LOW band — only the CRITICAL test, which needs no policy.
      const status = stock < t ? 'CRITICAL' : (lowStockMult != null && stock < t * lowStockMult) ? 'LOW' : 'OK'
      return { esm: m.esm?.code || '—', name: m.name, stock, threshold: t, status, ratio, w: Math.min(100, Math.round((stock / (t * 2 || 1)) * 100)) + '%' }
    })
    .filter((m) => m.status !== 'OK')
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 3)

  // Recent Activity — real audit_log feed. dc 241-248
  const actDot = (a) => {
    const e = (a.entity_type || '').toLowerCase()
    if (e.includes('install')) return 'var(--accent)'
    if (e.includes('document') || e.includes('doc')) return 'var(--ok)'
    if (e.includes('material')) return 'var(--warn)'
    if (e.includes('escalation')) return 'var(--bad)'
    return 'var(--text-3)'
  }
  const recentActivity = activity.map((a) => ({
    dot: actDot(a), actor: a.actor_name || 'System', what: a.summary || a.action,
    where: a.entity_type || '—', when: ago(a.created_at),
  }))

  const scopeLabel = 'All projects'
  const dashTitle = 'Dashboard'

  if (loading) return <Loading />

  return (
    <div data-screen-label="Dashboard">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Executive snapshot</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>{dashTitle}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Scope: {scopeLabel}</div>
          <button onClick={() => setHelp(true)} className="ies-card-hover" title="What does each card mean?" style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface-1)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>?</button>
        </div>
      </div>

      {/* 9P(B) — three KPI cards, not four. The S-Curve moved out to the large
          bottom-left panel, and the owner's decision is that the row stays at
          three evenly distributed cards rather than backfilling a fourth: a KPI
          invented to fill a gap is worse than a clean row. */}
      <div className="ies-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="projects" size={16} />Total Projects</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700, marginTop: 8, lineHeight: 1 }}>{kpiProjects}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--ok)' }}>● {kpiActive} active</span>
            <span style={{ color: 'var(--text-3)' }}>○ {kpiDraft} draft</span>
          </div>
        </div>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="gauge" size={16} />Portfolio Progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <svg viewBox="0 0 64 64" style={{ width: 72, height: 72, flex: 'none' }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--track)" strokeWidth="8" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={portRingDash} transform="rotate(-90 32 32)" />
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, lineHeight: 1, color: overall == null ? 'var(--text-3)' : undefined }}>{overall == null ? '—' : <>{Math.round(overall)}<span style={{ fontSize: 15, color: 'var(--text-3)' }}>%</span></>}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{overall == null ? 'no planned scope yet' : `weighted · ${kpiActive} active`}</div>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="doc" size={16} />COCs Signed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <svg viewBox="0 0 64 64" style={{ width: 72, height: 72, flex: 'none' }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--track)" strokeWidth="8" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round" strokeDasharray={cocRingDash} transform="rotate(-90 32 32)" />
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{cocX}<span style={{ fontSize: 15, color: 'var(--text-3)' }}> of {cocY}</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>individual COCs approved across active projects</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ies-2col" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Progress by Project</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Weighted %</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {projectBars.length === 0 ? <Empty icon="projects">No projects yet.</Empty> : projectBars.map((p, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: p.prog == null ? 'var(--text-3)' : p.barColor, flex: 'none', marginLeft: 8 }} title={p.prog == null ? 'No planned scope yet' : undefined}>{p.prog == null ? '—' : `${p.prog}%`}</span>
                </div>
                <div style={{ height: 9, borderRadius: 'var(--radius-s)', background: 'var(--track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: p.progW, background: p.barColor }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Progress by ESM</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Portfolio</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {esmBars.length === 0 && <Empty icon="materials">No energy saving measures are defined yet. Add them under Materials to see progress by ESM.</Empty>}
            {esmBars.map((e, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{e.no}</span> {e.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, flex: 'none', marginLeft: 8, color: e.prog == null ? 'var(--text-3)' : undefined }} title={e.prog == null ? 'No planned scope yet' : undefined}>{e.prog == null ? '—' : `${e.prog}%`}</span>
                </div>
                <div style={{ height: 9, borderRadius: 'var(--radius-s)', background: 'var(--track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: e.progW, background: 'linear-gradient(90deg,var(--accent),var(--brass-bright))' }} />
                </div>
              </div>
            ))}
            {unattributed > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 2 }}>
                {unattributed.toLocaleString()} planned units are not linked to an ESM and are counted in Portfolio Progress but in none of the bars above.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 9Q(1) — the corrected layout. 9P(B) put the S-Curve in a tall narrow-ish
          panel and pushed the Attention List into the one-third column, which
          crushed the table: item text wrapped to two lines, AGE was pushed out
          of view, and the card grew a horizontal scrollbar. That breaks this
          project's own discipline rule that a table fits inside its card, and
          the body-level overflow check did not catch it because the card was
          scrolling internally rather than pushing the page.

          The curve did not need HEIGHT, it needed WIDTH — an S-curve reads wide
          and short, and most of that 550px panel was empty air above the line.
          So the S-Curve now takes a full-width row of its own at a ~300px panel
          (230px of chart), which is MORE prominent than either the KPI tile it
          started as or the tall column it briefly occupied, and the table gets
          the two-thirds column it needs. */}
      {/* --- S-Curve, full width on its own row --------------------------- */}
      <div style={{ marginBottom: 14, background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>S-Curve</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}><span style={{ color: 'var(--text)' }}>━ actual</span> · <span>┄ planned</span></div>
        </div>
        {/* The 260x92 viewBox and the 230px rendered height are unchanged; only
            the SERIES is real now.
            vector-effect="non-scaling-stroke" is what makes that safe: the
            viewBox is stretched by preserveAspectRatio="none", so without it
            every stroke would be scaled by ~3x horizontally and the grid
            lines would render as thick bars. With it the strokes stay in
            screen units and the curve reads at panel size.
            The "now" marker is a ZERO-LENGTH LINE with a round cap rather
            than a <circle>: a circle in a non-uniformly stretched viewBox
            draws as an ellipse, whereas a round line cap is measured in
            screen units and stays a true dot at any panel width. */}
        {!curve.ok ? (
          <Empty icon="gauge">{CURVE_EMPTY[curve.reason] || 'The curve cannot be computed yet.'}</Empty>
        ) : (
          <>
            <svg viewBox="0 0 260 92" preserveAspectRatio="none" style={{ width: '100%', height: 230, marginTop: 8, display: 'block' }}>
              <line x1="0" y1="23" x2="260" y2="23" stroke="var(--track)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="46" x2="260" y2="46" stroke="var(--track)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="69" x2="260" y2="69" stroke="var(--track)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {/* NOW is where today actually falls on the contracted timeline,
                  not the middle of the box. Off the timeline entirely (the
                  programme has not started, or has run past its end) and there
                  is no gridline to draw. */}
              {curveSvg.nowX != null && (
                <line x1={curveSvg.nowX} y1="0" x2={curveSvg.nowX} y2="92" stroke="var(--line-ctrl)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              )}
              <polyline points={curveSvg.planPoints} fill="none" stroke="var(--text-faint)" strokeWidth="1.6" strokeDasharray="3 6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {curveSvg.actualPoints && (
                <polyline points={curveSvg.actualPoints} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
              {curveSvg.dotX != null && (
                <line x1={curveSvg.dotX} y1={curveSvg.dotY} x2={curveSvg.dotX} y2={curveSvg.dotY} stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>
              <span>{curve.start}</span>
              <span>{curve.asOf ? `NOW · ${curve.asOf}` : ''}</span>
              <span>{curve.end}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
              {curve.installedNow.toLocaleString()} installed of {curve.plannedTotal.toLocaleString()} planned
              {curve.plannedNow != null && ` · plan to date ${curve.plannedNow.toLocaleString()}`}
              {curve.unscheduled.length > 0 && ` · ${curve.unscheduled.length} project${curve.unscheduled.length === 1 ? '' : 's'} with scope but no schedule are not in this curve`}
            </div>
          </>
        )}
      </div>

      {/* Attention List at two-thirds so every column including AGE fits, and
          Recent Activity at one-third, which is the shape a timeline wants. */}
      <div className="ies-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Attention List</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{scopeLabel}</div>
          </div>
          <div className="ies-table-wrap">
            {attentionList.length === 0 ? <Empty icon="check">All clear — nothing needs attention.</Empty> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 12 }}>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Item</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Project</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Blocked On</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {attentionList.map((a, i) => (
                    <tr key={i} className="ies-trow" style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-s)', background: a.tagBg, color: a.tagColor }}>{a.type}</span>
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{a.item}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{a.project}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-3)' }}>{a.who}</td>
                      <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', color: a.ageColor }}>{a.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Recent Activity</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Last 24h</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentActivity.length === 0 ? <Empty icon="bell">Nothing was written in the last 24 hours. Any install entry, document decision or material movement appears here.</Empty> : recentActivity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: a.dot, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}><span style={{ fontWeight: 600 }}>{a.actor}</span> <span style={{ color: 'var(--text-3)' }}>{a.what}</span></div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{a.where} · {a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical Materials (dc 251-263) */}
      <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Critical Materials</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Running low · all projects</div>
        </div>
        {criticalMaterials.length === 0 ? <Empty icon="check">All materials above threshold.</Empty> : (
          <div className="ies-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {criticalMaterials.map((m, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>{m.esm}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{m.status}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, margin: '6px 0 8px' }}>{m.name}</div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}><div style={{ height: '100%', width: m.w, background: 'linear-gradient(90deg,var(--accent),var(--brass-bright))' }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>
                  <span>{m.stock} in stock</span><span>min {m.threshold}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer open={help} title="Understanding the Dashboard" subtitle="What each card shows, where the data comes from, and what changes it." onClose={() => setHelp(false)} width={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CARD_DOCS.map(([name, def, source, controls]) => (
            <div key={name} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 4 }}>{def}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}><span style={{ fontFamily: 'var(--mono)' }}>Source:</span> {source}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}><span style={{ fontFamily: 'var(--mono)' }}>Changed by:</span> {controls}</div>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  )
}
