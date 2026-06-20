import { useState } from 'react'
import { PageHead, Card, Pill, Loading, Empty, Avatar, Btn, Modal, Field } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth, can, Can } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { MANAGERS, pillClass } from '../lib/constants'
import { ago } from '../lib/format'

const CHAIN = ['Engineer', 'PM', 'Programme', 'PMO', 'CEO']

export default function Escalations() {
  const { user, role } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const isManager = can(role, MANAGERS)
  const { rows, loading } = useLiveQuery('escalations',
    (q) => q.select('*,raised_by:profiles!escalations_raised_by_id_fkey(full_name),raised_to:profiles!escalations_raised_to_id_fkey(full_name),building:buildings(code,name)')
      .order('created_at', { ascending: false }).limit(100))

  const open = rows.filter((e) => e.status !== 'resolved' && e.status !== 'closed')
  const resolve = (e) => bgUpdate('escalations', e.id,
    { status: 'resolved', resolved_by_id: user.id, resolved_at: new Date().toISOString(), resolution_note: 'Resolved via dashboard' }, { okMsg: 'Escalation resolved' })

  return (
    <>
      <PageHead kicker="My queues · escalations" title="Escalations"
        sub={`${open.length} open · ${rows.filter((e) => e.severity === 'critical' && e.status !== 'resolved').length} critical`}
        actions={<Btn variant="primary" icon="Flag" onClick={() => setShowNew(true)}>Raise escalation</Btn>} />

      {loading ? <Loading /> : rows.length === 0 ? <Card><Empty icon="Flag">No escalations.</Empty></Card> : (
        <div className="col gap-3">
          {rows.map((e) => {
            const cur = Math.min(e.level || 1, CHAIN.length - 1)
            const resolved = e.status === 'resolved' || e.status === 'closed'
            return (
              <div key={e.id} className="card" style={{ padding: 16 }}>
                <div className="flex center between mb-2 wrap gap-2">
                  <div className="flex center gap-2"><Pill status={e.severity} /><span className={`pill ${pillClass(e.status)}`}>{e.status}</span><span className="muted num" style={{ fontSize: 11 }}>raised {ago(e.created_at)}</span></div>
                  {!resolved && <Can allow={MANAGERS}><Btn className="btn-sm" icon="Check" onClick={() => resolve(e)}>Resolve</Btn></Can>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                <div className="muted mb-3" style={{ fontSize: 12.5 }}>{e.description}</div>
                <div className="flex between wrap gap-4">
                  <div className="flex center gap-2 wrap" style={{ fontSize: 11.5 }}>
                    <span className="muted">Building:</span> <strong>{e.building?.code || '—'}</strong>
                    <span className="muted" style={{ marginLeft: 8 }}>From:</span> <Avatar name={e.raised_by?.full_name} size={18} /> {e.raised_by?.full_name}
                    <Icon name="ChevronRight" size={11} color="var(--text-4)" />
                    <span className="muted">To:</span> <Avatar name={e.raised_to?.full_name} size={18} /> {e.raised_to?.full_name || '—'}
                  </div>
                  <div className="flex center gap-1">
                    {CHAIN.map((c, i) => (
                      <div key={i} className="flex center gap-1">
                        <span title={c} className={`chain-node ${i < cur && !resolved ? 'done' : ''} ${i === cur && !resolved ? 'cur' : ''} ${resolved ? 'done' : ''}`} style={{ width: 16, height: 16 }}>
                          {(i < cur || resolved) && <Icon name="Check" size={9} color="#fff" />}
                        </span>
                        {i < CHAIN.length - 1 && <span style={{ width: 14, height: 2, background: 'var(--border)' }} />}
                      </div>
                    ))}
                  </div>
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

function NewEscalation({ onClose, user }) {
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))
  const [title, setTitle] = useState(''); const [desc, setDesc] = useState('')
  const [sev, setSev] = useState('medium'); const [bid, setBid] = useState(''); const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim() || desc.trim().length < 10) return
    setBusy(true)
    const b = buildings.find((x) => x.id === bid)
    const { error } = await bgInsert('escalations', {
      title: title.trim(), description: desc.trim(), severity: sev,
      raised_by_id: user.id, building_id: bid || null, project_id: b?.project_id || null, status: 'open',
    }, { okMsg: 'Escalation raised ✓' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title="Raise an escalation" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !title.trim() || desc.trim().length < 10}>{busy ? 'Saving…' : 'Raise'}</Btn></>}>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" /></Field>
      <Field label="Description (min 10 chars — auto-routes to your manager)"><textarea className="textarea" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="flex gap-3">
        <div className="grow"><Field label="Severity"><select className="select" value={sev} onChange={(e) => setSev(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field></div>
        <div className="grow"><Field label="Building"><select className="select" value={bid} onChange={(e) => setBid(e.target.value)}><option value="">None</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field></div>
      </div>
    </Modal>
  )
}
