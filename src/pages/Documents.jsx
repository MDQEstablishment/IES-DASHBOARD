import { PageHead, Card, Pill, Loading, Empty, Btn } from '../components/ui'
import { useAuth, can, Can } from '../rbac'
import { useLiveQuery, bgUpdate } from '../lib/db'
import { useProject } from '../project'
import { MANAGERS, DOC_KIND, DOC_KIND_FULL, pillClass } from '../lib/constants'
import { fmtShort } from '../lib/format'

export default function Documents() {
  const { role } = useAuth()
  const { projectId, current } = useProject()
  const isManager = can(role, MANAGERS)
  const { rows, loading } = useLiveQuery('documents',
    (q) => q.select('*,building:buildings(code,name,project_id),by:profiles!documents_submitted_by_id_fkey(full_name)')
      .order('updated_at', { ascending: false }).limit(300))

  const filtered = rows.filter((d) => projectId === 'ALL' || d.building?.project_id === projectId)
  const setStatus = (d, status) => bgUpdate('documents', d.id, { status }, { okMsg: `Document ${status}` })

  return (
    <>
      <PageHead kicker="Admin · submittals & approvals" title="Documents"
        sub={`${current ? current.name : 'All projects'} · ${filtered.length} documents`} />

      <Card pad={false}>
        {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="FileText">No documents.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Reference</th><th>Type</th><th>Title</th><th>Building</th><th>Rev</th><th>Submitted by</th><th>Status</th><th>Updated</th>{isManager && <th>Action</th>}</tr></thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td className="num muted" style={{ fontSize: 11 }}>{d.building?.code}-{DOC_KIND[d.kind]}-{d.revision}</td>
                  <td><span className="pill pill-gray">{DOC_KIND[d.kind]}</span></td>
                  <td style={{ maxWidth: 280 }}><div className="truncate" style={{ fontWeight: 500 }}>{d.title || DOC_KIND_FULL[d.kind]}</div></td>
                  <td className="muted">{d.building?.code}</td>
                  <td className="num">{d.revision}</td>
                  <td className="muted">{d.by?.full_name || '—'}</td>
                  <td><span className={`pill ${pillClass(d.status)}`}>{d.status}</span></td>
                  <td className="num muted">{fmtShort(d.updated_at)}</td>
                  {isManager && <td>
                    {d.status !== 'Approved'
                      ? <div className="flex gap-1"><Btn variant="primary" className="btn-sm" onClick={() => setStatus(d, 'Approved')}>Approve</Btn><Btn className="btn-sm" onClick={() => setStatus(d, 'Rejected')}>Reject</Btn></div>
                      : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
