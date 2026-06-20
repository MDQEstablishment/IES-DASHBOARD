import { useState } from 'react'
import { PageHead, Card, Pill, Loading, Empty, Avatar, Btn } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgUpdate } from '../lib/db'
import { CAN_QA } from '../lib/constants'
import { fmtShort } from '../lib/format'

export default function InstallLog() {
  const { user, role } = useAuth()
  const [qa, setQa] = useState('all')
  const isQA = can(role, CAN_QA)
  const { rows, loading } = useLiveQuery('install_log',
    (q) => q.select('*,building:buildings(code,name),scope:building_item_scope(sub_type),by:profiles!install_log_installed_by_id_fkey(full_name)')
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(300))

  const filtered = rows.filter((r) => qa === 'all' || r.qa_status === qa)
  const pendingCount = rows.filter((r) => r.qa_status === 'pending_qa').length

  const setStatus = (r, status) => bgUpdate('install_log', r.id,
    { qa_status: status, approved_by_id: user.id, approved_at: new Date().toISOString() }, { okMsg: `Marked ${status}` })

  return (
    <>
      <PageHead kicker="Field execution · audit trail" title="Install Log"
        sub={`${rows.length} entries · ${pendingCount} awaiting QA`}
        actions={
          <select className="select" style={{ width: 160 }} value={qa} onChange={(e) => setQa(e.target.value)}>
            <option value="all">All QA states</option><option value="pending_qa">Pending QA</option>
            <option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>} />

      <Card pad={false}>
        {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="ListChecks">No install entries.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Building</th><th>Scope</th><th className="right">Qty</th><th>By</th><th>Source</th><th>QA</th>{isQA && <th>Action</th>}</tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="num muted">{fmtShort(r.entry_date)}</td>
                  <td><div style={{ fontWeight: 600 }}>{r.building?.code}</div><div className="muted" style={{ fontSize: 11 }}>{r.building?.name}</div></td>
                  <td>{r.scope?.sub_type || '—'}</td>
                  <td className="right num" style={{ fontWeight: 600 }}>{r.qty}</td>
                  <td><div className="flex center gap-2"><Avatar name={r.by?.full_name} size={20} /><span className="truncate" style={{ maxWidth: 120 }}>{r.by?.full_name || '—'}</span></div></td>
                  <td className="muted" style={{ fontSize: 11.5 }}>{(r.source || '').replace('_', ' ')}</td>
                  <td><Pill status={r.qa_status} /></td>
                  {isQA && <td>
                    {r.qa_status === 'pending_qa'
                      ? <div className="flex gap-1"><Btn variant="primary" className="btn-sm" onClick={() => setStatus(r, 'approved')}>Approve</Btn><Btn variant="danger" className="btn-sm" onClick={() => setStatus(r, 'rejected')}>Reject</Btn></div>
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
