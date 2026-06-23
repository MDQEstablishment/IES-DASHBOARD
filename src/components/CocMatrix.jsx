import { useState } from 'react'
import { Empty, Btn } from './ui'
import { docStatusMeta } from './ProjectDocuments'
import CocWizard from './CocWizard'

// COC Buildings × ESMs matrix. Rows = active buildings, columns = project ESMs;
// each cell is the COC status for that (building, esm) pair. Paginated at 50
// buildings/page so it scales to 252+ buildings.
// TODO(Sprint 4): consolidated final-COC PDF export — deferred by owner.
const PAGE = 50

export default function CocMatrix({ projectId, project, buildings = [], projectEsms = [], pdocs = [], canManage = false, onUpload, onOpenFile, onChanged }) {
  const [page, setPage] = useState(0)
  const [wiz, setWiz] = useState(false)
  const esms = projectEsms.filter((pe) => pe.esm).map((pe) => ({ id: pe.esm.id, code: pe.esm.code, label: pe.custom_name || pe.esm.name }))
  const rows = [...buildings].sort((a, b) => (a.code || '').localeCompare(b.code || ''))

  // latest COC doc per (building, esm)
  const byCell = {}
  pdocs.filter((d) => d.doc_type === 'coc' && d.building_id && d.esm_id).forEach((d) => {
    const k = `${d.building_id}|${d.esm_id}`
    const cur = byCell[k]
    if (!cur || new Date(d.submitted_at || 0) >= new Date(cur.submitted_at || 0)) byCell[k] = d
  })

  const expected = rows.length * esms.length
  const APPROVED = new Set(['approved', 'approved_with_comments'])
  const PENDING = new Set(['submitted', 'under_review', 'resubmitted'])
  let approved = 0, pending = 0
  const perEsmApproved = {}
  rows.forEach((b) => esms.forEach((e) => {
    const d = byCell[`${b.id}|${e.id}`]
    if (d && APPROVED.has(d.status)) { approved++; perEsmApproved[e.id] = (perEsmApproved[e.id] || 0) + 1 }
    else if (d && PENDING.has(d.status)) pending++
  }))
  const pct = expected ? Math.round((approved / expected) * 100) : 0

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE)

  const kpi = (label, value, sub, color) => (
    <div style={{ flex: 1, minWidth: 150, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, marginTop: 6, lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  if (esms.length === 0 || rows.length === 0) {
    return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}><Empty icon="doc">Add buildings and ESMs to this project to see the COC matrix.</Empty></div>
  }

  const th = { padding: '8px 10px', fontWeight: 700, fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text-3)', position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid var(--line)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Certificates of Completion</div>
        {canManage && <Btn icon="plus" variant="primary" onClick={() => setWiz(true)}>New COC</Btn>}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {kpi('Total COCs Expected', expected, `${rows.length} buildings × ${esms.length} ESMs`)}
        {kpi('COCs Approved', `${approved} `, `${pct}% of expected`, '#10B981')}
        {kpi('COCs Pending Client', pending, 'submitted + under review', '#F59E0B')}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>COC Matrix — Buildings × ESMs</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>{canManage ? 'CLICK A CELL TO UPLOAD OR OPEN A COC' : 'COC STATUS PER BUILDING & ESM'}</div>
        </div>
        <div className="ies-table-wrap" style={{ maxHeight: 560, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ ...th, left: 0, zIndex: 2, minWidth: 150 }}>BUILDING</th>
                {esms.map((e) => (
                  <th key={e.id} style={{ ...th, textAlign: 'center' }}>
                    <div style={{ color: 'var(--accent)' }}>{e.code}</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-3)', fontSize: 9 }}>{e.label}: {perEsmApproved[e.id] || 0}/{rows.length} Approved</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((b) => (
                <tr key={b.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px', position: 'sticky', left: 0, background: '#fff', borderRight: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600 }}>{b.code}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  </td>
                  {esms.map((e) => {
                    const d = byCell[`${b.id}|${e.id}`]
                    if (d) {
                      const [lbl, c, bg, tip] = docStatusMeta(d.status)
                      return <td key={e.id} style={{ padding: 8, textAlign: 'center' }}>
                        <button onClick={() => onOpenFile?.(d)} title={`${tip} — click to open`} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: c, background: bg }}>{lbl}</span>
                        </button>
                      </td>
                    }
                    return <td key={e.id} style={{ padding: 8, textAlign: 'center' }}>
                      {canManage
                        ? <button title={`Upload COC · ${b.code} · ${e.code}`} onClick={() => onUpload?.({ buildingId: b.id, esmId: e.id, docType: 'coc' })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: '#94A3B8', background: '#F1F5F9' }}>Missing</span></button>
                        : <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: '#94A3B8', background: '#F1F5F9' }}>Missing</span>}
                    </td>
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
      {wiz && <CocWizard projectId={projectId} project={project} onClose={() => setWiz(false)} onDone={onChanged} />}
    </div>
  )
}
