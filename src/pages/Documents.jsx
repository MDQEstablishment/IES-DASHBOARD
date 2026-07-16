import { Chip, PageTitle, Loading, Empty, Btn } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgUpdate } from '../lib/db'
import { useProject } from '../project'
import { MANAGERS, DOC_KIND, DOC_KIND_FULL, statusMeta } from '../lib/constants'
import { fmtShort } from '../lib/format'

// Doc Tracker matrix columns — kinds shown as the ESM × document-kind status grid
const MATRIX_KINDS = ['material_submittal', 'method_statement', 'mir', 'wir', 'coc']

export default function Documents() {
  const { role } = useAuth()
  const { projectId, current } = useProject()
  const canApprove = can(role, MANAGERS)
  const hasProject = projectId !== 'ALL'

  const { rows, loading } = useLiveQuery('documents', (q) =>
    q.select('*,building:buildings(code,name,project_id),by:profiles!documents_submitted_by_id_fkey(full_name)')
      .order('updated_at', { ascending: false })
      .limit(300))

  const { rows: docStatus } = useLiveQuery('esm_doc_status', (q) => {
    const base = q.select('*,esm:esms(code,name)')
    return hasProject ? base.eq('project_id', projectId) : base.eq('project_id', '00000000-0000-0000-0000-000000000000')
  }, [projectId])

  const docs = rows.filter((d) => projectId === 'ALL' || d.building?.project_id === projectId)

  // group esm_doc_status into rows keyed by esm, then look up each kind cell
  const esmRows = []
  const byEsm = new Map()
  for (const s of docStatus) {
    const key = s.esm_id || s.esm?.code || 'unknown'
    if (!byEsm.has(key)) {
      const r = { esm: s.esm, cells: {} }
      byEsm.set(key, r)
      esmRows.push(r)
    }
    byEsm.get(key).cells[s.kind] = s.status
  }

  const setStatus = (d, status) =>
    bgUpdate('documents', d.id, { status }, { okMsg: `Document ${status}` })

  return (
    <div>
      <PageTitle
        kicker="SUBMITTALS · APPROVALS"
        title="Documents"
        right={
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
            {current ? current.name : 'All projects'} · {docs.length} documents
          </div>
        }
      />

      {/* ESM × document-kind status matrix — Doc Tracker tab visual language */}
      {hasProject ? (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>ESM Documentation Tracker</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
            Live submittal status per ESM and document kind for {current ? current.name : 'this project'}.
          </div>
          {esmRows.length === 0 ? (
            <Empty icon="doc">No ESM documentation status for this project yet.</Empty>
          ) : (
            <div className="ies-table-wrap">
              <table className="ies-tbl" style={{ minWidth: 640, fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>ESM</th>
                    {MATRIX_KINDS.map((k) => <th key={k}>{DOC_KIND_FULL[k]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {esmRows.map((r, i) => (
                    <tr key={r.esm?.code || i} className="ies-trow">
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>
                        {r.esm?.code || '—'}
                      </td>
                      {MATRIX_KINDS.map((k) => {
                        const st = r.cells[k] || 'Missing'
                        const [, , label] = statusMeta(st)
                        return (
                          <td key={k}>
                            <Chip status={st} label={`${DOC_KIND[k]} · ${label}`} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, fontSize: 12.5, color: 'var(--text-3)' }}>
          Select a project from the sidebar to see its ESM documentation tracker.
        </div>
      )}

      {/* dc-styled document table */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <Loading />
        ) : docs.length === 0 ? (
          <Empty icon="doc">No documents.</Empty>
        ) : (
          <div className="ies-table-wrap">
            <table className="ies-tbl" style={{ minWidth: canApprove ? 980 : 820 }}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Building</th>
                  <th style={{ textAlign: 'right' }}>Rev</th>
                  <th>Submitted by</th>
                  <th>Status</th>
                  <th>Updated</th>
                  {canApprove && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="ies-trow">
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {d.building?.code}-{DOC_KIND[d.kind]}-{d.revision}
                    </td>
                    <td><Chip status={d.kind} label={DOC_KIND[d.kind]} /></td>
                    <td style={{ maxWidth: 280, fontWeight: 600 }}>{d.title || DOC_KIND_FULL[d.kind]}</td>
                    <td style={{ color: 'var(--text-3)' }}>{d.building?.code || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{d.revision}</td>
                    <td style={{ color: 'var(--text-3)' }}>{d.by?.full_name || '—'}</td>
                    <td><Chip status={d.status} /></td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtShort(d.updated_at)}</td>
                    {canApprove && (
                      <td>
                        {d.status !== 'Approved' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Btn variant="primary" icon="check" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setStatus(d, 'Approved')}>Approve</Btn>
                            <Btn variant="danger" icon="x" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setStatus(d, 'Rejected')}>Reject</Btn>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
