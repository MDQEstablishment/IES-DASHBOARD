import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from '../components/Icon'
import { Avatar, Chip, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import DateInput from '../components/DateInput'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { fmtDate, daysUntil, initials } from '../lib/format'
import { roleColor, statusMeta, MANAGERS, CAN_RAISE_TASK } from '../lib/constants'

const PAGE_SIZE = 100
const NOBODY = '00000000-0000-0000-0000-000000000000'

// One place defines a tab: its label, the sentence under the page title, and
// the server-side filter. Previously the page fetched every task it was allowed
// to see and filtered in the browser, so the heading and the rows could disagree.
const SCOPES = {
  mine: {
    label: 'Mine',
    blurb: 'Tasks assigned to you',
    apply: (q, { me }) => q.eq('assigned_to_id', me),
  },
  delegated: {
    label: 'Delegated',
    blurb: 'Tasks you raised and assigned to someone else',
    apply: (q, { me }) => q.eq('created_by_id', me).neq('assigned_to_id', me),
  },
  team: {
    label: 'Team',
    blurb: 'Everyone who reports to you, directly or indirectly',
    apply: (q, { ids }) => q.or(`assigned_to_id.in.(${ids}),created_by_id.in.(${ids})`),
  },
}

const STATUS_FILTERS = [
  { v: 'active', l: 'Active' },
  { v: 'open', l: 'Open' },
  { v: 'in_progress', l: 'In Progress' },
  { v: 'blocked', l: 'Blocked' },
  { v: 'done', l: 'Done' },
  { v: 'cancelled', l: 'Cancelled' },
  { v: 'all', l: 'All' },
]

// The legal status graph, mirrored from tasks_status_guard() in migration 0102.
// The trigger is the fence — this only decides which moves are worth offering.
const EDGES = {
  open: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress', 'cancelled'],
  done: [],
  cancelled: [],
}

// Who may make each move: done is the assignee's alone, cancel the creator's
// alone (9G Risk 3 — a manager can no longer close someone else's work).
function nextStates(t, me, canTouch) {
  const isAssignee = t.assigned_to_id === me
  const isCreator = t.created_by_id === me
  return (EDGES[t.status] || []).filter((s) => (
    s === 'done' ? isAssignee : s === 'cancelled' ? isCreator : canTouch
  ))
}

const dayAge = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)

export default function Tasks() {
  const { user, profile, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isManager = can(role, MANAGERS)
  const [tab, setTab] = useState('mine')
  const [statusFilter, setStatusFilter] = useState('active')
  const [page, setPage] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [focusId, setFocusId] = useState(null)

  // Arriving from the notification bell: land on the tab that actually holds
  // the task, and show every status so a completed one is not filtered away.
  useEffect(() => {
    const s = location.state
    if (!s?.focusTask) return
    setTab(s.focusTab || 'mine')
    setStatusFilter('all')
    setPage(0)
    setFocusId(s.focusTask)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const { rows: people } = useLiveQuery('profiles', (q) =>
    q.select('id,full_name,role,manager_id').eq('archived', false).order('full_name'))

  // Everyone below me in the reporting chain. The DB walks the same chain in
  // is_in_subtree(); this copy only shapes the UI (dropdown + Team fetch).
  const subtree = useMemo(() => {
    if (!user?.id) return []
    const byManager = new Map()
    people.forEach((p) => {
      const k = p.manager_id || ''
      if (!byManager.has(k)) byManager.set(k, [])
      byManager.get(k).push(p)
    })
    const out = []
    const seen = new Set([user.id])
    const walk = (id) => (byManager.get(id) || []).forEach((p) => {
      if (seen.has(p.id)) return
      seen.add(p.id); out.push(p); walk(p.id)
    })
    walk(user.id)
    return out
  }, [people, user?.id])

  const teamIds = useMemo(
    () => (subtree.length ? [user.id, ...subtree.map((p) => p.id)].join(',') : NOBODY),
    [subtree, user?.id])

  const scopeKey = tab === 'team' && !isManager ? 'mine' : tab
  const scope = SCOPES[scopeKey]

  const { rows, loading } = useLiveQuery('tasks', (q) => scope.apply(
    q.select('*,assignee:profiles!tasks_assigned_to_id_fkey(full_name,role),creator:profiles!tasks_created_by_id_fkey(full_name)' +
      ',building:buildings(code)').order('due_date', { ascending: true }).limit(500),
    { me: user?.id || NOBODY, ids: teamIds },
  ), [scopeKey, user?.id, teamIds])

  const filtered = rows.filter((t) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'active') return t.status !== 'done' && t.status !== 'cancelled'
    return t.status === statusFilter
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  const setTabAndReset = (k) => { setTab(k); setPage(0) }
  const setFilterAndReset = (v) => { setStatusFilter(v); setPage(0) }

  const onStatusChange = (t, next) => {
    if (next === t.status) return
    bgUpdate('tasks', t.id, { status: next }, { okMsg: `Marked ${statusMeta(next)[2]}` })
  }

  // "Raise an escalation about this task" — the blocked-task bridge.
  const escalate = (t) => navigate('/escalations', {
    state: { fromTask: { id: t.id, title: t.title, project_id: t.project_id, building_id: t.building_id } },
  })

  const tabs = ['mine', 'delegated', ...(isManager ? ['team'] : [])]

  return (
    <div data-screen-label="My Tasks">
      <PageTitle kicker="MY QUEUE" title={`Tasks for ${profile?.full_name || 'me'}`}
        right={can(role, CAN_RAISE_TASK) && (
          <Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>New Task</Btn>
        )} />
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: -12, marginBottom: 16 }}>{scope.blurb}</div>

      {/* Tabs + status filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 8, padding: 3, background: '#fff' }}>
          {tabs.map((k) => {
            const active = scopeKey === k
            return (
              <button key={k} onClick={() => setTabAndReset(k)} style={{
                padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 7,
                color: active ? 'var(--accent)' : 'var(--text-3)',
                background: active ? 'rgba(160,118,43,.10)' : 'transparent',
                cursor: 'pointer',
              }}>{SCOPES[k].label}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.v
            return (
              <button key={s.v} onClick={() => setFilterAndReset(s.v)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                background: active ? '#F5EEDF' : '#fff', color: active ? 'var(--accent)' : 'var(--text-3)',
              }}>{s.l}</button>
            )
          })}
        </div>
      </div>

      {/* Team Performance — Team tab only, computed from the team's own rows */}
      {scopeKey === 'team' && <TeamPerformance rows={rows} />}

      {/* Task table */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? <Loading /> : filtered.length === 0 ? <Empty icon="tasks">No tasks in this view.</Empty> : (
          <div className="ies-table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)', background: '#FCFBF7' }}>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>TITLE</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>ASSIGNEE</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>BUILDING</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>PRIORITY</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>DUE</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const du = daysUntil(t.due_date)
                  const overdue = du != null && du < 0 && t.status !== 'done' && t.status !== 'cancelled'
                  const canTouch = t.assigned_to_id === user?.id || t.created_by_id === user?.id
                    || subtree.some((p) => p.id === t.assigned_to_id)
                  const moves = nextStates(t, user?.id, canTouch)
                  const [sc, sb] = statusMeta(t.status)
                  return (
                    <tr key={t.id} style={{
                      borderTop: '1px solid var(--line)',
                      background: t.id === focusId ? '#FBF6EA' : undefined,
                      boxShadow: t.id === focusId ? 'inset 3px 0 0 var(--accent)' : undefined,
                    }}>
                      <td style={{ padding: '12px 14px', maxWidth: 320 }}>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        {t.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>}
                        {t.status === 'blocked' && (
                          <button onClick={() => escalate(t)} style={{
                            marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
                            padding: '4px 9px', borderRadius: 7, background: '#F9ECEA', color: '#96271E', border: '1px solid #EBCFC9', cursor: 'pointer',
                          }}>
                            <Icon name="escalation" size={12} />Raise an escalation about this
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t.assignee
                            ? <Avatar name={t.assignee.full_name} color={roleColor(t.assignee.role)} size={24} />
                            : <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#E3DFD3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700 }}>{initials(null)}</span>}
                          <span style={{ whiteSpace: 'nowrap' }}>{t.assignee?.full_name || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{t.building?.code || '—'}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}><Chip status={t.priority} /></td>
                      <td style={{ padding: '12px 8px' }}>
                        {moves.length ? (
                          <select value={t.status} onChange={(e) => onStatusChange(t, e.target.value)}
                            style={{
                              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 20,
                              color: sc, background: sb, border: `1px solid ${sc}33`, cursor: 'pointer',
                            }}>
                            <option value={t.status}>{statusMeta(t.status)[2]}</option>
                            {moves.map((v) => <option key={v} value={v}>{statusMeta(v)[2]}</option>)}
                          </select>
                        ) : <Chip status={t.status} />}
                      </td>
                      <td style={{ padding: '12px 8px', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap', color: overdue ? '#B3362B' : 'var(--text-3)' }}>
                        {fmtDate(t.due_date)}
                        {overdue && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, color: '#B3362B', background: '#F9ECEA' }}>overdue</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
            {filtered.length} task{filtered.length === 1 ? '' : 's'} · showing {pageSafe * PAGE_SIZE + 1}–{Math.min(filtered.length, (pageSafe + 1) * PAGE_SIZE)}
          </span>
          {pageCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Btn variant="ghost" disabled={pageSafe === 0} onClick={() => setPage(pageSafe - 1)}>Prev</Btn>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{pageSafe + 1} / {pageCount}</span>
              <Btn variant="ghost" disabled={pageSafe >= pageCount - 1} onClick={() => setPage(pageSafe + 1)}>Next</Btn>
            </div>
          )}
        </div>
      )}

      {showNew && <NewTask onClose={() => setShowNew(false)} user={user} assignable={[
        ...(profile ? [{ id: user.id, full_name: `${profile.full_name} (me)` }] : []), ...subtree,
      ]} />}
    </div>
  )
}

// Open-queue health for the actor's own team. Cycle time is the trailing 30 days
// measured on done_at (added in 0102) — updated_at used to stand in for it and
// drifted every time a closed task was touched again.
function TeamPerformance({ rows }) {
  const openTasks = rows.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const cutoff = Date.now() - 30 * 86400000
  const recentlyDone = rows.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at).getTime() >= cutoff)
  const avgAge = openTasks.length
    ? Math.round(openTasks.reduce((s, t) => s + dayAge(t.created_at), 0) / openTasks.length) : 0
  const avgCycle = recentlyDone.length
    ? Math.round(recentlyDone.reduce((s, t) => s + Math.max(0, (new Date(t.done_at) - new Date(t.created_at)) / 86400000), 0) / recentlyDone.length)
    : null
  const topOldest = [...openTasks].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(0, 3)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Team Performance</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>OPEN QUEUE HEALTH</div>
      </div>
      <div className="ies-3col" style={{ display: 'grid', gridTemplateColumns: '120px 150px 1fr', gap: 18, alignItems: 'start' }}>
        <Perf label="AVG AGE" value={`${avgAge}d`} />
        {avgCycle == null
          ? (
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)' }}>AVG CYCLE · 30D</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>No tasks closed in the last 30 days.</div>
            </div>
          )
          : <Perf label="AVG CYCLE · 30D" value={`${avgCycle}d`} color="#217A54" />}
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', marginBottom: 6 }}>TOP 3 OLDEST OPEN</div>
          {topOldest.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>None open.</div> : topOldest.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.title}
                <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> · {t.assignee?.full_name || 'Unassigned'}</span>
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: '#B45309', flex: 'none' }}>{dayAge(t.created_at)}d</span>
            </div>
          ))}
        </div>
      </div>
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

function NewTask({ onClose, user, assignable }) {
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [assignee, setAssignee] = useState('')
  const [bid, setBid] = useState('')
  const [priority, setPriority] = useState('medium')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  // An unassigned task was never insertable — tasks_ins requires the assignee to
  // be you or someone below you — so the old "Unassigned" option always failed.
  const valid = title.trim().length > 0 && !!assignee

  const save = async () => {
    if (!valid) return
    setBusy(true)
    const b = buildings.find((x) => x.id === bid)
    const { error } = await bgInsert('tasks', {
      title: title.trim(),
      description: desc || null,
      created_by_id: user.id,
      assigned_to_id: assignee,
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
        <Btn variant="primary" onClick={save} disabled={busy || !valid}>{busy ? 'Saving…' : 'Raise task'}</Btn>
      </>}>
      <Field label="Title">
        <input lang="en" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      </Field>
      <Field label="Description">
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Assignee (you or someone who reports to you)">
            <select style={inputStyle} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Choose…</option>
              {assignable.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
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
            <DateInput style={inputStyle} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
