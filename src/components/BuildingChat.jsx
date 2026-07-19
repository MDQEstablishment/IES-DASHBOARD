import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { Avatar } from './ui'
import { ago } from '../lib/format'
import { roleColor, roleTitle } from '../lib/constants'

// Sprint 8L — per-building Chat (flat thread). Realtime via useLiveQuery + a 15s
// poll fallback. 8W adds @mentions: type "@", pick a user from the autocomplete;
// on send the mentioned users' ids ride along on the message row (mentions uuid[]),
// and a SECURITY DEFINER trigger (0088) fans out bell notifications. Mentions are
// stored as plain "@Full Name" text and highlighted on render.
const EDIT_WINDOW_MS = 15 * 60 * 1000
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Render a message body, highlighting each "@Full Name" that maps to a real
// mentioned user on this message.
function renderBody(body, names) {
  if (!names.length) return body
  const re = new RegExp('@(' + names.map(esc).sort((a, b) => b.length - a.length).join('|') + ')', 'g')
  const out = []
  let last = 0, m
  while ((m = re.exec(body))) {
    if (m.index > last) out.push(body.slice(last, m.index))
    out.push(<span key={m.index} style={{ color: 'var(--accent)', fontWeight: 700 }}>{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last < body.length) out.push(body.slice(last))
  return out
}

export default function BuildingChat({ buildingId, user }) {
  const { rows: msgs, refetch } = useLiveQuery('building_chat_messages', (q) =>
    q.select('*,author:profiles!building_chat_messages_user_id_fkey(full_name)')
      .eq('building_id', buildingId).is('deleted_at', null).order('created_at', { ascending: true }), [buildingId])
  // mentionable users (RLS: profiles readable by any authenticated user)
  const { rows: people } = useLiveQuery('profiles', (q) => q.select('id,full_name,role').eq('archived', false).order('full_name'))
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.full_name]))

  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [pending, setPending] = useState({})       // id -> full_name selected while composing
  const [mention, setMention] = useState(null)      // { at, query, index } while the autocomplete is open
  const listRef = useRef(null)
  const taRef = useRef(null)
  const filteredRef = useRef([])

  useEffect(() => { const t = setInterval(() => refetch?.(), 15000); return () => clearInterval(t) }, [refetch])
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [msgs.length])
  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 96) + 'px' }

  // autocomplete detection on every composer change (caret-aware)
  const onBodyChange = (e) => {
    const el = e.target
    setBody(el.value); grow(el)
    const upto = el.value.slice(0, el.selectionStart)
    const m = /(?:^|\s)@([\w .-]*)$/.exec(upto)
    if (m) {
      const query = m[1]
      const matches = people.filter((p) => p.full_name.toLowerCase().includes(query.trim().toLowerCase()))
      if (matches.length) { setMention({ at: el.selectionStart - query.length - 1, query, index: 0 }); return }
    }
    setMention(null)
  }

  const filtered = mention
    ? people.filter((p) => p.full_name.toLowerCase().includes(mention.query.trim().toLowerCase())).slice(0, 5)
    : []
  filteredRef.current = filtered

  const pickMention = (p) => {
    if (!p || !taRef.current || !mention) return
    const el = taRef.current
    const caret = el.selectionStart
    const next = body.slice(0, mention.at) + '@' + p.full_name + ' ' + body.slice(caret)
    setBody(next)
    setPending((prev) => ({ ...prev, [p.id]: p.full_name }))
    setMention(null)
    requestAnimationFrame(() => {
      el.focus()
      const pos = mention.at + p.full_name.length + 2
      el.setSelectionRange(pos, pos); grow(el)
    })
  }

  const onKeyDown = (e) => {
    if (mention && filteredRef.current.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => ({ ...m, index: (m.index + 1) % filteredRef.current.length })); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => ({ ...m, index: (m.index - 1 + filteredRef.current.length) % filteredRef.current.length })); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filteredRef.current[mention.index]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const send = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    // keep only mentions whose "@Full Name" survived in the final text
    const mentions = Object.entries(pending).filter(([, name]) => text.includes('@' + name)).map(([id]) => id)
    const { error } = await bgInsert('building_chat_messages', { building_id: buildingId, user_id: user.id, body: text, mentions })
    setBusy(false)
    if (!error) { setBody(''); setPending({}); setMention(null); if (taRef.current) taRef.current.style.height = 'auto'; refetch?.() }
  }
  const saveEdit = async (m) => {
    const text = editBody.trim()
    if (!text) return
    await bgUpdate('building_chat_messages', m.id, { body: text, edited_at: new Date().toISOString() }, { okMsg: 'Message edited' })
    setEditId(null); setEditBody(''); refetch?.()
  }
  const softDelete = async (m) => { await bgUpdate('building_chat_messages', m.id, { deleted_at: new Date().toISOString() }, { okMsg: 'Message removed' }); refetch?.() }
  const canEdit = (m) => m.user_id === user.id && (Date.now() - new Date(m.created_at).getTime()) < EDIT_WINDOW_MS

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        <MessageSquare size={15} /> Chat
      </div>

      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
        {msgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '26px 8px' }}>
            <MessageSquare size={22} color="#C9C3B4" />
            <div style={{ fontSize: 12.5, marginTop: 6 }}>No messages yet — start the conversation</div>
          </div>
        ) : msgs.map((m) => {
          const mine = m.user_id === user.id
          const name = m.author?.full_name || 'User'
          const mNames = (m.mentions || []).map((id) => nameById[id]).filter(Boolean)
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
              <Avatar name={name} size={24} />
              <div style={{ minWidth: 0, maxWidth: '82%' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', justifyContent: mine ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 11.5 }}>{mine ? 'You' : name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>{ago(m.created_at)}{m.edited_at ? ' · (edited)' : ''}</span>
                </div>
                {editId === m.id ? (
                  <div style={{ marginTop: 4 }}>
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ width: '100%', minHeight: 48, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 9px', fontSize: 12.5, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditId(null)} style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>Cancel</button>
                      <button onClick={() => saveEdit(m)} style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 700 }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.45, background: mine ? '#F5EEDF' : '#FAF8F2', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>
                    {renderBody(m.body, mNames)}
                  </div>
                )}
                {mine && editId !== m.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, justifyContent: 'flex-end' }}>
                    {canEdit(m) && <button onClick={() => { setEditId(m.id); setEditBody(m.body) }} style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>Edit</button>}
                    <button onClick={() => softDelete(m)} style={{ fontSize: 10.5, color: 'var(--bad)', fontWeight: 600 }}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {mention && filtered.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 10px 28px rgba(16,26,36,.14)', overflow: 'hidden', zIndex: 40 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '1px', color: 'var(--text-3)', padding: '6px 10px 4px' }}>MENTION</div>
              {filtered.map((p, i) => (
                <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(p) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', textAlign: 'left', background: i === mention.index ? '#F5EEDF' : 'transparent', cursor: 'pointer' }}>
                  <Avatar name={p.full_name} color={roleColor(p.role)} size={22} />
                  <span style={{ lineHeight: 1.2 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 12.5 }}>{p.full_name}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)' }}>{roleTitle(p.role)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <textarea ref={taRef} value={body} lang="en"
            onChange={onBodyChange}
            onKeyDown={onKeyDown}
            placeholder="Write a message…  @ to mention  ·  Enter to send, Shift+Enter for a new line"
            rows={1}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'none', minHeight: 38, maxHeight: 96, border: '1px solid var(--line)', borderRadius: 6, padding: '9px 11px', fontSize: 12.5, lineHeight: 1.4 }} />
        </div>
        <button onClick={send} disabled={!body.trim() || busy}
          style={{ padding: '9px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12.5, border: 'none', cursor: body.trim() && !busy ? 'pointer' : 'default', opacity: body.trim() && !busy ? 1 : 0.5 }}>Send</button>
      </div>
    </div>
  )
}
