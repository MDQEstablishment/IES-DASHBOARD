import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { Avatar, Chip, Loading, Empty, Drawer, Btn } from '../components/ui'
import { useLiveQuery, bgUpdate, signedUrlFor } from '../lib/db'
import { useAuth, can } from '../rbac'
import { toast } from '../lib/toast'
import { num, fmtDate } from '../lib/format'
import { statusMeta, MANAGERS } from '../lib/constants'
import { useBreadcrumb } from '../breadcrumbs'
import { ProjectFormModal, StatusChangeModal, AssignEngineerModal } from '../components/ProjectModals'
import { BuildingFormModal, ArchiveBuildingModal, BuildingStatusModal } from '../components/BuildingModals'
import BuildingsMap from '../components/BuildingsMap'
import ProjectDocuments, { docStatusMeta, MULTI_KINDS, TYPE_LABEL, AttachmentChip } from '../components/ProjectDocuments'
import MaterialDeliveries from '../components/MaterialDeliveries'
import CocHome from '../components/CocHome'
import ProjectItems from '../components/ProjectItems'
import ProjectWarehouse from '../components/ProjectWarehouse'

// Doc-tracker matrix columns (kind -> header label), per the canonical design.
const DOC_COLS = [
  ['material_submittal', 'Material Submittal'],
  ['method_statement', 'Method Statement'],
  ['mir', 'MIR'],
  ['wir', 'WIR'],
]

const TABS = [
  ['buildings', 'Buildings'],
  ['rollup', 'BOQ'],
  ['items', 'Items & Replacements'],
  ['deliveries', 'Deliveries'],
  ['docs', 'Doc Tracker'],
  ['coc', 'COCs'],
  ['map', 'Map'],
  ['warehouse', 'Project Warehouse'],
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
  const [engOpen, setEngOpen] = useState(false)
  const [addBldgOpen, setAddBldgOpen] = useState(false)
  const [editBldg, setEditBldg] = useState(null)
  const [archiveBldg, setArchiveBldg] = useState(null)
  const [statusBldg, setStatusBldg] = useState(null)
  const [bldgQuery, setBldgQuery] = useState('') // raw input
  const [bldgQ, setBldgQ] = useState('')         // debounced (150ms)
  useEffect(() => { const t = setTimeout(() => setBldgQ(bldgQuery.trim().toLowerCase()), 150); return () => clearTimeout(t) }, [bldgQuery])
  const canManage = can(role, MANAGERS) || role === 'admin'

  const { rows: projects, loading } = useLiveQuery('projects', (q) =>
    q.select('*,pm:profiles!projects_pm_id_fkey(full_name),engineer:profiles!projects_engineer_id_fkey(full_name)').eq('id', id).is('deleted_at', null), [id])
  const project = projects[0]
  useEffect(() => { if (project) setLabel('project:' + id, project.code) }, [project, id, setLabel])
  const { rows: allBuildings } = useLiveQuery('buildings', (q) => q.select('*').eq('project_id', id).order('code'), [id])
  const buildings = allBuildings.filter((b) => b.status_override !== 'archived')
  // 8K-1 — debounced live filter across code / name / engineer / region / city / contractor
  const filteredBuildings = bldgQ
    ? buildings.filter((b) => [b.code, b.name, b.engineer_name, b.region, b.city, b.contractor].some((v) => (v || '').toLowerCase().includes(bldgQ)))
    : buildings
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,material_code,planned_qty,project_esm_id'))
  const { rows: catShort } = useLiveQuery('project_category_stock', (q) => q.select('is_short').eq('project_id', id).eq('is_short', true), [id])
  const anyShortage = catShort.length > 0
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: projectEsms } = useLiveQuery('project_esms', (q) =>
    q.select('id,project_id,custom_name,ordinal,esm:esms(id,code,name)').eq('project_id', id).order('ordinal'), [id])
  // Single source of truth for the ESM Documentation Tracker: all
  // project_documents for this project (COCs live in their own `cocs` table
  // now — see the COCs tab).
  const { rows: pdocs, refetch: refetchPdocs } = useLiveQuery('project_documents', (q) =>
    q.select('id,esm_id,building_id,doc_type,status,name,reference_no,revision,storage_path,version,submitted_at,client_reviewer_name,client_response_date').eq('project_id', id).neq('doc_type', 'coc'), [id])
  // Smart-matrix counts by cardinality (see migration 0046 view).
  const { rows: docProg, refetch: refetchProg } = useLiveQuery('v_project_doc_progress', (q) => q.select('*').eq('project_id', id), [id])
  const refetchDocs = () => { refetchPdocs(); refetchProg() }
  const cellDocs = (row, k) => pdocs.filter((d) => d.esm_id === row.esmId && d.doc_type === k)
  const [uploadReq, setUploadReq] = useState(null)
  const [drill, setDrill] = useState(null) // { esmId, esmCode, docType } for multi-kind drilldown

  const openFile = async (d) => {
    if (!d?.storage_path) { toast('No file attached to this document', 'err'); return }
    const url = await signedUrlFor('project-docs', d.storage_path)
    if (url) window.open(url, '_blank', 'noopener'); else toast("Couldn't open the document", 'err')
  }

  if (loading && !project) return <Loading />
  if (!project) return <Empty icon="projects">Project not found.</Empty>

  // --- progress math (approved-installed capped per scope) ---------------------
  const bIds = new Set(buildings.map((b) => b.id))
  const insByScope = {}
  install.forEach((r) => { if (r.qa_status === 'approved') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })

  // Map each scope's project_esm_id → its ESM code, so the BOQ rollup buckets by
  // the scope's REAL ESM (not by guessing from material_code, which fails for
  // imported codes like LED-T8-120-14W that don't start with "ESM1/2/3").
  const peCode = {}
  projectEsms.forEach((pe) => { peCode[pe.id] = (pe.esm?.code || '').toUpperCase() })

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
    // Bucket by the scope's real ESM (via project_esm_id); fall back to the
    // material_code only for legacy rows with no project_esm_id.
    const esmKey = peCode[s.project_esm_id] || code
    rollup[esmKey] = rollup[esmKey] || { planned: 0, installed: 0 }
    rollup[esmKey].planned += s.planned_qty || 0
    rollup[esmKey].installed += ins
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
        // Direct lookup by ESM code — rollup is now keyed by the scope's real ESM.
        const bucket = rollup[(pe.esm?.code || '').toUpperCase()] || { planned: 0, installed: 0 }
        return { code, name, ...bucket }
      })
    : []

  // --- doc tracker matrix (computed LIVE from project_documents) ---------------
  // One row per project ESM; each cell = the latest project-level document for
  // (esm, doc_kind), mapped to a review-state pill (or "Missing" if none).
  // Single-per-ESM cells (material_submittal / method_statement): latest doc.
  const cellByKey = {} // `${esm_id}|${doc_type}` -> latest doc
  pdocs.filter((d) => d.esm_id && !MULTI_KINDS.has(d.doc_type)).forEach((d) => {
    const k = `${d.esm_id}|${d.doc_type}`
    const cur = cellByKey[k]
    if (!cur || new Date(d.submitted_at || 0) >= new Date(cur.submitted_at || 0)) cellByKey[k] = d
  })
  // Multi-per-ESM cells (mir / wir / coc): counts from the progress view.
  const progByKey = {} // `${esm_code}|${doc_type}` -> { expected, submitted, approved, rejected }
  docProg.forEach((p) => { progByKey[`${p.esm_code}|${p.doc_type}`] = p })
  const docRows = projectEsms.filter((pe) => pe.esm).map((pe) => ({ esmId: pe.esm.id, code: pe.esm.code, name: pe.custom_name || pe.esm.name }))
  // docs for the active drilldown (esm, doc_type)
  const drillDocs = drill ? pdocs.filter((d) => d.esm_id === drill.esmId && d.doc_type === drill.docType)
    .sort((a, b) => (a.building_id || '').localeCompare(b.building_id || '') || (a.revision || '').localeCompare(b.revision || '')) : []
  // Avg days in client court = client_response_date - submitted_at over responded docs.
  const responded = pdocs.filter((d) => d.client_response_date && d.submitted_at)
  const avgDaysCourt = responded.length
    ? Math.round((responded.reduce((s, d) => s + Math.max(0, (new Date(d.client_response_date) - new Date(d.submitted_at)) / 86400000), 0) / responded.length) * 10) / 10
    : null

  return (
    <div data-screen-label="Project Detail">
      {/* back link + project actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Link to="/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="chevronl" size={14} />All projects
        </Link>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon="plus" variant="primary" style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setAddBldgOpen(true)}>Add building</Btn>
            <Btn icon="edit" style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setEditOpen(true)}>Edit project</Btn>
            <Btn icon="settings" style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setStatusOpen(true)}>Change status</Btn>
          </div>
        )}
      </div>

      {/* header card */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,26,36,.06)' }}>
        <div style={{ position: 'relative', background: 'linear-gradient(120deg,#10273B,#1B3A53)', padding: '20px 22px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: .4, background: 'radial-gradient(420px 220px at 88% -20%,rgba(160,118,43,.45),transparent 60%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '1px', color: '#8DA0B1' }}>{project.code}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: pillColor, background: pillBg }}>{pillLabel}</span>
                {anyShortage && <span title="One or more material categories are below their remaining planned quantity — open the Warehouse tab" onClick={() => setTab('warehouse')} style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#fff', background: '#B3362B' }}>⚠ LOW STOCK</span>}
              </div>
              <h1 style={{ fontSize: 23, fontWeight: 800, margin: '8px 0 8px', color: '#fff', letterSpacing: '-.3px' }}>{project.name}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12.5, color: '#8DA0B1' }}>
                <span>🏛 {project.client || '—'}</span>
                <span>📍 {project.region || '—'}</span>
                <span>👷 PM {project.pm_name || project.pm?.full_name || '—'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  🛠 Eng {project.engineer_name || project.engineer?.full_name || 'Unassigned'}
                  {canManage && (
                    <button title="Change project engineer" onClick={() => setEngOpen(true)} className="ies-hover"
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, color: '#8DA0B1', background: 'rgba(255,255,255,.08)' }}>
                      <Icon name="edit" size={11} />
                    </button>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: '#fff' }}>⏱ {timeline}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 'none' }}>
              <div style={{ position: 'relative', width: 88, height: 88, flex: 'none', cursor: 'help' }} title="Progress = installed ÷ planned across all building scopes, weighted by scope size. Engineer install entries move this number.">
                <svg viewBox="0 0 64 64" style={{ width: 88, height: 88 }}>
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="7" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="var(--brass-bright)" strokeWidth="7" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 32 32)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{overall}%</span>
                  <span style={{ fontSize: 8, color: '#8DA0B1', letterSpacing: '.5px' }}>DONE</span>
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
              {(() => {
                // 8K-3 — timeline in weeks, not days
                if (daysToEnd == null) { const w = weeksRemaining; return `${w} week${w === 1 ? '' : 's'}` }
                if (daysToEnd < 0) { const w = Math.max(1, Math.round(-daysToEnd / 7)); return `Overdue by ${w} week${w === 1 ? '' : 's'}` }
                if (daysToEnd < 7) return '< 1 week'
                const w = Math.round(daysToEnd / 7); return `${w} week${w === 1 ? '' : 's'}`
              })()}
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
              style={{ padding: '10px 15px', fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', cursor: 'pointer', background: 'none', border: 'none',
                color: active ? 'var(--accent)' : 'var(--text-3)', borderBottom: '2px solid ' + (active ? 'var(--accent)' : 'transparent') }}>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {/* BUILDINGS tab */}
      {tab === 'buildings' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Buildings <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({buildings.length})</span></div>
            <input lang="en" value={bldgQuery} onChange={(e) => setBldgQuery(e.target.value)} placeholder="Search code, name, engineer, region…"
              style={{ width: buildings.length < 6 ? 200 : 280, maxWidth: '100%', padding: '7px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12.5 }} />
          </div>
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
                <th style={{ padding: '9px 8px', fontWeight: 600 }} title="Date the building's Certificate of Completion (COC) was approved, and by whom. Click a date to open the approval document.">COC APPROVAL</th>
                <th style={{ padding: '9px 8px', fontWeight: 600 }}>STATUS</th>
                {canManage && <th style={{ padding: '9px 8px', fontWeight: 600, width: 64 }} />}
              </tr></thead>
              <tbody>
                {filteredBuildings.length === 0 ? (
                  <tr><td colSpan={canManage ? 8 : 7} style={{ padding: '16px 8px', color: 'var(--text-3)', textAlign: 'center' }}>No buildings match “{bldgQuery}”.</td></tr>
                ) : filteredBuildings.map((b) => {
                  const d = perB[b.id] || { planned: 0, installed: 0 }
                  const prog = d.planned ? Math.round((d.installed / d.planned) * 100) : 0
                  const color = prog >= 100 ? '#217A54' : 'var(--accent)'
                  return (
                    <tr key={b.id} onClick={() => navigate(`/projects/${id}/buildings/${b.id}`)} className="ies-trow" style={{ borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
                      <td style={{ padding: '11px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{b.code}</td>
                      <td style={{ padding: '11px 8px', maxWidth: 240 }}><div className="ies-ellipsis" title={b.name} style={{ display: 'block', fontWeight: 600 }}>{b.name}</div><div className="ies-ellipsis" style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{b.region || '—'}</div>{b.name_ar && <div className="ies-ellipsis" dir="rtl" title={b.name_ar} style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', opacity: 0.7 }}>{b.name_ar}</div>}</td>
                      <td style={{ padding: '11px 8px', color: 'var(--text-3)', maxWidth: 180 }}><span className="ies-ellipsis" title={b.contractor || ''}>{b.contractor || '—'}</span></td>
                      <td style={{ padding: '11px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={b.engineer_name} size={22} /><span style={{ color: 'var(--text-3)' }}>{b.engineer_name || '—'}</span></div></td>
                      <td style={{ padding: '11px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 4, background: '#EDEAE0', overflow: 'hidden' }}><div style={{ height: '100%', width: prog + '%', background: color }} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, width: 34, textAlign: 'right' }}>{prog}%</span>
                      </div></td>
                      <td style={{ padding: '11px 8px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: b.approval_date ? 'var(--text)' : 'var(--text-3)' }}>{b.approval_date ? fmtDate(b.approval_date) : '—'}</div>
                        <Chip status={b.approval_status || 'awaiting'} />
                      </td>
                      <td style={{ padding: '11px 8px' }} onClick={(e) => canManage && e.stopPropagation()}>
                        {canManage
                          ? <button title="Change building status (with reason)" onClick={() => setStatusBldg(b)} style={{ cursor: 'pointer', background: 'none' }}><Chip status={b.status_override || 'pending'} /></button>
                          : <Chip status={b.status_override || 'pending'} />}
                      </td>
                      {canManage && (
                        <td style={{ padding: '11px 8px' }} onClick={(e) => e.stopPropagation()}>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button title="Edit building" onClick={() => setEditBldg(b)} className="ies-hover" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}><Icon name="edit" size={13} /></button>
                            <button title="Archive building" onClick={() => setArchiveBldg(b)} className="ies-hover" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #EBCFC9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bad)' }}><Icon name="x" size={13} /></button>
                          </span>
                        </td>
                      )}
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
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>BOQ — Bill of Quantities</div>
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
                        <div style={{ flex: 1, height: 6, borderRadius: 4, background: '#EDEAE0', overflow: 'hidden' }}><div style={{ height: '100%', width: prog + '%', background: '#A0762B' }} /></div>
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

      {/* WAREHOUSE tab */}
      {tab === 'warehouse' && <ProjectWarehouse projectId={id} />}

      {/* ITEMS & REPLACEMENTS tab */}
      {tab === 'items' && <ProjectItems projectId={id} project={project} />}

      {/* DELIVERIES tab (Generate MIR lives here) */}
      {tab === 'deliveries' && <MaterialDeliveries projectId={id} buildings={buildings} />}

      {/* DOC TRACKER tab */}
      {tab === 'docs' && (
        <>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>ESM Documentation Tracker</div>
            {avgDaysCourt != null && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>Avg Days in Client Court: <strong style={{ color: avgDaysCourt > 14 ? 'var(--bad)' : 'var(--text)' }}>{avgDaysCourt}d</strong></div>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 12px' }}>Contractor submittals tracked through the client’s review. Single-doc kinds show a status pill; per-building/per-delivery kinds (MIR, WIR, COC) show submitted/expected.{canManage && ' Click a cell to upload or drill in.'}</div>
          {docRows.length === 0 ? (
            <Empty icon="doc">No ESMs configured for this project.</Empty>
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
                    {DOC_COLS.map(([k]) => {
                      if (MULTI_KINDS.has(k)) {
                        const p = progByKey[`${row.code}|${k}`] || {}
                        const uncapped = p.expected_count == null // MIR/WIR are open-ended
                        const exp = p.expected_count || 0, sub = p.submitted_count || 0, app = p.approved_count || 0
                        const subPct = exp ? Math.min(100, (sub / exp) * 100) : 0
                        const appPct = exp ? Math.min(100, (app / exp) * 100) : 0
                        const files = cellDocs(row, k)
                        return (
                          <td key={k} title={uncapped ? `${sub} submitted · ${app} approved — click for details` : `${sub} submitted · ${app} approved of ${exp} planned — click for details`}
                            style={{ padding: 8, minWidth: 92 }}>
                            <div onClick={() => setDrill({ esmId: row.esmId, esmCode: row.code, docType: k })} style={{ cursor: 'pointer' }}>
                              {uncapped ? (
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{sub}<span style={{ color: 'var(--text-3)', fontWeight: 600 }}> submitted{app ? ` · ${app} appr` : ''}</span></div>
                              ) : (<>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700 }}>{sub}/{exp}</div>
                                <div style={{ height: 5, borderRadius: 3, background: '#EDEAE0', overflow: 'hidden', marginTop: 3, position: 'relative' }}>
                                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: subPct + '%', background: '#E7D9B8' }} />
                                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: appPct + '%', background: '#217A54' }} />
                                </div>
                              </>)}
                            </div>
                            <div style={{ marginTop: 3 }}><AttachmentChip docs={files} onOpen={openFile} /></div>
                          </td>
                        )
                      }
                      const doc = cellByKey[`${row.esmId}|${k}`]
                      if (doc) { const [lbl, c, bg, tip] = docStatusMeta(doc.status); return <td key={k} title={`${tip} — click to open file`} style={{ padding: 8 }}><span onClick={() => openFile(doc)} style={{ cursor: 'pointer' }}><Chip label={lbl} color={c} bg={bg} /></span><div style={{ marginTop: 3 }}><AttachmentChip docs={cellDocs(row, k)} onOpen={openFile} /></div></td> }
                      return (
                        <td key={k} style={{ padding: 8 }}>
                          {canManage
                            ? <button title={`Upload ${row.code} ${k.replace(/_/g, ' ')}`} onClick={() => setUploadReq({ esmId: row.esmId, docType: k, key: Date.now() })} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}><Chip label="Missing" color="#A39D8E" bg="#F0EDE4" /></button>
                            : <Chip label="Missing" color="#A39D8E" bg="#F0EDE4" />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
        <ProjectDocuments projectId={id} project={project} uploadRequest={uploadReq} onChanged={refetchDocs} />
        </>
      )}

      {/* COCs tab — completion certificates pipeline (8S) */}
      {tab === 'coc' && (
        <CocHome projectId={id} project={project} buildings={buildings} projectEsms={projectEsms} canManage={canManage} />
      )}

      {/* MAP tab — real OpenStreetMap markers */}
      {tab === 'map' && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
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
                <input lang="en" defaultValue={pe.custom_name || pe.esm?.name || ''}
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
      {engOpen && <AssignEngineerModal project={project} onClose={() => setEngOpen(false)} />}
      {addBldgOpen && <BuildingFormModal mode="add" projectId={id} projectRegion={project.region || ''} onClose={() => setAddBldgOpen(false)} />}
      {editBldg && <BuildingFormModal mode="edit" projectId={id} building={editBldg} projectRegion={project.region || ''} onClose={() => setEditBldg(null)} />}
      {archiveBldg && <ArchiveBuildingModal building={archiveBldg} onClose={() => setArchiveBldg(null)} />}
      {statusBldg && <BuildingStatusModal building={statusBldg} onClose={() => setStatusBldg(null)} />}

      {/* multi-kind drilldown (MIR / WIR / COC) */}
      <Drawer open={!!drill} title={drill ? `${drill.esmCode} · ${(TYPE_LABEL[drill.docType] || drill.docType)}` : ''} subtitle="All submittals for this ESM and document kind" onClose={() => setDrill(null)}
        footer={canManage && drill ? <Btn variant="primary" onClick={() => { setUploadReq({ esmId: drill.esmId, docType: drill.docType, key: Date.now() }); setDrill(null) }}>Upload another</Btn> : null}>
        {drillDocs.length === 0 ? <Empty icon="doc">Nothing submitted yet for this cell.</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {drillDocs.map((d) => {
              const [lbl, c, bg, tip] = docStatusMeta(d.status)
              const bcode = buildings.find((b) => b.id === d.building_id)?.code
              return (
                <div key={d.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {d.storage_path
                      ? <button onClick={() => openFile(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, padding: 0, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="doc" size={13} />{d.name}</button>
                      : <span style={{ fontWeight: 600, fontSize: 12.5 }}>{d.name}</span>}
                    <span title={tip} style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: c, background: bg, whiteSpace: 'nowrap' }}>{lbl}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)', marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {bcode && <span>🏢 {bcode}</span>}<span>Rev {d.revision || 'A'}</span>
                    {d.client_reviewer_name && <span>👤 {d.client_reviewer_name}</span>}
                    {d.client_response_date && <span>↩ {String(d.client_response_date).slice(0, 10)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Drawer>
    </div>
  )
}
