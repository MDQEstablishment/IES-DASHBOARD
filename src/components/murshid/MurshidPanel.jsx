import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../Icon'
import { useAuth } from '../../rbac'
import { bgInsert } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import MurshidAvatar from './MurshidAvatar'

// Murshid — the assistant panel, rebuilt as a conversation.
//
// WHAT THIS REPLACES. The 9L(1) panel was a help widget with a chat tab bolted
// on: four tabs (Ask / Knowledge Guide / FAQ / Feedback), a 219-line static
// corpus, and a separate feedback form. All of it is gone. The guide and the
// FAQ went stale the moment a screen changed and nobody was ever going to
// maintain two descriptions of the same product; the feedback form asked people
// to switch context to say "that answer was wrong" when the answer was right
// there on screen. What is left is the thing people actually came for.
//
// ENGLISH, AND THE NAME IS "Murshid". The whole subtree is LTR now — no
// dir="rtl", no Arabic — which puts the panel in step with every other screen
// and satisfies the standing constraint without an exception.
//
// THE COMPOSER IS LIVE WITH THE FLAG OFF, DELIBERATELY. `murshid_enabled` is
// false and stays false. Typing still works, the message still lands, the send
// still calls the Edge Function, and the refusal comes back and renders as an
// ordinary assistant bubble. Every send fails, and that is the point: it proves
// the wiring end to end before the flag is ever flipped. Greying the box out
// would prove nothing and would hide the one path that most needs review.
//
// NOTHING BILLABLE HAPPENS ON A DISABLED SEND. index.ts returns on the flag
// (line 84) BEFORE the model is chosen (line 88) and long before the fetch to
// the model API (line 140), and `logRun` is not called on that return, so no
// ai_runs row is written either. The only work is one ai_settings read.
//
// THE CLIENT IS THE RENDERER OF REFUSAL TEXT. The function returns a `kind`;
// this file owns the words. core.ts carries its own copy of each message as a
// second layer for any caller that does not render its own — as of PLAN v4 D3
// those strings are English too, but they are still not what a user sees here.
//
// SHAPE (PLAN v4 D1). This is a FULL-HEIGHT SIDE PANEL, not a popover. It was
// `min(390px, 100vw-32px)` by `min(620px, 100vh-130px)`, fixed on both axes,
// and a conversation whose history cannot be read is not a conversation. It is
// now pinned to the right edge top to bottom, user-resizable by the drag handle
// on its left edge with the width persisted to localStorage and clamped, and it
// has an expand control for a wide reading mode. The thread scrolls internally;
// the identity strip and the composer stay pinned. Below NARROW_PX the panel
// goes full-bleed and the handle is withdrawn — there is nothing to drag when
// the panel is already the width of the screen.

// The categories murshid_feedback's CHECK accepts after 0127. This list must
// match that constraint exactly — widening one without the other is a failed
// insert at the worst possible moment, in front of the person giving feedback.
const CATEGORIES = ['suggestion', 'problem', 'question', 'helpful', 'not_helpful']
const HELPFUL = CATEGORIES[3]
const NOT_HELPFUL = CATEGORIES[4]

// murshid_feedback.reply_to is bounded 1..4000 by 0127. Clip here rather than
// let a long answer turn a thumb into a constraint violation.
const REPLY_TO_MAX = 4000
// murshid_messages.content is bounded 1..8000 by 0128.
const CONTENT_MAX = 8000
const TITLE_MAX = 60

const GREETING = "Hello! I'm Murshid. How can I help you today?"

// Every refusal the function can return, in English, written as a STATE rather
// than a failure. A refusal is a decision the system made on purpose; it should
// not read like something broke.
const REFUSALS = {
  disabled: "Murshid isn't switched on yet. Once it's enabled, answers will appear right here.",
  cap: "Murshid has reached its budget for this month. It will pick up again at the start of next month.",
  platform_meta: "That one's outside what I cover — what the platform cost to build is commercial information. Ask me about your projects, tasks and documents instead.",
  tech_stack: "I don't cover how the platform is built. I'm here to help you use it and read your own data.",
  personnel_judgement: "I don't give opinions on people or their performance. I can show you what the tasks and escalations record.",
  beyond_rls: "I can only show what your own access allows, and that's outside it. Wider access is a request to the PMO.",
  prompt_injection: "I can't follow instructions that try to change my role. Ask me about your data and I'll help.",
}
const REFUSAL_FALLBACK = "Murshid can't answer that one. Try asking about your projects, tasks or documents."
const UNREACHABLE = "I couldn't reach Murshid just now. Your message is saved — try sending it again in a moment."

// Latin digits under any OS locale, same rule as fmtClock in lib/format.
const clock = (d) => {
  const t = d instanceof Date ? d : new Date(d)
  if (isNaN(t)) return ''
  const p = (x) => String(x).padStart(2, '0')
  return `${p(t.getHours())}:${p(t.getMinutes())}`
}

let seq = 0
const nextKey = () => `m${++seq}`

// ---- panel geometry (D1) ---------------------------------------------------
// MIN_W is the narrowest width at which the composer, the identity strip and a
// message bubble all still read; MAX_W is where a chat column stops being a
// chat column. WIDE_W is the expand target. The stored value is clamped on
// every read, so a hand-edited or stale localStorage entry can never produce an
// unusable panel.
const MIN_W = 340
const MAX_W = 900
const DEFAULT_W = 420
const WIDE_W = 720
const NARROW_PX = 640          // at or below this the panel is full-bleed
const WIDTH_KEY = 'ies.murshid.panelWidth'
const STEP = 24                // keyboard resize increment

const viewportCap = () => (typeof window === 'undefined' ? MAX_W : Math.max(MIN_W, window.innerWidth - 24))
const clampWidth = (w) => Math.min(Math.max(Number(w) || DEFAULT_W, MIN_W), Math.min(MAX_W, viewportCap()))

const readWidth = () => {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY)
    return clampWidth(raw == null ? DEFAULT_W : parseInt(raw, 10))
  } catch {
    return DEFAULT_W
  }
}
const writeWidth = (w) => {
  try { window.localStorage.setItem(WIDTH_KEY, String(Math.round(w))) } catch { /* private mode */ }
}
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth <= NARROW_PX

// The action row under an assistant reply. Present on REPLIES ONLY — not on the
// user's own messages, not on the opening greeting, and not on a refusal, which
// is not a reply and is not rateable.
function ReplyActions({ text, reacted, onCopy, onReact }) {
  const spent = !!reacted
  const btn = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 'var(--radius-s)',
    color: active ? 'var(--accent)' : spent ? 'var(--text-faint)' : 'var(--text-3)',
    cursor: spent ? 'default' : 'pointer',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
      <button onClick={onCopy} title="Copy" aria-label="Copy this answer"
        className="ies-hover" style={btn(false)}>
        <Icon name="copy" size={14} />
      </button>
      <button
        onClick={() => onReact(HELPFUL)} disabled={spent}
        title={spent ? 'Already sent' : 'Helpful'} aria-label="Mark this answer helpful"
        aria-pressed={reacted === HELPFUL}
        className={spent ? undefined : 'ies-hover'} style={btn(reacted === HELPFUL)}>
        <Icon name="thumbup" size={14} />
      </button>
      <button
        onClick={() => onReact(NOT_HELPFUL)} disabled={spent}
        title={spent ? 'Already sent' : 'Not helpful'} aria-label="Mark this answer not helpful"
        aria-pressed={reacted === NOT_HELPFUL}
        className={spent ? undefined : 'ies-hover'} style={btn(reacted === NOT_HELPFUL)}>
        <Icon name="thumbdown" size={14} />
      </button>
    </div>
  )
}

export default function MurshidPanel({ screen, onClose }) {
  const { user } = useAuth()
  // The drill-in ids the allow-list needs to scope a project/building question.
  // Read from the route rather than passed down, same principle as the screen.
  const { id: projectId, bid: buildingId } = useParams()

  const [draft, setDraft] = useState('')
  const [thread, setThread] = useState([])
  const [convId, setConvId] = useState(null)
  const [asking, setAsking] = useState(false)
  const [openedAt] = useState(() => new Date())
  const threadRef = useRef(null)

  // ---- D1: width, resize, expand -----------------------------------------
  const [width, setWidth] = useState(readWidth)
  const [narrow, setNarrow] = useState(isNarrow)
  const [expanded, setExpanded] = useState(false)
  const restoreTo = useRef(null)      // the width to come back to from wide mode
  const drag = useRef(null)

  // The viewport is a hard bound on the panel: a stored 900 on a 1024 laptop is
  // fine, the same 900 on a 700px window is not. Re-clamp on every resize so
  // the panel can never be wider than the screen it is drawn on.
  useEffect(() => {
    const onResize = () => {
      setNarrow(isNarrow())
      setWidth((w) => clampWidth(w))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const applyWidth = useCallback((next, persist = true) => {
    const w = clampWidth(next)
    setWidth(w)
    if (persist) writeWidth(w)
    return w
  }, [])

  // Drag on the LEFT edge: moving left widens, so the delta is startX - clientX.
  // Pointer capture means the drag survives the cursor leaving the 8px handle,
  // which is the whole difference between a resize that works and one that
  // drops the moment you move quickly.
  const onHandleDown = (e) => {
    if (narrow) return
    drag.current = { x: e.clientX, w: width }
    setExpanded(false)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older browsers */ }
    e.preventDefault()
  }
  const onHandleMove = (e) => {
    if (!drag.current) return
    applyWidth(drag.current.w + (drag.current.x - e.clientX), false)
  }
  const onHandleUp = (e) => {
    if (!drag.current) return
    drag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no capture */ }
    writeWidth(width)
  }
  // Keyboard is not a courtesy here: a drag handle that only answers a mouse is
  // a control some people cannot use at all.
  const onHandleKey = (e) => {
    if (e.key === 'ArrowLeft') { applyWidth(width + STEP); setExpanded(false) }
    else if (e.key === 'ArrowRight') { applyWidth(width - STEP); setExpanded(false) }
    else if (e.key === 'Home') { applyWidth(MIN_W); setExpanded(false) }
    else if (e.key === 'End') { applyWidth(MAX_W); setExpanded(false) }
    else return
    e.preventDefault()
  }

  const toggleExpand = () => {
    if (expanded) {
      applyWidth(restoreTo.current ?? DEFAULT_W)
      setExpanded(false)
    } else {
      restoreTo.current = width
      applyWidth(WIDE_W)
      setExpanded(true)
    }
  }

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [thread, asking])

  // RESUME THE MOST RECENT THREAD. The owner's mental model is ChatGPT and
  // Claude, and those resume. There is deliberately NO thread list: a list is
  // navigation sitting above the conversation, which is exactly the shape this
  // redesign removed. One "New conversation" action, and nothing else.
  //
  // The query is not filtered by user_id here and does not need to be. RLS on
  // murshid_conversations returns only rows the caller owns, so scoping in the
  // client would be a second, weaker copy of a rule the database already
  // enforces — and the kind of copy that quietly becomes the only one.
  useEffect(() => {
    let live = true
    if (!user?.id) return undefined
    ;(async () => {
      const { data: convs } = await supabase
        .from('murshid_conversations').select('id')
        .order('updated_at', { ascending: false }).limit(1)
      const id = convs?.[0]?.id
      if (!live || !id) return
      const { data: msgs } = await supabase
        .from('murshid_messages').select('id,role,content,created_at')
        .eq('conversation_id', id).order('created_at', { ascending: true }).limit(200)
      if (!live) return
      setConvId(id)
      setThread((msgs || []).map((m) => ({
        key: nextKey(), role: m.role, text: m.content, at: new Date(m.created_at),
        // A resumed assistant turn is a genuine reply — refusals were never
        // stored, so anything on this table with role 'assistant' is rateable.
        kind: m.role === 'assistant' ? 'reply' : 'user',
      })))
    })()
    return () => { live = false }
  }, [user?.id])

  const startNew = () => {
    setConvId(null)
    setThread([])
    setDraft('')
  }

  // Persist one turn. Returns the conversation id so the caller can keep using
  // it, because setState is not read back inside the same tick.
  const persist = useCallback(async (role, text, existingId, title) => {
    if (!user?.id) return existingId
    let id = existingId
    if (!id) {
      const { data, error } = await supabase
        .from('murshid_conversations')
        .insert({ user_id: user.id, title: title || null }).select('id').single()
      if (error || !data) return null
      id = data.id
      setConvId(id)
    }
    await supabase.from('murshid_messages')
      .insert({ conversation_id: id, role, content: String(text).slice(0, CONTENT_MAX) })
    return id
  }, [user?.id])

  const ask = async () => {
    const question = draft.trim()
    if (!question || asking) return
    setDraft('')
    const at = new Date()
    setThread((t) => [...t, { key: nextKey(), role: 'user', text: question, at, kind: 'user' }])
    setAsking(true)

    // The title is the first user message, trimmed, set once and never
    // regenerated. No model call, so it is produced identically with the flag
    // off. It has no UI surface today — there is no list to show it in — and is
    // stored so that adding one later needs no migration.
    const title = thread.some((m) => m.role === 'user')
      ? null
      : question.slice(0, TITLE_MAX)
    const id = await persist('user', question, convId, title)

    let reply
    try {
      const { data, error } = await supabase.functions.invoke('murshid-chat', {
        body: {
          screen,
          question,
          params: { project_id: projectId || '', building_id: buildingId || '' },
        },
      })
      if (error) reply = { text: UNREACHABLE, kind: 'state' }
      else if (data?.refused) reply = { text: REFUSALS[data.kind] || REFUSAL_FALLBACK, kind: 'state' }
      else if (data?.answer) reply = { text: data.answer, kind: 'reply' }
      else reply = { text: UNREACHABLE, kind: 'state' }
    } catch {
      reply = { text: UNREACHABLE, kind: 'state' }
    }

    setThread((t) => [...t, { key: nextKey(), role: 'assistant', text: reply.text, at: new Date(), kind: reply.kind }])
    setAsking(false)

    // ONLY A GENUINE REPLY IS STORED. A refusal is not a reply — it is the
    // system declining — and an unreachable server produced nothing at all.
    // Neither belongs in a record of what was said, and neither is rateable.
    // While the flag is false, history therefore holds the user's side only.
    // That is correct, not a gap.
    // `id` is null only if the conversation insert itself failed. Persisting
    // the reply then would silently open a SECOND thread holding half the
    // exchange, which is worse than not storing it.
    if (reply.kind === 'reply' && id) await persist('assistant', reply.text, id, null)
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied')
    } catch {
      toast("Couldn't copy — your browser blocked clipboard access", 'err')
    }
  }

  // A reaction is WRITE-ONCE. 0128 left murshid_feedback with no update and no
  // delete policy, so there is no way to change or withdraw one after the fact.
  // Rather than leave both thumbs looking live and let the second click fail
  // silently, the pair goes inert the moment one lands. The UI says what the
  // database means.
  const react = async (m, category) => {
    if (!user?.id || m.reacted) return
    setThread((t) => t.map((x) => (x.key === m.key ? { ...x, reacted: category } : x)))
    const { error } = await bgInsert('murshid_feedback', {
      user_id: user.id,
      screen: screen || null,
      category,
      message: null,
      reply_to: m.text.slice(0, REPLY_TO_MAX),
    }, { okMsg: category === HELPFUL ? 'Thanks — noted' : 'Noted — thanks for saying' })
    if (error) setThread((t) => t.map((x) => (x.key === m.key ? { ...x, reacted: null } : x)))
  }

  const canSend = !!draft.trim() && !asking

  // The greeting is not a header block and is not stored. It is rendered as the
  // first assistant bubble so the panel opens looking like a conversation
  // already under way rather than an empty form — and because it was never
  // said by the assistant, it carries no action row.
  const bubbles = [
    { key: 'greeting', role: 'assistant', text: GREETING, at: openedAt, kind: 'greeting' },
    ...thread,
  ]

  return (
    <div
      role="complementary" aria-label="Murshid"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: narrow ? '100vw' : width, maxWidth: '100vw',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-1)', borderLeft: narrow ? 'none' : '1px solid var(--line)',
        boxShadow: 'var(--shadow-2)', overflow: 'hidden',
        fontSize: 13.5, lineHeight: 1.6,
      }}>
      {/* ---- the resize handle, on the left edge ---------------------------
          Withdrawn below NARROW_PX, where the panel is already the full width
          of the screen and there is nothing left to drag it to. */}
      {!narrow && (
        <div
          onPointerDown={onHandleDown} onPointerMove={onHandleMove}
          onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          role="separator" aria-orientation="vertical" tabIndex={0}
          aria-label="Resize Murshid" aria-valuenow={Math.round(width)}
          aria-valuemin={MIN_W} aria-valuemax={MAX_W}
          title="Drag to resize — or use the arrow keys"
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, zIndex: 2,
            cursor: 'col-resize', touchAction: 'none', background: 'transparent',
          }}>
          <span style={{
            position: 'absolute', left: 3, top: '50%', width: 2, height: 34,
            marginTop: -17, borderRadius: 2, background: 'var(--line-ctrl)',
          }} />
        </div>
      )}

      {/* ---- identity strip: who this is, and that it is listening --------
          Nothing navigational and nothing tabbed. Name, state, one line of
          scope, and the two actions that are not part of the conversation. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 11, flex: 'none',
        padding: '14px 14px 12px', borderBottom: '1px solid var(--line)',
      }}>
        <MurshidAvatar size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Murshid</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live)', flex: 'none' }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Online</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.5 }}>
            Your AI assistant for energy &amp; water efficiency
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, flex: 'none' }}>
          {!narrow && (
            <button onClick={toggleExpand}
              title={expanded ? 'Narrow the panel' : 'Widen the panel'}
              aria-label={expanded ? 'Narrow the Murshid panel' : 'Widen the Murshid panel'}
              aria-pressed={expanded}
              className="ies-hover" style={{
                width: 28, height: 28, borderRadius: 'var(--radius-s)', color: 'var(--text-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name={expanded ? 'chevronr' : 'chevronl'} size={16} /></button>
          )}
          <button onClick={startNew} title="New conversation" aria-label="Start a new conversation"
            className="ies-hover" style={{
              width: 28, height: 28, borderRadius: 'var(--radius-s)', color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="plus" size={16} /></button>
          <button onClick={onClose} title="Close" aria-label="Close Murshid"
            className="ies-hover" style={{
              width: 28, height: 28, borderRadius: 'var(--radius-s)', color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="x" size={16} /></button>
        </div>
      </div>

      {/* ---- the conversation --------------------------------------------- */}
      <div ref={threadRef} style={{
        flex: 1, overflowY: 'auto', padding: '14px 14px 6px',
        display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface-1)',
      }}>
        {bubbles.map((m) => (m.role === 'user' ? (
          <div key={m.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{
              maxWidth: '82%', padding: '9px 12px', borderRadius: 'var(--radius-m)',
              borderBottomRightRadius: 4, background: 'var(--accent-tint)', color: 'var(--text)',
              fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{m.text}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4, marginRight: 2 }}>{clock(m.at)}</div>
          </div>
        ) : (
          <div key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <MurshidAvatar size={26} style={{ marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                display: 'inline-block', maxWidth: '100%', padding: '9px 12px',
                borderRadius: 'var(--radius-m)', borderTopLeftRadius: 4,
                background: 'var(--raised)', border: '1px solid var(--line-soft)',
                color: m.kind === 'state' ? 'var(--text-2)' : 'var(--text)',
                fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{m.text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-faint)', marginLeft: 2 }}>{clock(m.at)}</span>
                {m.kind === 'reply' && (
                  <ReplyActions
                    text={m.text} reacted={m.reacted}
                    onCopy={() => copy(m.text)}
                    onReact={(c) => react(m, c)} />
                )}
              </div>
            </div>
          </div>
        )))}
        {asking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MurshidAvatar size={26} />
            <span style={{ fontSize: 12, color: 'var(--text-3)', animation: 'iesBlink 1.2s ease-in-out infinite' }}>
              Murshid is thinking…
            </span>
          </div>
        )}
      </div>

      {/* ---- composer ------------------------------------------------------ */}
      <div style={{
        flex: 'none', padding: 12, borderTop: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask() }}
          maxLength={1000} placeholder="Ask Murshid a question…"
          aria-label="Ask Murshid a question"
          style={{
            flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 999,
            border: '1px solid var(--line-ctrl)', background: 'var(--surface-1)',
            color: 'var(--text)', fontSize: 13, outline: 'none',
          }} />
        <button onClick={ask} disabled={!canSend} title="Send" aria-label="Send"
          style={{
            width: 38, height: 38, borderRadius: '50%', flex: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: canSend ? 'var(--accent)' : 'var(--track)',
            color: canSend ? 'var(--surface-1)' : 'var(--text-3)',
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}><Icon name="send" size={16} /></button>
      </div>
    </div>
  )
}
