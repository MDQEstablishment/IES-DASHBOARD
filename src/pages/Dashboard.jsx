import { useState } from 'react'
import Icon from '../components/Icon'
import { RingChart, Loading, Empty, Drawer } from '../components/ui'
import { useLiveQuery } from '../lib/db'
import { ago } from '../lib/format'

// Card documentation (also exported to docs/Dashboard-Cards-Reference.md)
const CARD_DOCS = [
  ['Total Projects', 'Count of non-deleted projects.', 'projects table', 'Add Project / Delete Project actions'],
  ['Portfolio Progress', 'Weighted average installed ÷ planned across active projects.', 'install_log ÷ building_item_scope', 'Engineer install entries'],
  ['S-Curve', 'Planned vs actual progress over time.', 'install_log aggregated by week', 'Daily Report submissions'],
  ['COCs Signed', 'Individual COCs approved by the client out of the expected total (building × ESM coverage across active projects). The expected plan follows each project’s COC layout + ESM bundles — see default_coc_plan / “Generate Default COCs”.', 'v_project_doc_progress (approved_count ÷ expected_count, doc_type=coc)', 'Client COC approvals; COC layout & bundles in Edit Project'],
  ['Progress by Project', 'Per-project weighted %.', 'install_log + building_item_scope', 'Engineer log entries'],
  ['Progress by ESM', 'Per-ESM aggregated % across the portfolio.', 'install_log grouped by ESM', 'Engineer log entries'],
  ['Attention List', 'Open escalations + blocked tasks.', 'escalations + tasks', 'Auto-detected blockers + manual escalations'],
  ['Recent Activity', 'Last writes across the programme.', 'audit_log', 'Any write action'],
  ['Critical Materials', 'Materials at or below their reorder threshold.', 'materials (received vs threshold)', 'Material receipts + install activity'],
]

// ESM bucket inference from material_code prefix (fallback when no scope→esm join)
function esmOf(code) {
  const c = (code || '').toUpperCase()
  if (c.startsWith('LED')) return 'ESM1'
  if (c.startsWith('SENS')) return 'ESM2'
  if (c.startsWith('AC') || c.startsWith('BR') || c.startsWith('RC')) return 'ESM3'
  return null
}
const ESM_META = {
  ESM1: { no: 'ESM1', name: 'Lighting / Fixtures' },
  ESM2: { no: 'ESM2', name: 'Lighting Control / Sensors' },
  ESM3: { no: 'ESM3', name: 'AC Units' },
}

export default function Dashboard() {
  const [help, setHelp] = useState(false)
  const { rows: projects } = useLiveQuery('projects', (q) => q.select('id,code,name,status,client,region'))
  const { rows: allBuildings } = useLiveQuery('buildings', (q) => q.select('id,project_id,status_override'))
  const buildings = allBuildings.filter((b) => b.status_override !== 'archived')
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,material_code,planned_qty'))
  const { rows: install, loading } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: escs } = useLiveQuery('escalations', (q) =>
    q.select('id,title,severity,status,created_at,building:buildings(code,name),raised_to:profiles!escalations_raised_to_id_fkey(full_name)')
      .neq('status', 'resolved').neq('status', 'closed').order('severity', { ascending: false }))
  const { rows: tasks } = useLiveQuery('tasks', (q) => q.select('id,title,status,priority,created_at'))
  const { rows: materials } = useLiveQuery('materials', (q) => q.select('code,name,received,threshold,esm:esms(code)'))
  const { rows: activity } = useLiveQuery('audit_log', (q) => q.select('id,actor_name,action,entity_type,summary,created_at').order('created_at', { ascending: false }).limit(6))
  const { rows: cocProg } = useLiveQuery('v_project_doc_progress', (q) => q.select('project_id,expected_count,approved_count').eq('doc_type', 'coc'))

  // approved-installed per scope, capped at planned_qty
  const installedByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') installedByScope[r.scope_id] = (installedByScope[r.scope_id] || 0) + (r.qty || 0) })
  const bP = {}; buildings.forEach((b) => { bP[b.id] = b.project_id })

  let planned = 0, installed = 0
  const per = {}       // project_id -> {planned, installed}
  const esmAgg = {}    // ESMx -> {planned, installed}
  scopes.forEach((s) => {
    const ins = Math.min(s.planned_qty || 0, installedByScope[s.id] || 0)
    planned += s.planned_qty || 0; installed += ins
    const pid = bP[s.building_id]
    if (pid) { (per[pid] = per[pid] || { planned: 0, installed: 0 }); per[pid].planned += s.planned_qty || 0; per[pid].installed += ins }
    const e = esmOf(s.material_code)
    if (e) { (esmAgg[e] = esmAgg[e] || { planned: 0, installed: 0 }); esmAgg[e].planned += s.planned_qty || 0; esmAgg[e].installed += ins }
  })
  const overall = planned ? (installed / planned) * 100 : 0

  // KPIs
  const kpiProjects = projects.length
  const kpiActive = projects.filter((p) => p.status === 'active').length
  const kpiDraft = projects.filter((p) => p.status === 'draft').length

  // Portfolio ring dash (r=26 → circ ≈ 163.4)
  const CIRC = (2 * Math.PI * 26)
  const portFrac = Math.min(1, overall / 100)
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
  const projectBars = projects.map((p) => {
    const d = per[p.id] || { planned: 0, installed: 0 }
    const prog = d.planned ? Math.round((d.installed / d.planned) * 100) : 0
    const barColor = prog >= 67 ? '#10B981' : prog >= 34 ? '#2563EB' : '#F59E0B'
    return { name: p.name, prog, progW: prog + '%', barColor }
  })

  // Progress by ESM bars (portfolio)
  const esmBars = ['ESM1', 'ESM2', 'ESM3'].map((k) => {
    const d = esmAgg[k] || { planned: 0, installed: 0 }
    const prog = d.planned ? Math.round((d.installed / d.planned) * 100) : 0
    return { no: ESM_META[k].no, name: ESM_META[k].name, prog, progW: prog + '%' }
  })

  // S-Curve (illustrative): synthesize cumulative actual ramping to current overall,
  // plan ramping slightly ahead. 13 points across width 260, height 92 (0 top).
  const N = 13, W = 260, H = 92
  const planPts = [], actPts = []
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    const x = (t * W).toFixed(1)
    const planY = H - (Math.pow(t, 0.85) * (H - 10))
    const actFrac = Math.min(1, portFrac) * Math.min(1, t / 0.5) // actual reaches `overall` at "now" (midpoint)
    const actY = H - (actFrac * (H - 10))
    planPts.push(`${x},${planY.toFixed(1)}`)
    if (t <= 0.5) actPts.push(`${x},${actY.toFixed(1)}`)
  }
  const planPoints = planPts.join(' ')
  const actualPoints = actPts.join(' ')
  const [ax, ay] = (actPts[actPts.length - 1] || '130,92').split(',')
  const actualNowX = ax
  const actualNowY = ay

  // Attention List — open escalations + blocked tasks
  const blocked = tasks.filter((t) => t.status === 'blocked')
  const sevAgeColor = (s) => (s === 'critical' ? '#EF4444' : s === 'high' ? '#F59E0B' : 'var(--text-3)')
  const attentionList = [
    ...escs.map((e) => ({
      type: 'ESC', tagBg: '#FEF2F2', tagColor: '#EF4444',
      item: e.title, project: e.building?.code || e.building?.name || '—',
      who: e.raised_to?.full_name || '—',
      age: ago(e.created_at), ageColor: sevAgeColor(e.severity),
    })),
    ...blocked.map((t) => ({
      type: 'TASK', tagBg: '#FFFBEB', tagColor: '#F59E0B',
      item: t.title, project: '—', who: '—',
      age: ago(t.created_at), ageColor: t.priority === 'critical' ? '#EF4444' : 'var(--text-3)',
    })),
  ]

  // Critical Materials — running low (in-stock = received, low vs threshold). dc 251-263
  const criticalMaterials = materials
    .map((m) => {
      const stock = m.received || 0, t = m.threshold || 0
      const ratio = t ? stock / t : 9
      const color = stock < t ? '#EF4444' : stock < t * 1.5 ? '#F59E0B' : '#10B981'
      const status = stock < t ? 'CRITICAL' : stock < t * 1.5 ? 'LOW' : 'OK'
      return { esm: m.esm?.code || '—', name: m.name, stock, threshold: t, color, status, ratio, w: Math.min(100, Math.round((stock / (t * 2 || 1)) * 100)) + '%' }
    })
    .filter((m) => m.status !== 'OK')
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 3)

  // Recent Activity — real audit_log feed. dc 241-248
  const actDot = (a) => {
    const e = (a.entity_type || '').toLowerCase()
    if (e.includes('install')) return '#2563EB'
    if (e.includes('document') || e.includes('doc')) return '#10B981'
    if (e.includes('material')) return '#F59E0B'
    if (e.includes('escalation')) return '#EF4444'
    return '#64748B'
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
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>EXECUTIVE SNAPSHOT</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>{dashTitle}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>Scope: {scopeLabel}</div>
          <button onClick={() => setHelp(true)} className="ies-card-hover" title="What does each card mean?" style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>?</button>
        </div>
      </div>

      <div className="ies-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="projects" size={16} />Total Projects</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700, marginTop: 8, lineHeight: 1 }}>{kpiProjects}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--ok)' }}>● {kpiActive} active</span>
            <span style={{ color: 'var(--text-3)' }}>○ {kpiDraft} draft</span>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="gauge" size={16} />Portfolio Progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <svg viewBox="0 0 64 64" style={{ width: 72, height: 72, flex: 'none' }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="#EFF2F6" strokeWidth="8" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="#2563EB" strokeWidth="8" strokeLinecap="round" strokeDasharray={portRingDash} transform="rotate(-90 32 32)" />
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{Math.round(overall)}<span style={{ fontSize: 15, color: 'var(--text-3)' }}>%</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>weighted · {kpiActive} active</div>
            </div>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="curve" size={16} />S-Curve</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}><span style={{ color: 'var(--text)' }}>━ actual</span> · <span>┄ planned</span></div>
          </div>
          <svg viewBox="0 0 260 92" preserveAspectRatio="none" style={{ width: '100%', height: 92, marginTop: 8, display: 'block' }}>
            <line x1="130" y1="0" x2="130" y2="92" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="2 3" />
            <polyline points={planPoints} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="4 4" strokeLinejoin="round" />
            <polyline points={actualPoints} fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={actualNowX} cy={actualNowY} r="3.2" fill="#2563EB" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)', marginTop: 2 }}>
            <span>−12 wk</span><span>now</span><span>+12 wk</span>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}><Icon name="doc" size={16} />COCs Signed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <svg viewBox="0 0 64 64" style={{ width: 72, height: 72, flex: 'none' }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="#EFF2F6" strokeWidth="8" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="#10B981" strokeWidth="8" strokeLinecap="round" strokeDasharray={cocRingDash} transform="rotate(-90 32 32)" />
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{cocX}<span style={{ fontSize: 15, color: 'var(--text-3)' }}> of {cocY}</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>individual COCs approved across active projects</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ies-2col" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Progress by Project</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>WEIGHTED %</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {projectBars.length === 0 ? <Empty icon="projects">No projects yet.</Empty> : projectBars.map((p, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: p.barColor, flex: 'none', marginLeft: 8 }}>{p.prog}%</span>
                </div>
                <div style={{ height: 9, borderRadius: 5, background: '#EFF2F6', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: p.progW, background: p.barColor }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Progress by ESM</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>PORTFOLIO</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {esmBars.map((e, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{e.no}</span> {e.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, flex: 'none', marginLeft: 8 }}>{e.prog}%</span>
                </div>
                <div style={{ height: 9, borderRadius: 5, background: '#EFF2F6', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: e.progW, background: 'linear-gradient(90deg,#2563EB,#3B82F6)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ies-2col" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Attention List</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>{scopeLabel}</div>
          </div>
          <div className="ies-table-wrap">
            {attentionList.length === 0 ? <Empty icon="check">All clear — nothing needs attention.</Empty> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>TYPE</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>ITEM</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>PROJECT</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>BLOCKED ON</th>
                    <th style={{ padding: '9px 8px', fontWeight: 600 }}>AGE</th>
                  </tr>
                </thead>
                <tbody>
                  {attentionList.map((a, i) => (
                    <tr key={i} className="ies-trow" style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: a.tagBg, color: a.tagColor }}>{a.type}</span>
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
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Recent Activity</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>LAST 24H</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentActivity.length === 0 ? <Empty icon="bell">No recent activity.</Empty> : recentActivity.map((a, i) => (
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
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Critical Materials</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>RUNNING LOW · ALL PROJECTS</div>
        </div>
        {criticalMaterials.length === 0 ? <Empty icon="check">All materials above threshold.</Empty> : (
          <div className="ies-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {criticalMaterials.map((m, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${m.color}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>{m.esm}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: m.color }}>{m.status}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, margin: '6px 0 8px' }}>{m.name}</div>
                <div style={{ height: 6, borderRadius: 4, background: '#EFF2F6', overflow: 'hidden' }}><div style={{ height: '100%', width: m.w, background: m.color }} /></div>
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
            <div key={name} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
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
