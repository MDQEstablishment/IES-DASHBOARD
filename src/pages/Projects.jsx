import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { PageTitle, Loading, Empty } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery } from '../lib/db'
import { num } from '../lib/format'
import { statusMeta, MANAGERS } from '../lib/constants'

const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['draft', 'Draft'],
  ['on_hold', 'On-Hold'],
  ['closed', 'Closed'],
]

export default function Projects() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [filter, setFilter] = useState('all')

  const { rows: projects, loading } = useLiveQuery('projects', (q) =>
    q.select('*, pm:profiles!projects_pm_id_fkey(full_name)').order('code'))
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,project_id'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: projectEsms } = useLiveQuery('project_esms', (q) => q.select('id,project_id'))

  const canAddProject = can(role, MANAGERS)
  const projectsReadOnly = !canAddProject

  // approved-installed qty per scope
  const insByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })

  // building -> project map
  const bProj = {}
  buildings.forEach((b) => { bProj[b.id] = b.project_id })

  // weighted progress (Σ approved-installed capped per scope ÷ Σ planned) per project
  const prog = {}
  scopes.forEach((s) => {
    const pid = bProj[s.building_id]; if (!pid) return
    const ins = Math.min(s.planned_qty || 0, insByScope[s.id] || 0)
    prog[pid] = prog[pid] || { planned: 0, installed: 0 }
    prog[pid].planned += s.planned_qty || 0
    prog[pid].installed += ins
  })

  const bldgCount = {}
  buildings.forEach((b) => { bldgCount[b.project_id] = (bldgCount[b.project_id] || 0) + 1 })
  const esmCount = {}
  projectEsms.forEach((e) => { esmCount[e.project_id] = (esmCount[e.project_id] || 0) + 1 })

  const filtered = projects.filter((p) => filter === 'all' || p.status === filter)

  const iconUpload = <Icon name="upload" size={15} />
  const iconPlus = <Icon name="plus" size={15} />

  return (
    <div data-screen-label="Projects">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <PageTitle kicker="RETROFIT PROGRAMME" title="Projects" />
        {canAddProject && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ies-hover" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--line)', background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{iconUpload}Import Excel</button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>{iconPlus}Add Project</button>
          </div>
        )}
      </div>

      {projectsReadOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 9, padding: '9px 13px', fontSize: 12.5, marginBottom: 14 }}>
          <Icon name="alert" size={15} />Read-only access — your role can view projects but not edit them.
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(([key, label]) => {
          const active = filter === key
          const [col, bg] = key === 'all' ? ['#2563EB', '#EFF6FF'] : statusMeta(key)
          return (
            <button key={key} onClick={() => setFilter(key)}
              style={{ padding: '6px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (active ? col : 'var(--line)'), background: active ? bg : '#fff' }}>
              <span style={{ color: active ? col : 'var(--text-3)' }}>{label}</span>
            </button>
          )
        })}
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="projects">No projects match this filter.</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((p) => {
            const d = prog[p.id] || { planned: 0, installed: 0 }
            const pp = d.planned ? Math.round((d.installed / d.planned) * 100) : 0
            const remaining = Math.max(0, d.planned - d.installed)
            const [pillColor, pillBg, pillLabel] = statusMeta(p.status)
            const barCol = pp >= 100 ? '#10B981' : 'var(--accent)'
            const r = 22, circ = 2 * Math.PI * r
            const ringDash = `${((pp / 100) * circ).toFixed(1)} ${circ.toFixed(1)}`
            return (
              <button key={p.id} className="ies-hover" onClick={() => navigate(`/projects/${p.id}`)}
                style={{ textAlign: 'left', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 0, display: 'flex', alignItems: 'stretch', overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', cursor: 'pointer' }}>
                <div style={{ width: 4, background: pillColor, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 18, padding: '15px 18px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 50, height: 50, flex: 'none' }}>
                    <svg viewBox="0 0 50 50" style={{ width: 50, height: 50 }}>
                      <circle cx="25" cy="25" r="22" fill="none" stroke="#EFF2F6" strokeWidth="5" />
                      <circle cx="25" cy="25" r="22" fill="none" stroke={barCol} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 25 25)" />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700 }}>{pp}%</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>{p.code}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: pillColor, background: pillBg }}>{pillLabel}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15.5, marginTop: 3, letterSpacing: '-.2px' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>🏛 {p.client || '—'} · 📍 {p.region || '—'} · 👷 {p.pm?.full_name || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center', flex: 'none' }}>
                    <div style={{ textAlign: 'center', minWidth: 58 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--warn)' }}>{num(remaining)}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.5px', color: 'var(--text-3)', marginTop: 2 }}>REMAINING</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 44 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }}>{bldgCount[p.id] || 0}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.5px', color: 'var(--text-3)', marginTop: 2 }}>BLDGS</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 44 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }}>{esmCount[p.id] || 0}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.5px', color: 'var(--text-3)', marginTop: 2 }}>ESMs</div>
                    </div>
                    <span style={{ color: '#CBD5E1' }}><Icon name="chevronr" size={18} /></span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
