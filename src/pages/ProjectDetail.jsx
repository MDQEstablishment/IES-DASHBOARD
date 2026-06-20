import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { Avatar, Chip, Loading, Empty, Drawer, Btn } from '../components/ui'
import { useLiveQuery, bgUpdate } from '../lib/db'
import { useAuth, can } from '../rbac'
import { num, fmtDate } from '../lib/format'
import { statusMeta, MANAGERS } from '../lib/constants'
import { useBreadcrumb } from '../breadcrumbs'
import { ProjectFormModal, StatusChangeModal } from '../components/ProjectModals'
import BuildingsMap from '../components/BuildingsMap'
import MaterialDeliveries from '../components/MaterialDeliveries'
import ProjectDocuments from '../components/ProjectDocuments'

// Doc-tracker matrix columns (kind -> header label), per the canonical design.
const DOC_COLS = [
  ['material_submittal', 'Material Submittal'],
  ['method_statement', 'Method Statement'],
  ['mir', 'MIR'],
  ['wir', 'WIR'],
  ['coc', 'COC'],
]

const TABS = [
  ['buildings', 'Buildings'],
  ['rollup', 'ESM Rollup'],
  ['deliveries', 'Deliveries'],
  ['docs', 'Doc Tracker'],
  ['map', 'Map'],
]

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setLabel } = useBreadcrumb()
  const { role } = useAuth()
  const [tab, setTab] = useState('buildings')
  const [esmPanel, setEsmPanel] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const canManage = can(role, MANAGERS)

  const { rows: projects, loading } = useLiveQuery('projects', (q) =>
    q.select('*,pm:profiles!projects_pm_id_fkey(full_name)').eq('id', id), [id])
  const project = projects[0]
  useEffect(() => { if (project) setLabel('project:' + id, project.code) }, [project, id, setLabel])
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('*').eq('project_id', id).order('code'), [id])
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,material_code,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: docStatus } = useLiveQuery('esm_doc_status', (q) =>
    q.select('*,esm:esms(code,name)').eq('project_id', id).order('esm_id'), [id])
  const { rows: projectEsms } = useLiveQuery('project_esms', (q) =>
    q.select('id,project_id,custom_name,ordinal,esm:esms(code,name)').eq('project_id', id).order('ordinal'), [id])

  if (loading && !project) return <Loading />
  if (!project) return <Empty icon="projects">Project not found.</Empty>

  // --- progress math (approved-installed capped per scope) ---------------------
  const bIds = new Set(buildings.map((b) => b.id))
  const insByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })

  const perB = {}
  let planned = 0, installed = 0, acP = 0, acI = 0
  // rollup keyed by esm code: planned vs installed
  const rollup = {}
  scopes.filter((s) => bIds.has(s.building_id)).forEach((s) => {
    const ins = Math.min(s.planned_qty || 0, insByScope[s.id] || 0)
    planned += s.planned_qty || 0
    installed += ins
    const code = (s.material_code || '').toUpperCase()
    if (code.startsWith('AC')) { acP += s.planned_qty || 0; acI += ins }
    perB[s.building_id] = perB[s.building_id] || { planned: 0, installed: 0 }
    perB[s.building_id].planned += s.planned_qty || 0
    perB[s.building_id].installed += ins
    // group rollup by material_code prefix's ESM mapping isn't available on scope;
    // bucket by material_code so ESM rollup reflects real planned/installed.
    rollup[code] = rollup[code] || { planned: 0, installed: 0 }
    rollup[code].planned += s.planned_qty || 0
    rollup[code].installed += ins
  })

  const overall = planned ? Math.round((installed / planned) * 100) : 0
  const totalWeeks = project.total_weeks || 0
  const weeksElapsed = project.start_date
    ? Math.max(0, Math.floor((Date.now() - new Date(project.start_date).getTime()) / (7 * 86400000)))
    : 0
  // Time-linked remaining: days until end_date (red when <= 14). Falls back to weeks.
  const daysToEnd = project.end_date ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000) : null
  const weeksRemaining = Math.max(0, totalWeeks - weeksElapsed)

  const [pillColor, pillBg, pillLabel] = statusMeta(project.status)
  const r = 26, circ = 2 * Math.PI * r
  const ringDash = `${((overall / 100) * circ).toFixed(1)} ${circ.toFixed(1)}`
  const timeline = totalWeeks ? `${weeksElapsed}/${totalWeeks} wks` : '—'

  const iconPlus = <Icon name="plus" size={15} />
  const iconUpload = <Icon name="upload" size={15} />

  // --- ESM rollup rows ---------------------------------------------------------
  const esmRows = projectEsms.length
    ? projectEsms.map((pe, i) => {
        const code = pe.esm?.code || `ESM${i + 1}`
        const name = pe.custom_name || pe.esm?.name || code
        // best-effort: match scopes whose material_code starts with the esm code
        const key = (pe.esm?.code || '').toUpperCase()
        const bucket = Object.entries(rollup)
          .filter(([mc]) => key && mc.startsWith(key))
          .reduce((a, [, v]) => ({ planned: a.planned + v.planned, installed: a.installed + v.installed }), { planned: 0, installed: 0 })
        return { code, name, ...bucket }
      })
    : []

  // --- doc tracker matrix ------------------------------------------------------
  const esmByCode = {}
  docStatus.forEach((d) => {
    const code = d.esm?.code || `ESM${d.esm_id}`
    esmByCode[code] = esmByCode[code] || { code, name: d.esm?.name, cells: {} }
    esmByCode[code].cells[d.kind] = d.status
  })
  const docRows = Object.values(esmByCode)

  return (
    <div data-screen-label="Project Detail">
      {/* back link + project actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Link to="/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="chevronl" size={14} />All projects
        </Link>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon="edit" style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setEditOpen(true)}>Edit project</Btn>
            <Btn icon="settings" style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setStatusOpen(true)}>Change status</Btn>
          </div>
        )}
      </div>

      {/* header card */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <div style={{ position: 'relative', background: 'linear-gradient(120deg,#0F172A,#1E293B)', padding: '20px 22px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: .4, background: 'radial-gradient(420px 220px at 88% -20%,rgba(37,99,235,.45),transparent 60%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '1px', color: '#94A3B8' }}>{project.code}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: pillColor, background: pillBg }}>{pillLabel}</span>
              </div>
              <h1 style={{ fontSize: 23, fontWeight: 800, margin: '8px 0 8px', color: '#fff', letterSpacing: '-.3px' }}>{project.name}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12.5, color: '#CBD5E1' }}>
                <span>🏛 {project.client || '—'}</span>
                <span>📍 {project.region || '—'}</span>
                <span>👷 PM {project.pm?.full_name || '—'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: '#fff' }}>⏱ {timeline}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 'none' }}>
              <div style={{ position: 'relative', width: 84, height: 84, flex: 'none', cursor: 'help' }} title="Progress = installed ÷ planned across all building scopes, weighted by scope size. Engineer install entries move this number.">
                <svg viewBox="0 0 64 64" style={{ width: 84, height: 84 }}>
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="7" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#60A5FA" strokeWidth="7" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 32 32)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{overall}%</span>
                  <span style={{ fontSize: 8, color: '#94A3B8', letterSpacing: '.5px' }}>DONE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: '#fff' }}>
          <div style={{ padding: '13px 18px', borderRight: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>TIMELINE</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 3 }}>{totalWeeks || '—'} wks</div>
          </div>
          <div style={{ padding: '13px 18px', borderRight: '1px solid var(--line)' }} title={project.end_date ? `Ends ${fmtDate(project.end_date)}` : 'No end date set'}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>REMAINING</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 3, color: (daysToEnd != null && daysToEnd <= 14) ? 'var(--bad)' : 'var(--warn)' }}>
              {daysToEnd != null ? `${Math.max(0, daysToEnd)} days` : `${weeksRemaining} wks`}
            </div>
          </div>
          <div style={{ padding: '13px 18px', borderRight: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>BUILDINGS</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 3 }}>{buildings.length}</div>
          </div>
          <div style={{ padding: '13px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px', color: 'var(--text-3)' }}>ESMs</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 3 }}>{projectEsms.length}</div>
          </div>
        </div>
      </div>

      {/* secondary KPI strip: AC units installed/planned */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, fontSize: 12, color: 'var(--text-3)' }}>
        <span style={{ fontFamily: 'var(--mono)' }}>AC UNITS {num(acI)} / {num(acP)}</span>
        <span style={{ fontFamily: 'var(--mono)' }}>· UNITS {num(installed)} / {num(planned)}</span>
      </div>

      {/* tab row */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(([key, label]) => {
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '10px 15px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', background: 'none', border: 'none',
                color: active ? 'var(--accent)' : 'var(--text-3)', borderBottom: '2px solid ' + (active ? 'var(--accent)' : 'transparent') }}>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {/* BUILDINGS tab */}
      {tab === 'buildings' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Buildings</div>
          {buildings.length === 0 ? (
            <Empty icon="buildings">No buildings yet. Import an Excel or add buildings to populate this project.</Empty>
          ) : (
            <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>CODE</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>BUILDING</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>CONTRACTOR</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>ENGINEER</th>
                <th style={{ padding: '9px 8px', fontWeight: 600, width: 130 }}>PROGRESS</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }} title="Scheduled vs actual material delivery for the building">MATERIAL DELIVERY</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }} title="Approval status of formal COCs and material submittals for this building">APPROVAL</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>STATUS</th>
              </tr></thead>
              <tbody>
                {buildings.map((b) => {
                  const d = perB[b.id] || { planned: 0, installed: 0 }
                  const prog = d.planned ? Math.round((d.installed / d.planned) * 100) : 0
                  const color = prog >= 100 ? '#10B981' : 'var(--accent)'
                  return (
                    <tr key={b.id} onClick={() => navigate(`/projects/${id}/buildings/${b.id}`)} className="ies-trow" style={{ borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
                      <td style={{ padding: '11px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{b.code}</td>
                      <td style={{ padding: '11px 8px' }}><div style={{ fontWeight: 600 }}>{b.name}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{b.region || '—'}</div></td>
                      <td style={{ padding: '11px 8px', color: 'var(--text-3)' }}>{b.contractor || '—'}</td>
                      <td style={{ padding: '11px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={b.engineer_name} size={22} /><span style={{ color: 'var(--text-3)' }}>{b.engineer_name || '—'}</span></div></td>
                      <td style={{ padding: '11px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 4, background: '#EFF2F6', overflow: 'hidden' }}><div style={{ height: '100%', width: prog + '%', background: color }} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, width: 34, textAlign: 'right' }}>{prog}%</span>
                      </div></td>
                      <td style={{ padding: '11px 8px' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{b.delivery_date ? fmtDate(b.delivery_date) : '—'}</div>
                        <Chip status={b.delivery_status || 'pending'} />
                      </td>
                      <td style={{ padding: '11px 8px' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{b.approval_date ? fmtDate(b.approval_date) : '—'}</div>
                        <Chip status={b.approval_status || 'awaiting'} />
                      </td>
                      <td style={{ padding: '11px 8px' }}><Chip status={b.status_override || 'pending'} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {/* ESM ROLLUP tab */}
      {tab === 'rollup' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>ESM Rollup</div>
            {canManage && <Btn icon="settings" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => setEsmPanel(true)}>Manage ESMs</Btn>}
          </div>
          {esmRows.length === 0 ? (
            <Empty icon="materials">No ESMs configured for this project.</Empty>
          ) : (
            <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>ESM</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>DESCRIPTION</th>
                <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>PLANNED</th>
                <th style={{ padding: '9px 8px', fontWeight: 600, textAlign: 'right' }}>INSTALLED</th>
                <th style={{ padding: '9px 8px', fontWeight: 600, width: 160 }}>PROGRESS</th>
              </tr></thead>
              <tbody>
                {esmRows.map((e) => {
                  const prog = e.planned ? Math.round((e.installed / e.planned) * 100) : 0
                  return (
                    <tr key={e.code} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '11px 8px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{e.code}</td>
                      <td style={{ padding: '11px 8px', fontWeight: 600 }}>{e.name}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{num(e.planned)}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ok)' }}>{num(e.installed)}</td>
                      <td style={{ padding: '11px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 4, background: '#EFF2F6', overflow: 'hidden' }}><div style={{ height: '100%', width: prog + '%', background: '#2563EB' }} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, width: 34, textAlign: 'right' }}>{prog}%</span>
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {/* DELIVERIES tab */}
      {tab === 'deliveries' && <MaterialDeliveries projectId={id} buildings={buildings} />}

      {/* DOC TRACKER tab */}
      {tab === 'docs' && (
        <>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>ESM Documentation Tracker</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>Submittal readiness per ESM across document kinds.</div>
          {docRows.length === 0 ? (
            <Empty icon="doc">No ESM document tracking yet.</Empty>
          ) : (
            <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>ESM</th>
                {DOC_COLS.map(([k, label]) => <th key={k} style={{ padding: '9px 8px', fontWeight: 600 }}>{label}</th>)}
              </tr></thead>
              <tbody>
                {docRows.map((row) => (
                  <tr key={row.code} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 8px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{row.code}</td>
                    {DOC_COLS.map(([k]) => (
                      <td key={k} style={{ padding: 8 }}><Chip status={row.cells[k] || 'Missing'} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
        <ProjectDocuments projectId={id} />
        </>
      )}

      {/* MAP tab — real OpenStreetMap markers */}
      {tab === 'map' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Buildings Map — {project.region || '—'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>CLICK A MARKER FOR CONTRACTOR INFO</div>
          </div>
          <BuildingsMap buildings={buildings} />
        </div>
      )}

      {/* Manage ESMs panel (dc esmPanelOpen / panelOpen) */}
      <Drawer open={esmPanel} title="Manage ESMs" subtitle={`${project.code} · rename, reorder & archive`} onClose={() => setEsmPanel(false)}
        footer={<Btn variant="primary" onClick={() => setEsmPanel(false)}>Done</Btn>}>
        {projectEsms.length === 0 ? <Empty icon="materials">No ESMs on this project.</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Inline-rename an ESM for this project. The label propagates to the rollup, doc tracker, materials and reports; every change is audit-logged.</div>
            {projectEsms.map((pe) => (
              <div key={pe.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', width: 44 }}>{pe.esm?.code}</span>
                <input defaultValue={pe.custom_name || pe.esm?.name || ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== (pe.custom_name || pe.esm?.name)) bgUpdate('project_esms', pe.id, { custom_name: v }, { okMsg: 'ESM renamed' })
                  }}
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13 }} />
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {editOpen && <ProjectFormModal mode="edit" project={project} onClose={() => setEditOpen(false)} />}
      {statusOpen && <StatusChangeModal project={project} onClose={() => setStatusOpen(false)} />}
    </div>
  )
}
