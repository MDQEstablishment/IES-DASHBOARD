import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useLiveQuery, bgInsert, bgUpdate } from '../lib/db'
import { Avatar } from './ui'
import { ago } from '../lib/format'

// Sprint 8L — per-building Chat (flat thread). Realtime via useLiveQuery + a 15s
// poll fallback while mounted. Own messages align right; authors can edit their
// own message for 15 minutes (soft-delete stays available after). Reads/writes
// public.building_chat_messages (RLS in 0069).
const EDIT_WINDOW_MS = 15 * 60 * 1000

export default function BuildingChat({ buildingId, user }) {
  const { rows: msgs, refetch } = useLiveQuery('building_chat_messages', (q) =>
    q.select('*,author:profiles!building_chat_messages_user_id_fkey(full_name)')
      .eq('building_id', buildingId).is('deleted_at', null).order('created_at', { ascending: true }), [buildingId])

  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const listRef = useRef(null)
  const taRef = useRef(null)

  // 15s poll while mounted (belt-and-suspenders over realtime)
  useEffect(() => { const t = setInterval(() => refetch?.(), 15000); return () => clearInterval(t) }, [refetch])
  // keep scrolled to the latest message
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [msgs.length])
  // auto-grow composer up to ~4 lines
  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 96) + 'px' }

  const send = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    const { error } = await bgInsert('building_chat_messages', { building_id: buildingId, user_id: user.id, body: text })
    setBusy(false)
    if (!error) { setBody(''); if (taRef.current) taRef.current.style.height = 'auto'; refetch?.() }
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
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        <MessageSquare size={15} /> Chat
      </div>

      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
        {msgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '26px 8px' }}>
            <MessageSquare size={22} color="#CBD5E1" />
            <div style={{ fontSize: 12.5, marginTop: 6 }}>No messages yet — start the conversation</div>
          </div>
        ) : msgs.map((m) => {
          const mine = m.user_id === user.id
          const name = m.author?.full_name || 'User'
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
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ width: '100%', minHeight: 48, border: '1px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditId(null)} style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>Cancel</button>
                      <button onClick={() => saveEdit(m)} style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 700 }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.45, background: mine ? '#EFF6FF' : '#F8FAFC', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>
                    {m.body}
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
        <textarea ref={taRef} value={body} lang="en"
          onChange={(e) => { setBody(e.target.value); grow(e.target) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
          rows={1}
          style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 96, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, lineHeight: 1.4 }} />
        <button onClick={send} disabled={!body.trim() || busy}
          style={{ padding: '9px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12.5, border: 'none', cursor: body.trim() && !busy ? 'pointer' : 'default', opacity: body.trim() && !busy ? 1 : 0.5 }}>Send</button>
      </div>
    </div>
  )
}
