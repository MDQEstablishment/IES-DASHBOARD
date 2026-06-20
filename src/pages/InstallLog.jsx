import { useState } from 'react'
import { Avatar, Chip, PageTitle, Loading, Empty, Btn } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgUpdate } from '../lib/db'
import { CAN_QA, labelize } from '../lib/constants'
import { fmtShort } from '../lib/format'

const FILTERS = [
  ['all', 'All'],
  ['pending_qa', 'Pending QA'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
]

export default function InstallLog() {
  const { user, role } = useAuth()
  const [qa, setQa] = useState('all')
  const isQA = can(role, CAN_QA)

  const { rows, loading } = useLiveQuery('install_log', (q) =>
    q.select('*,building:buildings(code,name),scope:building_item_scope(sub_type,material_code),by:profiles!install_log_installed_by_id_fkey(full_name)')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300))

  const filtered = rows.filter((r) => qa === 'all' || r.qa_status === qa)
  const pendingCount = rows.filter((r) => r.qa_status === 'pending_qa').length

  const setStatus = (r, status) =>
    bgUpdate('install_log', r.id,
      { qa_status: status, approved_by_id: user.id, approved_at: new Date().toISOString() },
      { okMsg: `Marked ${status === 'approved' ? 'Approved' : 'Rejected'}` })

  return (
    <div>
      <PageTitle
        kicker="FIELD EXECUTION · AUDIT TRAIL"
        title="Install Log"
        right={
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
            {rows.length} entries · {pendingCount} pending QA
          </div>
        }
      />

      {/* QA-state filter pills */}
      <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 10, padding: 3, background: '#fff', width: 'max-content', marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(([v, label]) => {
          const active = qa === v
          return (
            <button
              key={v}
              onClick={() => setQa(v)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 7, cursor: 'pointer', color: active ? '#fff' : 'var(--text-3)', background: active ? 'var(--accent)' : 'transparent' }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty icon="reports">No install entries match.</Empty>
        ) : (
          <div className="ies-table-wrap">
            <table className="ies-tbl" style={{ minWidth: isQA ? 920 : 760 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Building</th>
                  <th>Scope</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>By</th>
                  <th>Source</th>
                  <th>QA</th>
                  {isQA && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="ies-trow">
                    <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{fmtShort(r.entry_date)}</td>
                    <td>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{r.building?.code || '—'}</div>
                      <div style={{ fontWeight: 600 }}>{r.building?.name || '—'}</div>
                    </td>
                    <td>{r.scope?.sub_type || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ok)' }}>{r.qty}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.by?.full_name} size={22} />
                        <span style={{ whiteSpace: 'nowrap' }}>{r.by?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{labelize(r.source)}</td>
                    <td><Chip status={r.qa_status} /></td>
                    {isQA && (
                      <td>
                        {r.qa_status === 'pending_qa' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Btn variant="primary" icon="check" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setStatus(r, 'approved')}>Approve</Btn>
                            <Btn variant="danger" icon="x" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setStatus(r, 'rejected')}>Reject</Btn>
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
