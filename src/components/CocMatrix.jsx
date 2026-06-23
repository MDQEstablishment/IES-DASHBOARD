import { useState } from 'react'
import { useLiveQuery, signedUrlFor } from '../lib/db'
import { useAuth } from '../rbac'
import { Empty, Btn } from './ui'
import { toast } from '../lib/toast'
import { docStatusMeta, UpdateStatusModal } from './ProjectDocuments'
import CocWizard, { buildAndAttachCocPdf } from './CocWizard'

// COC views over the M:N junctions: a COC covers a set of buildings × a set of
// ESMs. Matrix = Buildings × ESMs cells showing COC coverage count; List = the
// COC documents themselves. Paginated at 50 buildings/page for 252+ scale.
// TODO(Sprint 4 -> 5): consolidated final-COC PDF export — deferred by owner.
const PAGE = 50
const APPROVED = new Set(['approved', 'approved_with_comments'])
const PENDING = new Set(['submitted', 'under_review', 'resubmitted'])
const fmtIso = (t) => (t ? String(t).slice(0, 10) : '—')

export default function CocMatrix({ projectId, project, buildings = [], projectEsms = [], canManage = false, onOpenFile, onChanged }) {
  const { user } = useAuth()
  const [page, setPage] = useState(0)
  const [view, setView] = useState('matrix')
  const [wiz, setWiz] = useState(false)
  const [statusDoc, setStatusDoc] = useState(null)
  const [regenId, setRegenId] = useState(null)

  const esms = projectEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, label: pe.custom_name || pe.esm.name }))
  const rows = [...buildings].sort((a, b) => (a.code || '').localeCompare(b.code || ''))

  const { rows: cbRows, refetch: rcb } = useLiveQuery('coc_buildings',
    (q) => q.select('coc_id,building_id,coc:project_documents!inner(id,name,revision,status,client_reviewer_name,client_response_date,submitted_at,updated_at,storage_path,project_id,doc_type)').eq('coc.project_id', projectId).eq('coc.doc_type', 'coc'), [projectId])
  const { rows: ceRows, refetch: rce } = useLiveQuery('coc_esms',
    (q) => q.select('coc_id,esm_code,coc:project_documents!inner(project_id,doc_type)').eq('coc.project_id', projectId).eq('coc.doc_type', 'coc'), [projectId])
  const { rows: installed } = useLiveQuery('project_installed_items', (q) => q.select('*').eq('project_id', projectId), [projectId])
  const { rows: removed } = useLiveQuery('project_removed_items', (q) => q.select('*').eq('project_id', projectId), [projectId])

  // assemble COCs with their building & esm coverage sets
  const cocs = {}
  cbRows.forEach((r) => { if (!r.coc) return; (cocs[r.coc_id] = cocs[r.coc_id] || { ...r.coc, buildings: new Set(), esms: new Set() }).buildings.add(r.building_id) })
  ceRows.forEach((r) => { if (cocs[r.coc_id]) cocs[r.coc_id].esms.add(r.esm_code) })
  const cocList = Object.values(cocs)
  const lastItemChange = Math.max(0, ...[...installed, ...removed].map((i) => new Date(i.created_at || 0).getTime()))
  const isStale = (c) => !c.storage_path || (lastItemChange > new Date(c.updated_at || c.submitted_at || 0).getTime())

  const cellCocs = (bid, ecode) => cocList.filter((c) => c.buildings.has(bid) && c.esms.has(ecode))

  // KPIs over (building × esm) cells
  const expected = rows.length * esms.length
  let approved = 0, pending = 0
  const perEsmApproved = {}
  rows.forEach((b) => esms.forEach((e) => {
    const cs = cellCocs(b.id, e.code)
    if (cs.some((c) => APPROVED.has(c.status))) { approved++; perEsmApproved[e.id] = (perEsmApproved[e.id] || 0) + 1 }
    else if (cs.some((c) => PENDING.has(c.status))) pending++
  }))
  const pct = expected ? Math.round((approved / expected) * 100) : 0

  const refresh = () => { rcb(); rce(); onChanged?.() }
  const regenerate = async (c) => {
    setRegenId(c.id)
    const coveredB = rows.filter((b) => c.buildings.has(b.id))
    const coveredE = esms.filter((e) => c.esms.has(e.code))
    const { error } = await buildAndAttachCocPdf({ docId: c.id, cocNo: c.name, revision: c.revision, project, buildings: coveredB, esmList: coveredE, installed, removed, userId: user.id })
    setRegenId(null)
    if (error) toast('Regeneration failed — ' + (error.message || ''), 'err'); else { toast(`${c.name} PDF regenerated`); refresh() }
  }
  const openCoc = async (c) => { if (!c.storage_path) { toast('No PDF yet — use Regenerate', 'err'); return } const u = await signedUrlFor('project-docs', c.storage_path); if (u) window.open(u, '_blank', 'noopener'); else toast("Couldn't open the PDF", 'err') }
  const scopeOf = (c) => `${c.buildings.size} bldg${c.buildings.size === 1 ? '' : 's'} · ${[...c.esms].sort().join('+')}`
  const daysCourt = (c) => { if (!c.submitted_at) return null; const end = c.client_response_date ? new Date(c.client_response_date) : new Date(); return Math.max(0, Math.round((end - new Date(c.submitted_at)) / 86400000)) }

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE)

  const kpi = (label, value, sub, color) => (
    <div style={{ flex: 1, minWidth: 150, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, marginTop: 6, lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const toggleBtn = (key, label) => (
    <button onClick={() => setView(key)} style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--line)', background: view === key ? 'var(--accent)' : '#fff', color: view === key ? '#fff' : 'var(--text-3)', borderRadius: 8 }}>{label}</button>
  )

  const th = { padding: '8px 10px', fontWeight: 700, fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text-3)', position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid var(--line)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Certificates of Completion</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>{toggleBtn('matrix', '⌖ Matrix')}{toggleBtn('list', '☰ List')}</div>
          {canManage && <Btn icon="plus" variant="primary" onClick={() => setWiz(true)}>New COC</Btn>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {kpi('Total COCs Expected', expected, `${rows.length} buildings × ${esms.length} ESMs`)}
        {kpi('COCs Approved', approved, `${pct}% of expected`, '#10B981')}
        {kpi('COCs Pending Client', pending, 'submitted + under review', '#F59E0B')}
      </div>

      {esms.length === 0 || rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}><Empty icon="doc">Add buildings and ESMs to this project to track COCs.</Empty></div>
      ) : view === 'matrix' ? (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Buildings × ESMs</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>{canManage ? 'EMPTY CELL → UPLOAD/NEW · COUNT = COCS COVERING THIS PAIR' : 'COC COVERAGE PER BUILDING & ESM'}</div>
          </div>
          <div className="ies-table-wrap" style={{ maxHeight: 560, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ textAlign: 'left' }}>
                <th style={{ ...th, left: 0, zIndex: 2, minWidth: 150 }}>BUILDING</th>
                {esms.map((e) => <th key={e.id} style={{ ...th, textAlign: 'center' }}><div style={{ color: 'var(--accent)' }}>{e.code}</div><div style={{ fontWeight: 600, color: 'var(--text-3)', fontSize: 9 }}>{e.label}: {perEsmApproved[e.id] || 0}/{rows.length} Approved</div></th>)}
              </tr></thead>
              <tbody>
                {pageRows.map((b) => (
                  <tr key={b.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 10px', position: 'sticky', left: 0, background: '#fff', borderRight: '1px solid var(--line)' }}>
                      <div style={{ fontWeight: 600 }}>{b.code}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    </td>
                    {esms.map((e) => {
                      const cs = cellCocs(b.id, e.code)
                      const anyApproved = cs.some((c) => APPROVED.has(c.status))
                      const anyPending = cs.some((c) => PENDING.has(c.status))
                      const c = cs.length ? cs[0] : null
                      const color = anyApproved ? ['#10B981', '#ECFDF5'] : anyPending ? ['#F59E0B', '#FFFBEB'] : ['#94A3B8', '#F1F5F9']
                      const tip = cs.length ? `${cs.length} COC${cs.length === 1 ? '' : 's'}: ${cs.map((x) => x.name).join(', ')}` : 'No COC — click to create'
                      return (
                        <td key={e.id} style={{ padding: 8, textAlign: 'center' }}>
                          <button title={tip} onClick={() => (c ? (c.storage_path ? openCoc(c) : setView('list')) : (canManage && setWiz(true)))}
                            style={{ background: color[1], border: 'none', cursor: 'pointer', padding: '4px 9px', borderRadius: 6, minWidth: 34 }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: color[0] }}>{cs.length || '—'}</span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12, fontSize: 12 }}>
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} style={{ padding: '5px 11px', border: '1px solid var(--line)', borderRadius: 7, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>‹ Prev</button>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>Page {page + 1} / {pages} · {rows.length} buildings</span>
              <button disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} style={{ padding: '5px 11px', border: '1px solid var(--line)', borderRadius: 7, background: '#fff', cursor: page >= pages - 1 ? 'default' : 'pointer', opacity: page >= pages - 1 ? 0.5 : 1 }}>Next ›</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          {cocList.length === 0 ? <Empty icon="doc">No COCs yet. Use “New COC” to create one.</Empty> : (
            <div className="ies-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 880 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                <th style={{ padding: 8, fontWeight: 600 }}>COC #</th><th style={{ padding: 8, fontWeight: 600 }}>SCOPE</th><th style={{ padding: 8, fontWeight: 600 }}>REV</th>
                <th style={{ padding: 8, fontWeight: 600 }}>STATUS</th><th style={{ padding: 8, fontWeight: 600 }}>SUBMITTED</th><th style={{ padding: 8, fontWeight: 600 }}>CLIENT REVIEWER</th>
                <th style={{ padding: 8, fontWeight: 600 }}>DAYS</th><th style={{ padding: 8, fontWeight: 600 }}>FILE</th>{canManage && <th style={{ padding: 8, fontWeight: 600 }} />}
              </tr></thead>
              <tbody>
                {cocList.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0)).map((c) => {
                  const [lbl, col, bg, tip] = docStatusMeta(c.status)
                  const d = daysCourt(c)
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '9px 8px', fontWeight: 700 }}>
                        {isStale(c) && <span title="PDF may be out of date — regenerate" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--warn)', marginRight: 6 }} />}
                        {c.name}
                      </td>
                      <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{scopeOf(c)}</td>
                      <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{c.revision || 'A'}</td>
                      <td style={{ padding: '9px 8px' }}><span title={tip} style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: col, background: bg, cursor: 'help' }}>{lbl}</span></td>
                      <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{fmtIso(c.submitted_at)}</td>
                      <td style={{ padding: '9px 8px', color: 'var(--text-3)' }}>{c.client_reviewer_name || '—'}</td>
                      <td style={{ padding: '9px 8px', fontFamily: 'var(--mono)', color: d != null && !c.client_response_date && d > 14 ? 'var(--bad)' : 'var(--text-3)' }}>{d != null ? `${d}d${c.client_response_date ? '' : '*'}` : '—'}</td>
                      <td style={{ padding: '9px 8px' }}>{c.storage_path ? <button onClick={() => openCoc(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>Open PDF</button> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      {canManage && <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setStatusDoc(c)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', marginRight: 10 }}>Update Status</button>
                        <button onClick={() => regenerate(c)} disabled={regenId === c.id} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)' }}>{regenId === c.id ? 'Regenerating…' : 'Regenerate PDF'}</button>
                      </td>}
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {wiz && <CocWizard projectId={projectId} project={project} onClose={() => setWiz(false)} onDone={refresh} />}
      {statusDoc && <UpdateStatusModal doc={statusDoc} onClose={() => setStatusDoc(null)} onDone={refresh} />}
    </div>
  )
}
