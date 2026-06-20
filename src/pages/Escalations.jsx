import { useState } from 'react'
import Icon from '../components/Icon'
import { Avatar, Chip, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth, Can } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { MANAGERS, roleColor } from '../lib/constants'
import { ago } from '../lib/format'

// Hierarchy chain shown on every escalation card (Engineer -> CEO).
const CHAIN = ['Engineer', 'PM', 'Programme', 'PMO', 'CEO']

export default function Escalations() {
  const { user } = useAuth()
  const [showNew, setShowNew] = useState(false)

  const { rows, loading } = useLiveQuery('escalations', (q) =>
    q.select('*,raised_by:profiles!escalations_raised_by_id_fkey(full_name,role),raised_to:profiles!escalations_raised_to_id_fkey(full_name,role),building:buildings(code,name)')
      .order('created_at', { ascending: false }).limit(100))

  const open = rows.filter((e) => e.status !== 'resolved' && e.status !== 'closed')
  const resolved = rows.filter((e) => e.status === 'resolved' || e.status === 'closed')

  const resolve = (e) =>
    bgUpdate('escalations', e.id, {
      status: 'resolved', resolved_by_id: user.id, resolved_at: new Date().toISOString(),
      resolution_note: 'Resolved via console',
    }, { okMsg: 'Escalation resolved' })

  return (
    <>
      <PageTitle kicker="HIERARCHY CHAIN" title="My Escalations"
        right={<Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>Raise escalation</Btn>} />

      {/* KPI strip — TOTAL RAISED / AWAITING ACTION / RESOLVED */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi label="TOTAL RAISED" value={rows.length} />
        <Kpi label="AWAITING ACTION" value={open.length} color="#F59E0B" />
        <Kpi label="RESOLVED" value={resolved.length} color="#10B981" />
      </div>

      {loading ? <Loading /> : rows.length === 0 ? <Empty icon="escalation">No escalations.</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((e) => {
            const done = e.status === 'resolved' || e.status === 'closed'
            const cur = Math.min(e.level || 1, CHAIN.length - 1)
            return (
              <div key={e.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
                {/* head: severity + status pills, ago, resolve action */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Chip status={e.severity} />
                    <Chip status={e.status} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{ago(e.created_at)}</span>
                  </div>
                  {!done && (
                    <Can allow={MANAGERS}>
                      <button onClick={() => resolve(e)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Resolve</button>
                    </Can>
                  )}
                </div>

                {/* title + description */}
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</div>
                {e.description && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>{e.description}</div>}

                {/* meta: building + raised_by -> raised_to */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0', fontSize: 12.5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: 'var(--text-3)', background: '#F1F5F9' }}>{e.building?.code || '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Avatar name={e.raised_by?.full_name} color={roleColor(e.raised_by?.role)} size={22} />
                    <span style={{ whiteSpace: 'nowrap' }}>{e.raised_by?.full_name || '—'}</span>
                  </span>
                  <Icon name="chevronr" size={13} style={{ color: 'var(--text-3)' }} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Avatar name={e.raised_to?.full_name} color={roleColor(e.raised_to?.role)} size={22} />
                    <span style={{ whiteSpace: 'nowrap' }}>{e.raised_to?.full_name || '—'}</span>
                  </span>
                </div>

                {/* escalation chain: Engineer -> PM -> Programme -> PMO -> CEO */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                  {CHAIN.map((c, i) => {
                    const isDone = done || i < cur
                    const isCur = !done && i === cur
                    const bg = isDone ? '#10B981' : isCur ? '#EF4444' : '#fff'
                    const border = isDone ? '#10B981' : isCur ? '#EF4444' : 'var(--line)'
                    const labelCol = isDone ? '#059669' : isCur ? '#DC2626' : 'var(--text-3)'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flex: 'none' }}>
                            {isDone && <Icon name="check" size={12} style={{ color: '#fff' }} />}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, color: labelCol, whiteSpace: 'nowrap' }}>{c}</span>
                        </div>
                        {i < CHAIN.length - 1 && <span style={{ width: 26, height: 2, background: i < cur || done ? '#A7F3D0' : 'var(--line)', margin: '0 8px' }} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && <NewEscalation onClose={() => setShowNew(false)} user={user} />}
    </>
  )
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, marginTop: 6, ...(color ? { color } : {}) }}>{value}</div>
    </div>
  )
}

function NewEscalation({ onClose, user }) {
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [bid, setBid] = useState('')
  const [busy, setBusy] = useState(false)

  const valid = title.trim().length > 0 && description.trim().length >= 10
  const save = async () => {
    if (!valid) return
    setBusy(true)
    const b = buildings.find((x) => x.id === bid)
    // raised_to + level are auto-derived by a DB trigger — do not set them.
    const { error } = await bgInsert('escalations', {
      title: title.trim(), description: description.trim(), severity,
      raised_by_id: user.id, building_id: bid || null, project_id: b?.project_id || null, status: 'open',
    }, { okMsg: 'Escalation raised' })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open title="Raise an escalation" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !valid}>{busy ? 'Saving…' : 'Raise'}</Btn></>}>
      <Field label="Title">
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
      </Field>
      <Field label="Description (min 10 chars — auto-routes to your manager)">
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Severity">
            <select style={inputStyle} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Building">
            <select style={inputStyle} value={bid} onChange={(e) => setBid(e.target.value)}>
              <option value="">None</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  )
}
