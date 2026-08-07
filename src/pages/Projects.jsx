import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { PageTitle, Loading, Empty } from '../components/ui'
import { useAuth } from '../rbac'
import { may } from '../authority'
import { useLiveQuery, signedUrlFor } from '../lib/db'
import { num } from '../lib/format'
import { statusMeta } from '../lib/constants'
import { ProjectFormModal, ProjectImportModal } from '../components/ProjectModals'
import { BUCKETS } from '../lib/buckets'

const SORTS = [['recent', 'Recent'], ['name', 'Name A→Z'], ['progress', 'Progress %'], ['start', 'Start date']]

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
  const [sort, setSort] = useState('recent')
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editProj, setEditProj] = useState(null)

  const { rows: projects, loading } = useLiveQuery('projects', (q) =>
    q.select('*, pm:profiles!projects_pm_id_fkey(full_name)').is('deleted_at', null).order('code'))
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,project_id'))
  const { rows: scopes } = useLiveQuery('building_item_scope', (q) => q.select('id,building_id,planned_qty'))
  const { rows: install } = useLiveQuery('install_log', (q) => q.select('scope_id,qty,qa_status'))
  const { rows: projectEsms } = useLiveQuery('project_esms', (q) => q.select('id,project_id'))

  // Resolve a signed URL for each project that has a cover photo (private bucket).
  // Keyed on id:path so it only re-fetches when a photo is added/changed/removed.
  const [photoUrls, setPhotoUrls] = useState({})
  const photoKey = projects.map((p) => `${p.id}:${p.photo_url || ''}`).join('|')
  useEffect(() => {
    let cancelled = false
    const withPhotos = projects.filter((p) => p.photo_url)
    if (!withPhotos.length) { setPhotoUrls({}); return }
    Promise.all(withPhotos.map(async (p) => [p.id, await signedUrlFor(BUCKETS.PROJECT_PHOTOS, p.photo_url)]))
      .then((pairs) => { if (!cancelled) setPhotoUrls(Object.fromEntries(pairs.filter(([, u]) => u))) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])

  // From AUTHORITY in src/authority.js, which mirrors public.authority_roles
  // and is held to it by tests/authorityParity. Never re-list roles here: the
  // inline arrays these two lines held disagreed with the RLS policy in both
  // directions — progm was refused a button he was entitled to, admin and ceo
  // were shown one the database would refuse.
  const canAdd = may('project.create', role)
  const canEdit = may('project.edit', role)
  const projectsReadOnly = !canEdit

  // approved-installed qty per scope
  const insByScope = {}
  install.forEach((r) => { if (r.qa_status !== 'rejected') insByScope[r.scope_id] = (insByScope[r.scope_id] || 0) + r.qty })

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

  const progOf = (p) => { const d = prog[p.id] || { planned: 0, installed: 0 }; return d.planned ? d.installed / d.planned : 0 }
  const filtered = projects
    .filter((p) => (filter === 'all' ? p.status !== 'deleted' : p.status === filter))
    .sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sort === 'progress') return progOf(b) - progOf(a)
      if (sort === 'start') return new Date(b.start_date || 0) - new Date(a.start_date || 0)
      // recent (default): most recently created first, no status grouping (8J-4)
      return new Date(b.created_at || b.start_date || 0) - new Date(a.created_at || a.start_date || 0)
    })

  const iconUpload = <Icon name="upload" size={15} />
  const iconPlus = <Icon name="plus" size={15} />

  return (
    <div data-screen-label="Projects">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <PageTitle kicker="RETROFIT PROGRAMME" title="Projects" />
        {canAdd && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setImportOpen(true)} className="ies-hover" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 'var(--radius-s)', border: '1px solid var(--line)', background: 'var(--surface-1)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{iconUpload}Import Excel</button>
            <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 'var(--radius-s)', background: 'var(--accent)', color: 'var(--surface-1)', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>{iconPlus}Add Project</button>
          </div>
        )}
      </div>

      {projectsReadOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warn-bg)', border: '1px solid var(--warn-bg)', color: 'var(--warn-deep)', borderRadius: 'var(--radius-s)', padding: '9px 13px', fontSize: 12.5, marginBottom: 14 }}>
          <Icon name="alert" size={15} />Read-only access — your role can view projects but not edit them.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {FILTERS.map(([key, label]) => {
            const active = filter === key
            const [col, bg] = key === 'all' ? ['var(--accent)', 'var(--accent-tint)'] : statusMeta(key)
            return (
              <button key={key} onClick={() => setFilter(key)}
                style={{ padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (active ? col : 'var(--line)'), background: active ? bg : 'var(--surface-1)' }}>
                <span style={{ color: active ? col : 'var(--text-3)' }}>{label}</span>
              </button>
            )
          })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-3)' }}>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', fontSize: 12.5, background: 'var(--surface-1)', fontWeight: 600 }}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="projects">No projects match this filter.</Empty> : (
        <div className="ies-panorama-grid">
          {filtered.map((p) => {
            const d = prog[p.id] || { planned: 0, installed: 0 }
            const pp = d.planned ? Math.round((d.installed / d.planned) * 100) : 0
            return (
              <PanoramaCard key={p.id} p={p} pp={pp} remaining={Math.max(0, d.planned - d.installed)}
                bldgs={bldgCount[p.id] || 0} esms={esmCount[p.id] || 0} photoUrl={photoUrls[p.id]}
                canEdit={canEdit} onOpen={() => navigate(`/projects/${p.id}`)} onEdit={() => setEditProj(p)} />
            )
          })}
        </div>
      )}

      {addOpen && <ProjectFormModal mode="add" onClose={() => setAddOpen(false)} />}
      {importOpen && <ProjectImportModal onClose={() => setImportOpen(false)} />}
      {editProj && <ProjectFormModal mode="edit" project={editProj} onClose={() => setEditProj(null)} />}
    </div>
  )
}

// Sprint 8Q — "Panorama Vertical" project card (handoff 2a). Full-bleed cover
// photo (--track when absent) under a navy scrim, all data overlaid.
//
// The status pill palette below CLAIMED to be on-dark and measurably was not.
// `draft` was --line-ctrl — rgba(28,28,28,.12), a BORDER token, 12% dark ink —
// and `closed`/`deleted` were --text-3, rgba(28,28,28,.40). Painting 12% and
// 40% black onto a navy scrim gives 1.05:1 - 1.44:1, which is why DRAFT reached
// the owner as a ghost outline with nothing legible inside it. The two that
// were real colours were no better: --live 1.76:1, --brass-bright 2.15:1.
//
// Only the TEXT moves, to --on-band. Each row keeps its own background and
// border untouched: those carry the status identity (green / grey / amber /
// slate) and they are the part of the pill that was always doing that job.
// Worst case after, white ink over the pill's own translucent fill over the
// scrim over a pure-white photo: draft 4.87:1, active 5.51:1, on_hold 5.64:1,
// closed/deleted 6.42:1. All AA.
const PILL = {
  active:  ['var(--on-band)', 'rgba(33,122,84,0.30)', 'rgba(123,201,163,0.40)'],
  draft:   ['var(--on-band)', 'rgba(120,132,143,0.32)', 'rgba(199,206,213,0.35)'],
  on_hold: ['var(--on-band)', 'rgba(180,83,9,0.32)', 'rgba(232,182,98,0.40)'],
  closed:  ['var(--on-band)', 'rgba(60,80,95,0.38)', 'rgba(159,176,189,0.32)'],
  deleted: ['var(--on-band)', 'rgba(60,80,95,0.38)', 'rgba(159,176,189,0.32)'],
}
// Recolouring the ink was not enough on its own: this scrim used to fall to
// alpha 0 at 45% and only climb back to 0.55 by 68%, so the name / meta / ring
// block at y 274-324 sat in the trough at alpha 0.48-0.67, and the code + pill
// + edit row at y 19-40 sat on the tail of the top ramp at 0.65-0.76. White ink
// needs 0.62 and 78% white ink needs 0.72 to clear 4.5:1 over a pure-white
// photo, so four elements stayed under AA no matter which token they used.
//
// Every stop below is placed against a measured y, not by eye. Two ramps moved
// and one stop was added:
//   0.78 @ 10%  — NEW. Caps the top row (deepest text pixel y=39.5, t=0.094).
//                 The lower ramp alone could not reach it; it is a different
//                 ramp. Ends above the window, so the window is unaffected.
//   0 @ 42%, 0.78 @ 62%  — was 0 @ 45%, 0.55 @ 68%. Lifts the bottom block.
// The transparent window (0.35 @ 22% -> 0 @ 42%) is deliberately preserved:
// that is the part of the cover photo the panorama exists to show.
// Worst alpha per text zone after this: code .788, pill .799, edit .786,
// name .794, ring .812, meta .829, stat values .894, stat labels .917.
const SCRIM = 'linear-gradient(180deg, rgba(16,39,59,0.88) 0%, rgba(16,39,59,0.78) 10%, rgba(16,39,59,0.35) 22%, rgba(16,39,59,0) 42%, rgba(16,39,59,0.78) 62%, rgba(16,39,59,0.95) 100%)'

function PanoramaCard({ p, pp, remaining, bldgs, esms, photoUrl, canEdit, onOpen, onEdit }) {
  const [pillC, pillBg, pillBd] = PILL[p.status] || PILL.draft
  const pillLabel = statusMeta(p.status)[2]
  const meta = [p.client, p.region, p.pm_name || p.pm?.full_name].filter(Boolean).join(' · ')
  const r = 23, circ = 2 * Math.PI * r
  const ringDash = `${((pp / 100) * circ).toFixed(1)} ${circ.toFixed(1)}`
  const stat = (val, label, color) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '0 6px' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1.1 }}>{val}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--on-band-2)', marginTop: 3 }}>{label}</div>
    </div>
  )
  return (
    <div className="ies-panorama-card" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ position: 'relative', height: 420, borderRadius: 'var(--radius-m)', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,29,36,0.12)', background: 'var(--track)' }}>
      {/* photo layer */}
      {photoUrl && <img src={photoUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {/* scrim */}
      <div style={{ position: 'absolute', inset: 0, background: SCRIM, pointerEvents: 'none' }} />
      {/* content */}
      <div style={{ position: 'absolute', inset: 0, padding: 19, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {/* top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--on-band-2)' }}>{p.code}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: pillC, background: pillBg, border: `1px solid ${pillBd}`, whiteSpace: 'nowrap' }}>{pillLabel}</span>
          </div>
          {canEdit && (
            <button title="Edit project" onClick={(e) => { e.stopPropagation(); onEdit() }}
              style={{ width: 28, height: 28, borderRadius: 'var(--radius-s)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-band)', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(16,39,59,0.4)', cursor: 'pointer' }}>
              <Icon name="edit" size={13} />
            </button>
          )}
        </div>

        {/* bottom block */}
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-0.3px', color: 'var(--on-band)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--on-band-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta || '—'}</div>
            </div>
            <div style={{ position: 'relative', width: 52, height: 52, flex: 'none' }}>
              <svg viewBox="0 0 52 52" style={{ width: 52, height: 52 }}>
                <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                <circle cx="26" cy="26" r={r} fill="none" stroke="var(--brass-bright)" strokeWidth="6" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 26 26)" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--on-band)' }}>{pp}%</div>
            </div>
          </div>
          {/* progress bar */}
          <div style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.18)', overflow: 'hidden', margin: '13px 0 0' }}>
            <div style={{ height: '100%', width: pp + '%', background: 'var(--brass-bright)' }} />
          </div>
          {/* stats strip */}
          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.16)', marginTop: 13, paddingTop: 11 }}>
            {stat(num(remaining), 'REMAINING', 'var(--on-band)')}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
            {stat(bldgs, 'BLDGS', 'var(--on-band)')}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
            {stat(esms, 'ESMS', 'var(--on-band)')}
          </div>
        </div>
      </div>
    </div>
  )
}
