import { useState } from 'react'
import { PageHead, Card, Pill, Loading, Empty, Avatar, Btn, Modal, Field } from '../components/ui'
import { useAuth, can, Can } from '../rbac'
import { useLiveQuery, bgUpdate, bgInsert } from '../lib/db'
import { MANAGERS, CAN_RAISE_TASK } from '../lib/constants'
import { fmtDate, daysUntil } from '../lib/format'

const NEXT = { open: 'in_progress', in_progress: 'done' }

export default function Tasks() {
  const { user, role } = useAuth()
  const [filter, setFilter] = useState('open')
  const [showNew, setShowNew] = useState(false)
  const { rows, loading } = useLiveQuery('tasks',
    (q) => q.select('*,assignee:profiles!tasks_assigned_to_id_fkey(full_name),creator:profiles!tasks_created_by_id_fkey(full_name),building:buildings(code)')
      .order('due_date', { ascending: true }).limit(200))

  const filtered = rows.filter((t) => {
    if (filter === 'open') return t.status !== 'done' && t.status !== 'cancelled'
    if (filter === 'all') return true
    return t.status === filter
  })

  const advance = (t) => { const n = NEXT[t.status]; if (n) bgUpdate('tasks', t.id, { status: n }, { okMsg: `Moved to ${n.replace('_', ' ')}` }) }
  const block = (t) => bgUpdate('tasks', t.id, { status: t.status === 'blocked' ? 'in_progress' : 'blocked' }, {})

  return (
    <>
      <PageHead kicker="My queues · approvals" title="Tasks"
        sub={`${rows.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length} open · ${rows.filter((t) => t.status === 'blocked').length} blocked`}
        actions={<>
          <select className="select" style={{ width: 140 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open</option><option value="blocked">Blocked</option><option value="done">Done</option><option value="all">All</option>
          </select>
          <Can allow={CAN_RAISE_TASK}><Btn variant="primary" icon="Plus" onClick={() => setShowNew(true)}>Raise task</Btn></Can>
        </>} />

      <Card pad={false}>
        {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="CheckSquare">No tasks here.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Task</th><th>Building</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.map((t) => {
                const du = daysUntil(t.due_date)
                const mine = t.assigned_to_id === user.id
                const canAct = mine || can(role, MANAGERS)
                return (
                  <tr key={t.id}>
                    <td style={{ maxWidth: 320 }}><div style={{ fontWeight: 600 }} className="truncate">{t.title}</div><div className="muted truncate" style={{ fontSize: 11 }}>{t.description}</div></td>
                    <td className="muted">{t.building?.code || '—'}</td>
                    <td><div className="flex center gap-2"><Avatar name={t.assignee?.full_name} size={20} /><span className="truncate" style={{ maxWidth: 110 }}>{t.assignee?.full_name || '—'}</span></div></td>
                    <td className="num muted">{fmtDate(t.due_date)}{du != null && du < 0 && t.status !== 'done' && <span className="pill pill-red" style={{ marginLeft: 6 }}>overdue</span>}</td>
                    <td><Pill status={t.priority} /></td>
                    <td><Pill status={t.status} /></td>
                    <td>
                      {canAct && t.status !== 'done' && t.status !== 'cancelled' ? (
                        <div className="flex gap-1">
                          {NEXT[t.status] && <Btn className="btn-sm" onClick={() => advance(t)}>{t.status === 'open' ? 'Start' : 'Done'}</Btn>}
                          <Btn className="btn-sm" onClick={() => block(t)}>{t.status === 'blocked' ? 'Unblock' : 'Block'}</Btn>
                        </div>
                      ) : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {showNew && <NewTask onClose={() => setShowNew(false)} user={user} />}
    </>
  )
}

function NewTask({ onClose, user }) {
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name,role').eq('archived', false).order('full_name'))
  const [title, setTitle] = useState(''); const [desc, setDesc] = useState('')
  const [assignee, setAssignee] = useState(''); const [bid, setBid] = useState('')
  const [priority, setPriority] = useState('medium'); const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    const b = buildings.find((x) => x.id === bid)
    const { error } = await bgInsert('tasks', {
      title: title.trim(), description: desc || null, created_by_id: user.id,
      assigned_to_id: assignee || null, building_id: bid || null, project_id: b?.project_id || null,
      priority, status: 'open', due_date: due || null,
    }, { okMsg: 'Task raised ✓' })
    setBusy(false); if (!error) onClose()
  }

  return (
    <Modal open title="Raise a task" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Raise task'}</Btn></>}>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" /></Field>
      <Field label="Description"><textarea className="textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="flex gap-3">
        <div className="grow"><Field label="Assignee"><select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field></div>
        <div className="grow"><Field label="Building"><select className="select" value={bid} onChange={(e) => setBid(e.target.value)}><option value="">None</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field></div>
      </div>
      <div className="flex gap-3">
        <div className="grow"><Field label="Priority"><select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field></div>
        <div className="grow"><Field label="Due date"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field></div>
      </div>
    </Modal>
  )
}
