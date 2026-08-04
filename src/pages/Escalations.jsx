import { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { Avatar, Chip, PageTitle, Loading, Empty, Btn, Modal, Field, inputStyle } from '../components/ui'
import { useAuth } from '../rbac'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { roleColor } from '../lib/constants'
import { ago } from '../lib/format'

const TABS = [
  { k: 'mine', l: 'Raised by me' },
  { k: 'tome', l: 'Raised to me' },
  { k: 'all', l: 'All I can see' },
]

export default function Escalations() {
  const { user, profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const [tab, setTab] = useState('mine')
  const [resolving, setResolving] = useState(null)
  const [focusId, setFocusId] = useState(null)

  const { rows, loading } = useLiveQuery('escalations', (q) =>
    q.select('*,raised_by:profiles!escalations_raised_by_id_fkey(full_name,role),raised_to:profiles!escalations_raised_to_id_fkey(full_name,role),building:buildings(code,name)')
      .order('created_at', { ascending: false }).limit(200))

  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name,role,manager_id'))

  // Two things can navigate here with state: the blocked-task bridge on Tasks
  // (arrive with the form open and prefilled), and the notification bell
  // (arrive on the right tab with the row highlighted).
  useEffect(() => {
    const s = location.state
    if (!s) return
    if (s.fromTask) { setPrefill(s.fromTask); setShowNew(true) }
    if (s.focusEscalation) { setTab(s.focusTab || 'mine'); setFocusId(s.focusEscalation) }
    if (s.fromTask || s.focusEscalation) navigate(location.pathname, { replace: true, state: null })
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps

  // Does anyone actually report to me? That — not a role list — is what decides
  // whether "Raised to me" is a real tab or an empty box.
  const isRecipient = useMemo(
    () => !!user?.id && people.some((p) => p.manager_id === user.id), [people, user?.id])
  const noManager = profile && !profile.manager_id // CEO / Admin sit at the top of the chain

  const tabs = TABS.filter((t) => t.k !== 'tome' || isRecipient)
  const activeTab = tabs.some((t) => t.k === tab) ? tab : 'mine'

  const list = rows.filter((e) => (
    activeTab === 'mine' ? e.raised_by_id === user?.id
      : activeTab === 'tome' ? e.raised_to_id === user?.id
        : true))

  const counts = {
    mine: rows.filter((e) => e.raised_by_id === user?.id).length,
    tome: rows.filter((e) => e.raised_to_id === user?.id).length,
    all: rows.length,
  }

  const acknowledge = (e) =>
    bgUpdate('escalations', e.id, { status: 'acknowledged' }, { okMsg: 'Acknowledged — they can see you have it' })
  const close = (e) =>
    bgUpdate('escalations', e.id, { status: 'closed' }, { okMsg: 'Escalation closed' })

  // Re-escalate: a NEW row whose parent is this one. The trigger routes it one
  // level above the last recipient and rejects it unless the parent has been
  // answered — so this button only appears on a resolved/closed row I raised.
  const escalateHigher = (e) =>
    bgInsert('escalations', {
      title: e.title.startsWith('Escalated: ') ? e.title : 'Escalated: ' + e.title,
      description: e.description,
      raised_by_id: user.id,
      parent_escalation_id: e.id,
      project_id: e.project_id, building_id: e.building_id, related_task_id: e.related_task_id,
      severity: e.severity, status: 'open',
    }, { okMsg: 'Escalated one level higher' })

  // 9L — the one page that never carried a screen label. Same unstyled wrapper
  // the other nine use; Murshid reads the attribute to pick its help content.
  return (
    <div data-screen-label="Escalations">
      <PageTitle kicker="Hierarchy chain" title="Escalations"
        right={!noManager && <Btn variant="primary" icon="plus" onClick={() => { setPrefill(null); setShowNew(true) }}>Raise escalation</Btn>} />

      {noManager && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-tint)', border: '1px solid var(--warn-bg)', color: 'var(--accent-hover)', borderRadius: 'var(--radius-s)', padding: '9px 13px', fontSize: 12.5, marginBottom: 14 }}>
          <Icon name="alert" size={15} />You sit at the top of the chain — escalations route up to you; you don't raise them.
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', padding: 3, background: 'var(--surface-1)', marginBottom: 16, width: 'fit-content' }}>
        {tabs.map((t) => {
          const active = activeTab === t.k
          return (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding: '6px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--radius-s)',
              color: active ? 'var(--accent)' : 'var(--text-3)', background: active ? 'rgba(160,118,43,.10)' : 'transparent', cursor: 'pointer',
            }}>{t.l} ({counts[t.k]})</button>
          )
        })}
      </div>

      {loading ? <Loading /> : list.length === 0 ? (
        <Empty icon="escalation">
          {activeTab === 'mine' ? "You haven't raised any escalations."
            : activeTab === 'tome' ? 'Nothing has been escalated to you.'
              : 'No escalations.'}
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((e) => (
            <Card key={e.id} e={e} me={user?.id} people={people} focused={e.id === focusId}
              onAck={acknowledge} onResolve={setResolving} onClose={close} onHigher={escalateHigher} />
          ))}
        </div>
      )}

      {showNew && <NewEscalation onClose={() => { setShowNew(false); setPrefill(null) }} user={user} prefill={prefill} />}
      {resolving && <ResolveModal e={resolving} onClose={() => setResolving(null)} />}
    </div>
  )
}

function Card({ e, me, people, focused, onAck, onResolve, onClose, onHigher }) {
  const isRaiser = e.raised_by_id === me
  const isRecipient = e.raised_to_id === me

  // Exactly the moves migration 0103 will accept from this person, in this state.
  const canAck = isRecipient && e.status === 'open'
  const canResolve = isRecipient && e.status === 'acknowledged'
  const canClose = isRaiser && e.status === 'resolved'
  const canHigher = isRaiser && (e.status === 'resolved' || e.status === 'closed')

  return (
    <div style={{
      background: focused ? 'var(--accent-tint)' : 'var(--surface-1)',
      border: `1px solid ${focused ? 'var(--accent)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-m)', padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Chip status={e.severity} />
          <Chip status={e.status} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>{ago(e.created_at)}</span>
          {e.level > 1 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: 'var(--bad-deep)', background: 'var(--bad-bg)' }}>
              Level {e.level}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canAck && <Action onClick={() => onAck(e)} bg="var(--warn-bg)" fg="var(--warn)" bd="var(--warn-bg)">Acknowledge</Action>}
          {canResolve && <Action onClick={() => onResolve(e)} bg="var(--ok-bg)" fg="var(--ok-deep)" bd="var(--ok-bg)">Resolve…</Action>}
          {canClose && <Action onClick={() => onClose(e)} bg="var(--info-bg)" fg="var(--info)" bd="var(--info-bg)">Close</Action>}
          {canHigher && <Action onClick={() => onHigher(e)} bg="var(--bad-bg)" fg="var(--bad-deep)" bd="var(--bad-bg)">Escalate higher ↑</Action>}
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</div>
      {e.description && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>{e.description}</div>}

      {e.resolution_note && (
        <div style={{ marginTop: 10, background: 'var(--ok-bg)', border: '1px solid var(--ok-bg)', borderLeft: '3px solid var(--ok)', borderRadius: 'var(--radius-s)', padding: '9px 12px' }}>
          <div style={{ fontSize: 12, color: 'var(--ok-deep)', marginBottom: 3 }}>Resolution</div>
          <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{e.resolution_note}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0', fontSize: 12.5 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: 'var(--text-3)', background: 'var(--line-soft)' }}>{e.building?.code || '—'}</span>
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

      <RealChain e={e} people={people} />
    </div>
  )
}

// The chain drawn from the ACTUAL reporting line, walked upward from the person
// who raised it. It used to be a hardcoded Engineer/PM/Programme/PMO/CEO strip
// that matched nobody's real manager and showed the same five boxes to everyone.
function RealChain({ e, people }) {
  const chain = useMemo(() => {
    const by = new Map(people.map((p) => [p.id, p]))
    const out = []
    let cur = by.get(e.raised_by_id)
    const seen = new Set()
    while (cur && !seen.has(cur.id) && out.length < 8) {
      seen.add(cur.id); out.push(cur); cur = cur.manager_id ? by.get(cur.manager_id) : null
    }
    return out
  }, [people, e.raised_by_id])

  if (chain.length < 2) return null
  const settled = e.status === 'resolved' || e.status === 'closed'
  const at = Math.min(e.level || 1, chain.length - 1) // index of the current holder

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
      {chain.map((p, i) => {
        const passed = i < at || (settled && i === at)
        const isCur = !settled && i === at
        const bg = passed ? 'var(--ok)' : isCur ? 'var(--bad)' : 'var(--surface-1)'
        const bd = passed ? 'var(--ok)' : isCur ? 'var(--bad)' : 'var(--line)'
        const fg = passed ? 'var(--ok-deep)' : isCur ? 'var(--bad)' : 'var(--text-3)'
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} title={p.full_name}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--surface-1)', flex: 'none' }}>
                {passed && <Icon name="check" size={12} style={{ color: 'var(--surface-1)' }} />}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, color: fg, whiteSpace: 'nowrap' }}>
                {p.full_name?.split(' ')[0] || '—'}
              </span>
            </div>
            {i < chain.length - 1 && <span style={{ width: 26, height: 2, background: i < at ? 'var(--ok-bg)' : 'var(--line)', margin: '0 8px' }} />}
          </div>
        )
      })}
    </div>
  )
}

function Action({ onClick, bg, fg, bd, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 'var(--radius-s)',
      background: bg, color: fg, border: `1px solid ${bd}`, cursor: 'pointer',
    }}>{children}</button>
  )
}

// Resolving now costs a sentence. The old one-click wrote "Resolved via console"
// into every row, which told whoever raised it precisely nothing.
function ResolveModal({ e, onClose }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = note.trim().length >= 10

  const save = async () => {
    if (!valid) return
    setBusy(true)
    const { error } = await bgUpdate('escalations', e.id,
      { status: 'resolved', resolution_note: note.trim() },
      { okMsg: 'Escalation resolved' })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open title="Resolve escalation" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy || !valid}>{busy ? 'Saving…' : 'Resolve'}</Btn></>}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{e.title}</div>
      <Field label="What was done? (min 10 chars — this is permanent and cannot be edited later)">
        <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={note}
          onChange={(ev) => setNote(ev.target.value)} placeholder="The action taken, and by whom." />
      </Field>
    </Modal>
  )
}

function NewEscalation({ onClose, user, prefill }) {
  const { rows: buildings } = useLiveQuery('buildings', (q) => q.select('id,code,name,project_id').order('code'))
  const [title, setTitle] = useState(prefill ? `Blocked: ${prefill.title}` : '')
  const [description, setDescription] = useState(
    prefill ? `The task "${prefill.title}" is blocked and needs help from above.\n\n` : '')
  const [severity, setSeverity] = useState('medium')
  const [bid, setBid] = useState(prefill?.building_id || '')
  const [busy, setBusy] = useState(false)

  const valid = title.trim().length > 0 && description.trim().length >= 10
  const save = async () => {
    if (!valid) return
    setBusy(true)
    const b = buildings.find((x) => x.id === bid)
    // raised_to + level are derived by a DB trigger — do not set them.
    const { error } = await bgInsert('escalations', {
      title: title.trim(), description: description.trim(), severity,
      raised_by_id: user.id, building_id: bid || null,
      project_id: b?.project_id || prefill?.project_id || null,
      related_task_id: prefill?.id || null,
      status: 'open',
    }, { okMsg: 'Escalation raised' })
    setBusy(false)
    if (!error) onClose()
  }

  return (
    <Modal open title="Raise an escalation" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={busy || !valid}>{busy ? 'Saving…' : 'Raise'}</Btn></>}>
      {prefill && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bad-bg)', border: '1px solid var(--bad-bg)', color: 'var(--bad-deep)', borderRadius: 'var(--radius-s)', padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          <Icon name="tasks" size={14} />Linked to the blocked task “{prefill.title}”.
        </div>
      )}
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
