import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from '../components/Icon'
import { Avatar, Chip, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import DateInput from '../components/DateInput'
import { useAuth, can } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { supabase } from '../lib/supabase'
import { fmtDate, daysUntil, initials } from '../lib/format'
import { roleColor, roleTitle, statusMeta, CAN_RAISE_TASK } from '../lib/constants'

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
  // Not a status — the trash is the deleted_at axis, and it is offered here
  // because to the person looking for a task "where did it go?" is one question,
  // not two. Cancelled and trashed are different answers to it (amendment C).
  { v: 'trash', l: 'Trash' },
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

// The ONE place the UI expresses the edit/trash right, mirroring may_manage in
// tasks_edit_guard() (migration 0124):
//
//     may_manage := (me = OLD.created_by_id) or is_in_subtree(me, OLD.assigned_to_id)
//
// Edit, Trash and Restore all gate on this and nothing else. Writing it once
// matters more than it looks: the same rule expressed at three call sites is
// how the MANAGERS-list bug 9R(2) fixed came to exist in the first place.
//
// Note it is strictly NARROWER than canTouch (tasks_upd's USING clause), which
// also admits the bare assignee. That gap is the point of amendment B: holding
// a task lets you report on it, not rewrite the brief you are judged against.
const mayManage = (t, me, subtree) =>
  t.created_by_id === me || subtree.some((p) => p.id === t.assigned_to_id)

const dayAge = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)

// The subtitle is a claim about reach, so it is written against tasks_read and
// nothing else. Each branch below names the policy clause that makes it true:
//
//   ceo / pmo  → auth_role() = any (array['ceo','pmo'])   — the carve-out, so
//                "all tasks" is literally what the policy grants.
//   subtree    → is_in_subtree(auth.uid(), assigned_to_id | created_by_id)
//   otherwise  → assigned_to_id = auth.uid() OR created_by_id = auth.uid()
//
// It takes hasTeam rather than deciding for itself, so the label and the Team
// fetch cannot disagree: both read the same subtree the page already walked.
// A label that overclaims is the exact defect this sprint exists to prevent —
// it is a promise the database will refuse to keep.
//
// Note what is deliberately NOT claimed: amendment D's pm_id branch widens the
// policy, but only for tasks on a project you manage. There is no honest
// one-line label for "plus anything on my projects", and inventing one would
// overclaim for every user who is not a pm. It stays unsaid.
const scopeLabel = (role, hasTeam) => (
  role === 'ceo' || role === 'pmo' ? 'All tasks across the program'
    : hasTeam ? "My team's tasks"
      : 'My tasks'
)

const LIVE_STATUSES = ['open', 'in_progress', 'blocked']

// Page-level head counts. These are COUNT-only round trips (head: true), not
// row fetches, because the four cards need five numbers and none of the rows.
//
// They are deliberately independent of the active tab: the cards describe your
// whole queue, the table below them describes one slice of it, and the two will
// legitimately disagree the moment you switch to Delegated. That is not a bug
// to be reconciled — reconciling it would mean the cards changed meaning every
// time a tab was clicked.
//
// Every count filters deleted_at is null: a trashed task is withdrawn and must
// not go on counting against anybody.
function useTaskCounts(me, teamIdList, refreshKey) {
  const [counts, setCounts] = useState(null)
  const isManager = teamIdList.length > 1
  const teamKey = teamIdList.join(',')

  useEffect(() => {
    if (!me) return undefined
    let alive = true
    const base = () => supabase.from('tasks').select('id', { count: 'exact', head: true }).is('deleted_at', null)
    const today = new Date().toISOString().slice(0, 10)
    Promise.all([
      base().eq('assigned_to_id', me).in('status', LIVE_STATUSES),
      base().eq('assigned_to_id', me).in('status', LIVE_STATUSES).lt('due_date', today),
      isManager
        ? base().in('assigned_to_id', teamIdList).in('status', LIVE_STATUSES)
        : base().eq('assigned_to_id', me).eq('status', 'in_progress'),
      base().eq('assigned_to_id', me).eq('status', 'done'),
      // Drives the Delegated tab: the tab appears when you manage someone OR
      // when you already hold delegated rows, so an ex-manager chasing work he
      // handed out before the org chart changed does not lose the only view
      // that shows it.
      base().eq('created_by_id', me).neq('assigned_to_id', me),
    ]).then((res) => {
      if (!alive) return
      setCounts({
        mine: res[0].count ?? 0,
        overdue: res[1].count ?? 0,
        third: res[2].count ?? 0,
        done: res[3].count ?? 0,
        delegated: res[4].count ?? 0,
      })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, teamKey, isManager, refreshKey])

  return counts
}

const rowBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
  padding: '4px 9px', borderRadius: 'var(--radius-s)', cursor: 'pointer',
  background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--line)',
}

export default function Tasks() {
  const { user, profile, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState('mine')
  const [statusFilter, setStatusFilter] = useState('active')
  const [page, setPage] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
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

  const teamIdList = useMemo(
    () => (subtree.length ? [user.id, ...subtree.map((p) => p.id)] : [NOBODY]),
    [subtree, user?.id])
  const teamIds = useMemo(() => teamIdList.join(','), [teamIdList])

  // Do you actually manage anyone? That — not a role list — is what a "Team"
  // view means. This used to be `can(role, MANAGERS)` against a hard-coded
  // ['projm','progm','pmo','ceo'], which silently excluded procm: Adnan has
  // Shakkel reporting to him and could not see his own team. Escalations.jsx
  // has always asked the truthful question ("does anyone report to me?") and
  // that divergence between two pages is what let the bug live. One test now.
  const isManager = subtree.length > 0

  // Who this actor may hand a task to, and the ONLY set the reassign control is
  // ever allowed to offer. It is the UI half of tasks_reassign_guard's test —
  //   NEW.assigned_to_id = auth.uid() OR is_in_subtree(auth.uid(), NEW.assigned_to_id)
  // — so every option here is one the trigger will accept. The same set also
  // satisfies tasks_upd's WITH CHECK on the updated row (branch 1 for me,
  // branch 3 for anyone below me), so nothing offered can fail either fence.
  const assignTargets = useMemo(() => ([
    ...(profile ? [{ id: user.id, full_name: `${profile.full_name} (me)` }] : []),
    ...subtree,
  ]), [profile, user?.id, subtree])

  const scopeKey = tab === 'team' && !isManager ? 'mine' : tab
  const scope = SCOPES[scopeKey]
  const trashView = statusFilter === 'trash'

  // THE DELETED_AT SPLIT — three cases, and the third is deliberate.
  //
  //   Trash view      → only trashed rows.
  //   Team tab        → NO deleted_at filter at all. 9R(5)'s Team Performance
  //                     widget has to report how many tasks were trashed in the
  //                     last 30 days (amendment C's anti-gaming counter), and
  //                     the spec requires it to compute from the SAME fetch that
  //                     backs the tab — no second query. So the rows must be
  //                     present here, and the TABLE drops them client-side just
  //                     below. This is intentional: do not "fix" it by adding a
  //                     server filter, or the widget silently reports zero.
  //   everything else → live rows only, filtered server-side.
  const { rows, loading } = useLiveQuery('tasks', (q) => {
    let base = q.select('*,assignee:profiles!tasks_assigned_to_id_fkey(full_name,role),creator:profiles!tasks_created_by_id_fkey(full_name)' +
      ',building:buildings(code)').order('due_date', { ascending: true }).limit(500)
    if (trashView) base = base.not('deleted_at', 'is', null)
    else if (scopeKey !== 'team') base = base.is('deleted_at', null)
    return scope.apply(base, { me: user?.id || NOBODY, ids: teamIds })
  }, [scopeKey, user?.id, teamIds, trashView])

  const filtered = rows.filter((t) => {
    const trashed = !!t.deleted_at
    // The Team tab fetches trashed rows for the widget; the table never shows
    // them outside the trash view.
    if (trashView) return trashed
    if (trashed) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'active') return t.status !== 'done' && t.status !== 'cancelled'
    return t.status === statusFilter
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  // Recomputed whenever the live query refetches (realtime included), because
  // `rows` takes a new identity on every fetch.
  const counts = useTaskCounts(user?.id, teamIdList, rows)

  const setTabAndReset = (k) => { setTab(k); setPage(0) }
  const setFilterAndReset = (v) => { setStatusFilter(v); setPage(0) }

  const onStatusChange = (t, next) => {
    if (next === t.status) return
    bgUpdate('tasks', t.id, { status: next }, { okMsg: `Marked ${statusMeta(next)[2]}` })
  }

  // The new assignee is notified by tasks_notify() server-side, so there is
  // nothing to write here beyond the column itself.
  const onReassign = (t, next) => {
    if (!next || next === t.assigned_to_id) return
    const who = assignTargets.find((p) => p.id === next)
    bgUpdate('tasks', t.id, { assigned_to_id: next },
      { okMsg: `Reassigned to ${who?.full_name.replace(' (me)', '') || 'them'}` })
  }

  // Trash and restore write deleted_at and NOTHING else. deleted_by_id is
  // stamped by tasks_edit_guard() from auth.uid() on the way in and cleared by
  // it on the way out, so sending it from here would at best be ignored and at
  // worst be a claim about who did it that the client has no business making.
  //
  // None of these writes passes errMsg, and that is deliberate: bgUpdate falls
  // back to `Couldn't update — ${error.message}`, which surfaces the guard's own
  // sentence. Those sentences were written to be read by the person who hit
  // them, so overriding them with a generic failure toast would throw away the
  // only explanation the user gets.
  const onTrash = (t) => bgUpdate('tasks', t.id, { deleted_at: new Date().toISOString() },
    { okMsg: 'Moved to trash' })

  const onRestore = (t) => bgUpdate('tasks', t.id, { deleted_at: null },
    { okMsg: 'Restored from trash' })

  // "Raise an escalation about this task" — the blocked-task bridge.
  const escalate = (t) => navigate('/escalations', {
    state: { fromTask: { id: t.id, title: t.title, project_id: t.project_id, building_id: t.building_id } },
  })

  // Gate on DATA, not on inference. A non-empty subtree means you can delegate;
  // a non-zero delegated count means you already have, whatever the org chart
  // says today. Either one earns the tab — otherwise an ex-manager loses the
  // only view that shows the work he handed out.
  const showDelegated = isManager || (counts?.delegated ?? 0) > 0
  const tabs = ['mine', ...(showDelegated ? ['delegated'] : []), ...(isManager ? ['team'] : [])]

  return (
    <div data-screen-label="My Tasks">
      <PageTitle kicker="My queue" title={`Tasks for ${profile?.full_name || 'me'}`}
        right={can(role, CAN_RAISE_TASK) && (
          <Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>New Task</Btn>
        )} />
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: -12, marginBottom: 16 }}>
        {scopeLabel(role, isManager)} · {scope.blurb}
      </div>

      <KpiCards counts={counts} isManager={isManager} />

      {/* Tabs + status filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', padding: 3, background: 'var(--surface-1)' }}>
          {tabs.map((k) => {
            const active = scopeKey === k
            return (
              <button key={k} onClick={() => setTabAndReset(k)} style={{
                padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--radius-s)',
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
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                background: active ? 'var(--accent-tint)' : 'var(--surface-1)', color: active ? 'var(--accent)' : 'var(--text-3)',
              }}>{s.l}</button>
            )
          })}
        </div>
      </div>

      {/* Team Performance — Team tab only, computed from the team's own rows.
          `rows` here still carries the trashed ones (see the fetch split): the
          widget needs them for its trashed counter and drops them everywhere
          else. */}
      {scopeKey === 'team' && <TeamPerformance rows={rows} subtree={subtree} />}

      {/* Task table */}
      <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
        {loading ? <Loading /> : filtered.length === 0 ? (
          <Empty icon="tasks">{trashView ? 'Nothing in the trash.' : 'No tasks in this view.'}</Empty>
        ) : (
          <div className="ies-table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10.5, fontFamily: 'var(--mono)', background: 'var(--raised)' }}>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>Title</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>Assignee</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>Building</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>Priority</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '11px 8px', fontWeight: 600 }}>Due</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const du = daysUntil(t.due_date)
                  const overdue = du != null && du < 0 && t.status !== 'done' && t.status !== 'cancelled'
                  const canTouch = t.assigned_to_id === user?.id || t.created_by_id === user?.id
                    || subtree.some((p) => p.id === t.assigned_to_id)
                  // A trashed row is withdrawn. tasks_edit_guard refuses every
                  // write on it except the restore — "restore it before changing
                  // anything else" — so the row offers exactly one control and
                  // no other. Rendering a status select here would be offering a
                  // move the trigger is certain to reject.
                  const trashed = !!t.deleted_at
                  const iManage = mayManage(t, user?.id, subtree)
                  const moves = trashed ? [] : nextStates(t, user?.id, canTouch)
                  const [sc, sb] = statusMeta(t.status)
                  const terminal = t.status === 'done' || t.status === 'cancelled'
                  // Three conditions, each mapping to a real fence. canTouch is
                  // tasks_upd's USING clause, so without it the write is a
                  // silent 0-row no-op. assignTargets is tasks_reassign_guard's
                  // accepted set, so an empty subtree means there is no legal
                  // target but yourself and the control would be a dead button.
                  // Terminal rows are the one place the UI is deliberately
                  // STRICTER than the database: the trigger would allow moving
                  // a finished task, but doing so means nothing and would fire
                  // a task_assigned notification for work already closed.
                  const canReassign = canTouch && !terminal && !trashed && subtree.length > 0
                  // Whoever holds it now may sit outside the offer set (a row
                  // seeded or assigned before the guards landed), so carry them
                  // as the selected option or the select would misreport who
                  // owns the task.
                  const holderListed = assignTargets.some((p) => p.id === t.assigned_to_id)
                  return (
                    <tr key={t.id} style={{
                      borderTop: '1px solid var(--line)',
                      background: t.id === focusId ? 'var(--accent-tint)' : undefined,
                      boxShadow: t.id === focusId ? 'inset 3px 0 0 var(--accent)' : undefined,
                    }}>
                      <td style={{ padding: '12px 14px', maxWidth: 320 }}>
                        <div style={{ fontWeight: 600, textDecoration: trashed ? 'line-through' : undefined, color: trashed ? 'var(--text-3)' : undefined }}>{t.title}</div>
                        {t.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: trashed || t.status === 'blocked' || iManage ? 6 : 0 }}>
                          {t.status === 'blocked' && !trashed && (
                            <button onClick={() => escalate(t)} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
                              padding: '4px 9px', borderRadius: 'var(--radius-s)', background: 'var(--bad-bg)', color: 'var(--bad-deep)', border: '1px solid var(--bad-bg)', cursor: 'pointer',
                            }}>
                              <Icon name="escalation" size={12} />Raise an escalation about this
                            </button>
                          )}
                          {/* Edit and Trash both gate on iManage — the single
                              mirror of tasks_edit_guard's may_manage. */}
                          {iManage && !trashed && (
                            <button onClick={() => setEditing(t)} style={rowBtn}
                              title="Edit this task's details. Only the person who raised it, or a manager above whoever holds it, can.">
                              <Icon name="edit" size={12} />Edit
                            </button>
                          )}
                          {iManage && !trashed && (
                            <button onClick={() => onTrash(t)} style={rowBtn}
                              title="Trash: this task should never have existed. It leaves the working lists, keeps its history, and can be restored. To close work that was real but is no longer needed, set the status to Cancelled instead.">
                              <Icon name="box" size={12} />Trash
                            </button>
                          )}
                          {iManage && trashed && (
                            <button onClick={() => onRestore(t)} style={{ ...rowBtn, color: 'var(--ok)', borderColor: 'var(--ok)' }}
                              title="Put this task back into the working lists.">
                              <Icon name="check" size={12} />Restore
                            </button>
                          )}
                          {trashed && t.deleted_at && (
                            <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>
                              trashed {fmtDate(t.deleted_at)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t.assignee
                            ? <Avatar name={t.assignee.full_name} color={roleColor(t.assignee.role)} size={24} />
                            : <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--line)', color: 'var(--surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700 }}>{initials(null)}</span>}
                          {canReassign ? (
                            <select value={t.assigned_to_id || ''} onChange={(e) => onReassign(t, e.target.value)}
                              title="Reassign to yourself or someone who reports to you"
                              style={{
                                fontSize: 12.5, padding: '3px 6px', borderRadius: 'var(--radius-s)', maxWidth: 190,
                                color: 'var(--text)', background: 'var(--surface-1)', border: '1px solid var(--line)', cursor: 'pointer',
                              }}>
                              {!holderListed && (
                                <option value={t.assigned_to_id || ''}>{t.assignee?.full_name || 'Unassigned'}</option>
                              )}
                              {assignTargets.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                            </select>
                          ) : <span style={{ whiteSpace: 'nowrap' }}>{t.assignee?.full_name || 'Unassigned'}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{t.building?.code || '—'}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}><Chip status={t.priority} /></td>
                      <td style={{ padding: '12px 8px' }}>
                        {moves.length ? (
                          <select value={t.status} onChange={(e) => onStatusChange(t, e.target.value)}
                            title="Cancelled means the work was real but is no longer needed — the task stays in the lists and in history. To withdraw a task that should never have been raised, use Trash."
                            style={{
                              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 999,
                              color: sc, background: sb, border: `1px solid ${sc}33`, cursor: 'pointer',
                            }}>
                            <option value={t.status}>{statusMeta(t.status)[2]}</option>
                            {moves.map((v) => <option key={v} value={v}>{statusMeta(v)[2]}</option>)}
                          </select>
                        ) : <Chip status={t.status} />}
                      </td>
                      <td style={{ padding: '12px 8px', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap', color: overdue ? 'var(--bad)' : 'var(--text-3)' }}>
                        {fmtDate(t.due_date)}
                        {overdue && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: 'var(--bad)', background: 'var(--bad-bg)' }}>overdue</span>}
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

      {/* tasks_ins accepts the same set tasks_reassign_guard does, so create and
          reassign share one list rather than two that can drift apart. */}
      {showNew && <NewTask onClose={() => setShowNew(false)} user={user} assignable={assignTargets} />}
      {editing && <EditTask task={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// Amendment B. Only the four fields tasks_edit_guard classes as content and
// that this commit is responsible for: Project, Building and ESM are targeting,
// they need filtered pickers that re-filter on project change, and they arrive
// in 9R(6) for the create and edit modals together rather than half-built here.
//
// Assignee is deliberately absent too — reassignment is its own control on the
// row, governed by a different trigger with a different accepted set.
function EditTask({ task, onClose }) {
  const [title, setTitle] = useState(task.title || '')
  const [desc, setDesc] = useState(task.description || '')
  const [priority, setPriority] = useState(task.priority || 'medium')
  const [due, setDue] = useState(task.due_date || '')
  const [busy, setBusy] = useState(false)

  const valid = title.trim().length > 0
  const dirty = title.trim() !== (task.title || '')
    || (desc || '') !== (task.description || '')
    || priority !== (task.priority || 'medium')
    || (due || '') !== (task.due_date || '')

  const save = async () => {
    if (!valid || !dirty) return
    setBusy(true)
    // Send only what changed, so the audit sentence names the real edit rather
    // than every field the form happens to hold.
    const patch = {}
    if (title.trim() !== (task.title || '')) patch.title = title.trim()
    if ((desc || '') !== (task.description || '')) patch.description = desc || null
    if (priority !== (task.priority || 'medium')) patch.priority = priority
    if ((due || '') !== (task.due_date || '')) patch.due_date = due || null
    const { error } = await bgUpdate('tasks', task.id, patch, { okMsg: 'Task updated' })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open title="Edit task" onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy || !valid || !dirty}>{busy ? 'Saving…' : 'Save changes'}</Btn>
      </>}>
      <Field label="Title">
        <input lang="en" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
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

// Four numbers about YOUR queue, not about the tab you happen to be on.
function KpiCards({ counts, isManager }) {
  const cards = [
    { k: 'mine', label: 'Assigned to me', v: counts?.mine },
    { k: 'overdue', label: 'My overdue', v: counts?.overdue, danger: true },
    { k: 'third', label: isManager ? 'Team tasks' : 'In progress', v: counts?.third },
    { k: 'done', label: 'Completed', v: counts?.done, ok: true },
  ]
  // ies-kpis is the established KPI grid class: it carries the <767px collapse
  // and the min-width:0 guard that keeps a long number from forcing the row
  // wider than its container. auto-fit handles the in-between widths without
  // inventing a new breakpoint.
  return (
    <div className="ies-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
      {cards.map((c) => (
        <div key={c.k} style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>{c.label}</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, marginTop: 4,
            // A count of zero is a real answer and prints as 0. Only a count we
            // do not have yet prints as a placeholder.
            color: c.v == null ? 'var(--text-3)' : c.danger && c.v > 0 ? 'var(--bad)' : c.ok ? 'var(--ok)' : 'var(--text)',
          }}>{c.v == null ? '·' : c.v}</div>
        </div>
      ))}
    </div>
  )
}

// Returns null rather than 0 for an empty set. The distinction is the whole
// point: "nobody has closed anything" and "everything closes instantly" are
// opposite facts and must never render the same.
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const cycleDays = (t) => (t.done_at && t.created_at
  ? Math.max(0, (new Date(t.done_at) - new Date(t.created_at)) / 86400000) : null)
const isOpenStatus = (s) => s === 'open' || s === 'in_progress' || s === 'blocked'

const ageColor = (d) => (d == null ? 'var(--text-3)' : d > 14 ? 'var(--bad)' : d > 7 ? 'var(--warn)' : 'var(--text)')
const pctColor = (p) => (p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : p >= 25 ? '#C2410C' : 'var(--bad)')

// Spec §6. Every number here comes from the SAME fetch that backs the Team tab
// — there is no second query — which is why the tab deliberately does not
// filter deleted_at server-side.
//
// THE TRASH ASYMMETRY, which is the anti-gaming design and not an oversight:
// trashed rows are excluded from every per-employee statistic and from both
// strip averages, and appear ONLY as the "trashed · 30d" counter in the header.
// If they counted toward anything else, trashing an overdue task would improve
// the numbers, which is precisely the behaviour amendment C exists to expose.
function TeamPerformance({ rows, subtree }) {
  const s = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000

    // ONE POPULATION for the whole card: tasks held by someone strictly below
    // me. The Team FETCH is deliberately wider than this — it also returns rows
    // I or my reports merely created, including ones assigned outside the
    // subtree — but a widget titled Team Performance measures the team's work,
    // and letting the strip count a population the table below it does not
    // would make the two halves of one card disagree. Scoping both to the same
    // set is what keeps "5 open" from sitting above four rows totalling 4.
    const held = new Set(subtree.map((p) => p.id))
    const inTeam = rows.filter((t) => held.has(t.assigned_to_id))
    const live = inTeam.filter((t) => !t.deleted_at)
    const trashed30 = inTeam.filter((t) => t.deleted_at && new Date(t.deleted_at).getTime() >= cutoff).length

    const openTasks = live.filter((t) => isOpenStatus(t.status))
    const stripAge = avg(openTasks.map((t) => dayAge(t.created_at)))
    // 30-day window: this metric ONLY. Per-employee cycle below is all-time.
    const done30 = live.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at).getTime() >= cutoff)
    const stripCycle = avg(done30.map(cycleDays).filter((c) => c != null))

    // One row per STRICTLY-JUNIOR subordinate. Keying off `subtree` — which
    // never contains me — is what keeps my own tasks and my peers' out of the
    // table without a second filter to get wrong.
    const byId = new Map(subtree.map((p) => [p.id, {
      id: p.id, full_name: p.full_name, role: p.role,
      total: 0, done: 0, inprog: 0, overdue: 0, ages: [], cycles: [],
    }]))
    live.forEach((t) => {
      const e = byId.get(t.assigned_to_id)
      if (!e) return
      e.total += 1
      if (t.status === 'done') {
        e.done += 1
        const c = cycleDays(t)
        if (c != null) e.cycles.push(c)   // ALL their completed work, no window
      } else if (t.status === 'in_progress') {
        e.inprog += 1
      }
      if (isOpenStatus(t.status)) {
        e.ages.push(dayAge(t.created_at))
        const du = daysUntil(t.due_date)
        if (du != null && du < 0) e.overdue += 1
      }
    })

    const people = [...byId.values()]
      .filter((e) => e.total > 0)
      .map((e) => ({
        ...e,
        avgAge: avg(e.ages),
        avgCycle: avg(e.cycles),
        pct: e.total ? Math.round((e.done / e.total) * 100) : null,
      }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))

    const totals = people.reduce((acc, e) => ({
      total: acc.total + e.total, done: acc.done + e.done, overdue: acc.overdue + e.overdue,
    }), { total: 0, done: 0, overdue: 0 })

    return {
      trashed30,
      openCount: openTasks.length,
      stripAge,
      stripCycle,
      people,
      orgPct: totals.total ? Math.round((totals.done / totals.total) * 100) : null,
      orgAge: avg(people.flatMap((e) => e.ages)),
      orgCycle: avg(people.flatMap((e) => e.cycles)),
      orgTotal: totals.total,
      orgOverdue: totals.overdue,
    }
  }, [rows, subtree])

  const th = { padding: '9px 8px', fontWeight: 600, whiteSpace: 'nowrap' }
  const td = { padding: '9px 8px', whiteSpace: 'nowrap' }

  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-1)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Team Performance</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>
          <span>{s.people.length} people</span>
          <span>{s.orgTotal} tasks</span>
          {s.orgPct != null && <span>{s.orgPct}% complete</span>}
          {s.orgAge != null && <span>avg age {s.orgAge}d</span>}
          {s.orgCycle != null && <span>avg cycle {s.orgCycle}d</span>}
          {s.orgOverdue > 0 && <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{s.orgOverdue} overdue</span>}
          <span title="Tasks moved to the trash in the last 30 days. Shown so that withdrawing work is visible rather than silent.">
            {s.trashed30} trashed · 30d
          </span>
        </div>
      </div>

      {/* Part 1 — the strip */}
      <div className="ies-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 18, alignItems: 'start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Avg age of open tasks</div>
          {s.openCount === 0
            ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>No open tasks.</div>
            : <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, marginTop: 6, color: ageColor(s.stripAge) }}>{s.stripAge}d</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Avg cycle · 30d</div>
          {s.stripCycle == null
            ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>No tasks closed in the last 30 days.</div>
            : <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, marginTop: 6, color: 'var(--ok)' }}>{s.stripCycle}d</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Open tasks</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, marginTop: 6 }}>{s.openCount}</div>
        </div>
      </div>

      {/* Part 2 — per employee. The card is always rendered, never hidden. */}
      {s.people.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          No subordinate tasks visible yet.
        </div>
      ) : (
        <div className="ies-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--mono)', background: 'var(--raised)' }}>
                <th style={th}>Employee</th>
                <th style={th}>Role</th>
                <th style={th}>Total</th>
                <th style={th}>Done</th>
                <th style={th}>In Progress</th>
                <th style={th}>Overdue</th>
                <th style={th}>Avg open age</th>
                <th style={th}>Avg cycle</th>
                <th style={{ ...th, minWidth: 130 }}>Completion</th>
              </tr>
            </thead>
            <tbody>
              {s.people.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={e.full_name} color={roleColor(e.role)} size={22} />
                      <span style={{ fontWeight: 600 }}>{e.full_name}</span>
                    </div>
                  </td>
                  <td style={{ ...td, color: 'var(--text-3)' }}>{roleTitle(e.role)}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)' }}>{e.total}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)' }}>{e.done}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)' }}>{e.inprog}</td>
                  <td style={{
                    ...td, fontFamily: 'var(--mono)',
                    color: e.overdue > 0 ? 'var(--bad)' : 'var(--text-3)', fontWeight: e.overdue > 0 ? 700 : 400,
                  }}>{e.overdue}</td>
                  <td style={{
                    ...td, fontFamily: 'var(--mono)',
                    color: ageColor(e.avgAge), fontWeight: e.avgAge != null && e.avgAge > 14 ? 700 : 400,
                  }}>{e.avgAge == null ? '—' : `${e.avgAge}d`}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)' }}>{e.avgCycle == null ? '—' : `${e.avgCycle}d`}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 60, height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                        <div style={{ width: `${e.pct}%`, height: '100%', background: pctColor(e.pct) }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: pctColor(e.pct), fontWeight: 700 }}>{e.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
