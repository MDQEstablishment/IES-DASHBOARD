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
  const { user, profile } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const [tab, setTab] = useState('open')

  const { rows, loading } = useLiveQuery('escalations', (q) =>
    q.select('*,raised_by:profiles!escalations_raised_by_id_fkey(full_name,role),raised_to:profiles!escalations_raised_to_id_fkey(full_name,role),building:buildings(code,name)')
      .order('created_at', { ascending: false }).limit(100))

  const open = rows.filter((e) => e.status !== 'resolved' && e.status !== 'closed')
  const resolved = rows.filter((e) => e.status === 'resolved' || e.status === 'closed')
  const list = tab === 'open' ? open : resolved
  const noManager = profile && !profile.manager_id // CEO / Admin sit at the top of the chain

  const resolve = (e) =>
    bgUpdate('escalations', e.id, {
      status: 'resolved', resolved_by_id: user.id, resolved_at: new Date().toISOString(),
      resolution_note: 'Resolved via console',
    }, { okMsg: 'Escalation resolved' })

  // Forward / re-escalate one level up — a new row (trigger derives raised_to = my manager). No reopen.
  const forward = (e) =>
    bgInsert('escalations', {
      title: 'Re-escalation: ' + e.title,
      description: e.description,
      raised_by_id: user.id,
      level: (e.level || 1) + 1,
      parent_escalation_id: e.id,
      project_id: e.project_id, building_id: e.building_id, related_task_id: e.related_task_id,
      severity: e.severity, status: 'open',
    }, { okMsg: 'Forwarded one level up' })

  return (
    <>
      <PageTitle kicker="HIERARCHY CHAIN" title="My Escalations"
        right={<Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>Raise escalation</Btn>} />

      {noManager && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F5EEDF', border: '1px solid #E7D9B8', color: '#8A6524', borderRadius: 8, padding: '9px 13px', fontSize: 12.5, marginBottom: 14 }}>
          <Icon name="alert" size={15} />You sit at the top of the chain — escalations route up to you; you don't raise them.
        </div>
      )}

      {/* Open / Resolved tabs (dc escTabs) */}
      <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 8, padding: 3, background: '#fff', marginBottom: 16, width: 'fit-content' }}>
        {[['open', `Open (${open.length})`], ['resolved', `Resolved (${resolved.length})`]].map(([k, l]) => {
          const active = tab === k
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '6px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: 7,
              color: active ? 'var(--accent)' : 'var(--text-3)', background: active ? 'rgba(160,118,43,.10)' : 'transparent', cursor: 'pointer',
            }}>{l}</button>
          )
        })}
      </div>

      {loading ? <Loading /> : list.length === 0 ? <Empty icon="escalation">{tab === 'open' ? 'No open escalations — all clear.' : 'No resolved escalations yet.'}</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((e) => {
            const done = e.status === 'resolved' || e.status === 'closed'
            const cur = Math.min(e.level || 1, CHAIN.length - 1)
            return (
              <div key={e.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
                {/* head: severity + status pills, ago, resolve action */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Chip status={e.severity} />
                    <Chip status={e.status} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{ago(e.created_at)}</span>
                  </div>
                  {!done && (
                    <Can allow={MANAGERS}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => forward(e)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, background: '#FAF3E3', color: '#B45309', border: '1px solid #EBDCB2' }}>Forward ↑</button>
                        <button onClick={() => resolve(e)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, background: '#E9F3EE', color: '#1D6A49', border: '1px solid #BFDFCF' }}>Resolve</button>
                      </div>
                    </Can>
                  )}
                  {done && e.status === 'resolved' && (
                    <Can allow={MANAGERS}>
                      <button onClick={() => forward(e)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, background: '#F9ECEA', color: '#96271E', border: '1px solid #EBCFC9' }}>Re-escalate ↑</button>
                    </Can>
                  )}
                </div>

                {/* title + description */}
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</div>
                {e.description && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>{e.description}</div>}

                {/* meta: building + raised_by -> raised_to */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0', fontSize: 12.5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: 'var(--text-3)', background: '#F0EDE4' }}>{e.building?.code || '—'}</span>
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
                    const bg = isDone ? '#217A54' : isCur ? '#B3362B' : '#fff'
                    const border = isDone ? '#217A54' : isCur ? '#B3362B' : 'var(--line)'
                    const labelCol = isDone ? '#1D6A49' : isCur ? '#B3362B' : 'var(--text-3)'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flex: 'none' }}>
                            {isDone && <Icon name="check" size={12} style={{ color: '#fff' }} />}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, color: labelCol, whiteSpace: 'nowrap' }}>{c}</span>
                        </div>
                        {i < CHAIN.length - 1 && <span style={{ width: 26, height: 2, background: i < cur || done ? '#BFDFCF' : 'var(--line)', margin: '0 8px' }} />}
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
        <input lang="en" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
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
