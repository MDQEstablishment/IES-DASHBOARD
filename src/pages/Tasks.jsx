import { useState } from 'react'
import Icon from '../components/Icon'
import { Avatar, Chip, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { fmtDate, daysUntil, initials } from '../lib/format'
import { roleColor, statusMeta, MANAGERS, CAN_RAISE_TASK } from '../lib/constants'

const TABS = [
  { key: 'mine', label: 'Mine' },
  { key: 'delegated', label: 'Delegated' },
  { key: 'team', label: 'Team' },
]
const STATUS_FILTERS = [
  { v: 'active', l: 'Active' },
  { v: 'open', l: 'Open' },
  { v: 'in_progress', l: 'In Progress' },
  { v: 'blocked', l: 'Blocked' },
  { v: 'done', l: 'Done' },
  { v: 'all', l: 'All' },
]
const STATUS_OPTS = [
  ['open', 'Open'], ['in_progress', 'In Progress'], ['blocked', 'Blocked'], ['done', 'Done'],
]

export default function Tasks() {
  const { user, profile, role } = useAuth()
  const [tab, setTab] = useState('mine')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showNew, setShowNew] = useState(false)

  const { rows, loading } = useLiveQuery('tasks',
    (q) => q.select('*,assignee:profiles!tasks_assigned_to_id_fkey(full_name,role),creator:profiles!tasks_created_by_id_fkey(full_name),building:buildings(code)')
      .order('due_date', { ascending: true }).limit(200))

  const isManager = can(role, MANAGERS)
  const userName = profile?.full_name || 'me'

  // Tab scoping. Mine = assigned to me. Team = managers see all; others approximate
  // to "all" (no manager subtree in client). All = everything.
  const scoped = rows.filter((t) => {
    if (tab === 'mine') return t.assigned_to_id === user?.id
    if (tab === 'delegated') return t.created_by_id === user?.id && t.assigned_to_id !== user?.id
    return true // team shows everything (down-only assignment scope)
  })

  const filtered = scoped.filter((t) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'active') return t.status !== 'done' && t.status !== 'cancelled'
    return t.status === statusFilter
  })

  // KPIs (always computed against full row set, from "my" perspective)
  const mine = rows.filter((t) => t.assigned_to_id === user?.id)
  const kAssigned = mine.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length
  const kOverdue = mine.filter((t) => {
    const du = daysUntil(t.due_date)
    return du != null && du < 0 && t.status !== 'done' && t.status !== 'cancelled'
  }).length
  const kTeam = rows.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length
  const kCompleted = rows.filter((t) => t.status === 'done').length

  const scopeLabel = tab === 'mine' ? 'Tasks assigned to you'
    : tab === 'delegated' ? 'Tasks you raised and assigned to others'
      : (isManager ? 'All team tasks across the programme' : 'Team tasks (shared view)')

  // Team Performance (dc teamPerf) — avg age of open, avg cycle of done, top-3 oldest
  const dayAge = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)
  const openTasks = rows.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const doneTasks = rows.filter((t) => t.status === 'done')
  const avgAge = openTasks.length ? Math.round(openTasks.reduce((s, t) => s + dayAge(t.created_at), 0) / openTasks.length) : 0
  const avgCycle = doneTasks.length ? Math.round(doneTasks.reduce((s, t) => s + Math.max(0, (new Date(t.updated_at) - new Date(t.created_at)) / 86400000), 0) / doneTasks.length) : 0
  const topOldest = [...openTasks].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(0, 3)

  const onStatusChange = (t, next) => {
    if (next === t.status) return
    bgUpdate('tasks', t.id, { status: next }, { okMsg: `Marked ${statusMeta(next)[2]}` })
  }

  return (
    <div data-screen-label="My Tasks">
      <PageTitle kicker="MY QUEUE" title={`Tasks for ${userName}`}
        right={can(role, CAN_RAISE_TASK) && (
          <Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>New Task</Btn>
        )} />
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: -12, marginBottom: 16 }}>{scopeLabel}</div>

      {/* Team Performance widget (dc showPerf 653-678) — managers only */}
      {isManager && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Team Performance</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>OPEN QUEUE HEALTH</div>
          </div>
          <div className="ies-3col" style={{ display: 'grid', gridTemplateColumns: '120px 120px 1fr', gap: 18, alignItems: 'start' }}>
            <Perf label="AVG AGE" value={`${avgAge}d`} />
            <Perf label="AVG CYCLE" value={`${avgCycle}d`} color="#10B981" />
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', marginBottom: 6 }}>TOP 3 OLDEST OPEN</div>
              {topOldest.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>None open.</div> : topOldest.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: '#F59E0B', flex: 'none' }}>{dayAge(t.created_at)}d</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs + status filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 9, padding: 3, background: '#fff' }}>
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 7,
                color: active ? 'var(--accent)' : 'var(--text-3)',
                background: active ? 'rgba(37,99,235,.10)' : 'transparent',
                cursor: 'pointer',
              }}>{t.label}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.v
            return (
              <button key={s.v} onClick={() => setStatusFilter(s.v)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                background: active ? '#EFF6FF' : '#fff', color: active ? 'var(--accent)' : 'var(--text-3)',
              }}>{s.l}</button>
            )
          })}
        </div>
      </div>

      {/* Task table */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="tasks">No tasks in this view.</Empty> : (
          <div className="ies-table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)', background: '#FCFCFD' }}>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>TITLE</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>ASSIGNEE</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>BUILDING</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>PRIORITY</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>DUE</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const du = daysUntil(t.due_date)
                  const overdue = du != null && du < 0 && t.status !== 'done' && t.status !== 'cancelled'
                  const isMine = t.assigned_to_id === user?.id
                  const canEdit = isMine || can(role, MANAGERS)
                  const [sc, sb] = statusMeta(t.status)
                  return (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px 14px', maxWidth: 320 }}>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        {t.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t.assignee
                            ? <Avatar name={t.assignee.full_name} color={roleColor(t.assignee.role)} size={24} />
                            : <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#E2E8F0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700 }}>{initials(null)}</span>}
                          <span style={{ whiteSpace: 'nowrap' }}>{t.assignee?.full_name || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{t.building?.code || '—'}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}><Chip status={t.priority} /></td>
                      <td style={{ padding: '12px 8px' }}>
                        {canEdit ? (
                          <select value={t.status} onChange={(e) => onStatusChange(t, e.target.value)}
                            style={{
                              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 20,
                              color: sc, background: sb, border: `1px solid ${sc}33`, cursor: 'pointer',
                            }}>
                            {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : <Chip status={t.status} />}
                      </td>
                      <td style={{ padding: '12px 8px', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap', color: overdue ? '#EF4444' : 'var(--text-3)' }}>
                        {fmtDate(t.due_date)}
                        {overdue && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, color: '#EF4444', background: '#FEF2F2' }}>overdue</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <NewTask onClose={() => setShowNew(false)} user={user} />}
    </div>
  )
}

function Perf({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, marginTop: 6, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

function NewTask({ onClose, user }) {
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name,role').eq('archived', false).order('full_name'))
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [assignee, setAssignee] = useState('')
  const [bid, setBid] = useState('')
  const [priority, setPriority] = useState('medium')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    const b = buildings.find((x) => x.id === bid)
    const { error } = await bgInsert('tasks', {
      title: title.trim(),
      description: desc || null,
      created_by_id: user.id,
      assigned_to_id: assignee || null,
      building_id: bid || null,
      project_id: b?.project_id || null,
      priority,
      status: 'open',
      due_date: due || null,
    }, { okMsg: 'Task raised ✓' })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open title="Raise a task" onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Raise task'}</Btn>
      </>}>
      <Field label="Title">
        <input lang="en" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      </Field>
      <Field label="Description">
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Assignee">
            <select style={inputStyle} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
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
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Priority">
            <select style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Due date">
            <input lang="en" style={inputStyle} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
