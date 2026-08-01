import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../Icon'
import { useAuth } from '../../rbac'
import { bgInsert } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { helpForScreen, FIELD_GUIDES, FAQ } from './helpContent'

// مُرشد — the assistant panel. Sprint 9L(1): static content only.
//
// RTL is scoped to this panel with dir="rtl"; the rest of the platform stays
// LTR. Arabic falls through to the system Arabic face — the self-hosted Inter
// from 9J carries a Latin subset only, which is the same behaviour as every
// other Arabic string in the app.
//
// The chat tab is present but inert until 9L(3), and stays behind the
// `murshid_enabled` setting after that. Showing it now (disabled, labelled)
// rather than hiding it is deliberate: the panel's shape does not change under
// the user when the feature turns on.

const TABS = [
  ['ask', 'اسأل مُرشد'],
  ['guide', 'دليل المعرفة'],
  ['faq', 'الأسئلة الشائعة'],
  ['feedback', 'ملاحظات'],
]

// The three the table's CHECK constraint accepts — kept in step with 0119 by
// the harness, so widening one without the other fails a gate.
const CATEGORIES = ['اقتراح', 'مشكلة', 'استفسار']

const card = {
  background: 'var(--surface-1)', borderRadius: 'var(--radius-l)',
  boxShadow: 'var(--shadow-2)', overflow: 'hidden',
}

export default function MurshidPanel({ screen, onClose }) {
  const { user } = useAuth()
  // The drill-in ids the allow-list needs to scope a project/building question.
  // Read from the route rather than passed down, same principle as the screen.
  const { id: projectId, bid: buildingId } = useParams()
  const [tab, setTab] = useState('ask')
  const [draft, setDraft] = useState('')
  // 9L(3): session memory only — nothing is persisted. Stored questions and
  // answers would be a new sensitive surface nobody asked for; adding retention
  // is a decision with its own RLS, not a default. Closing the panel keeps the
  // thread; a reload clears it.
  const [thread, setThread] = useState([])
  const [asking, setAsking] = useState(false)
  const threadRef = useRef(null)

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [thread, asking])

  const ask = async (text) => {
    const question = String(text ?? draft).trim()
    if (!question || asking) return
    setDraft('')
    setThread((t) => [...t, { role: 'user', text: question }])
    setAsking(true)
    try {
      const { data, error } = await supabase.functions.invoke('murshid-chat', {
        body: {
          screen,
          question,
          params: { project_id: projectId || '', building_id: buildingId || '' },
        },
      })
      const answer = error
        ? 'تعذّر الوصول إلى المساعد الآن. حاول مرة أخرى بعد قليل.'
        : (data?.answer || 'لم تصل إجابة.')
      setThread((t) => [...t, { role: 'murshid', text: answer, refused: !!data?.refused }])
    } catch {
      setThread((t) => [...t, { role: 'murshid', text: 'تعذّر الوصول إلى المساعد الآن.', refused: false }])
    } finally { setAsking(false) }
  }
  const [openGuide, setOpenGuide] = useState(null)
  const [openFaq, setOpenFaq] = useState(null)
  const [fbCat, setFbCat] = useState(CATEGORIES[0])
  const [fbMsg, setFbMsg] = useState('')
  const [fbBusy, setFbBusy] = useState(false)
  const [fbSent, setFbSent] = useState(false)
  const help = helpForScreen(screen)

  // The screen is captured with the message — "the table is confusing" is
  // unactionable; "the table on Doc Tracker is confusing" is a ticket.
  const sendFeedback = async () => {
    const message = fbMsg.trim()
    if (!message || !user?.id) return
    setFbBusy(true)
    const { error } = await bgInsert('murshid_feedback',
      { user_id: user.id, screen: screen || null, category: fbCat, message },
      { okMsg: 'وصلت ملاحظتك — شكراً لك' })
    setFbBusy(false)
    if (!error) { setFbMsg(''); setFbSent(true) }
  }

  return (
    <div dir="rtl" lang="ar" style={{
      ...card, width: 'min(390px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column',
      maxHeight: 'min(620px, calc(100vh - 130px))', fontSize: 13.5, lineHeight: 1.7,
    }}>
      {/* greeting header */}
      <div style={{ background: 'var(--accent)', color: 'var(--surface-1)', padding: '14px 16px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>مرحباً، أنا مُرشد</div>
            <div style={{ opacity: 0.9, fontSize: 12.5, marginTop: 2 }}>كيف أقدر أساعدك؟</div>
          </div>
          <button onClick={onClose} title="إغلاق" style={{
            width: 28, height: 28, borderRadius: 'var(--radius-s)', flex: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--surface-1)',
          }}><Icon name="x" size={16} /></button>
        </div>
        {screen && (
          <div style={{ marginTop: 8, fontSize: 11.5, opacity: 0.9 }}>
            أنت الآن في: <span dir="ltr" style={{ fontWeight: 600 }}>{screen}</span>
          </div>
        )}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '10px 6px', fontSize: 12.5, fontWeight: 600,
            color: tab === k ? 'var(--accent)' : 'var(--text-3)',
            borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', padding: 16, flex: 1 }}>
        {tab === 'ask' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ask() }}
                disabled={asking} maxLength={1000}
                placeholder="اكتب سؤالك…"
                style={{
                  flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 'var(--radius-s)',
                  border: '1px solid var(--line-ctrl)', background: 'var(--surface-1)',
                  color: 'var(--text)', fontSize: 13,
                }} />
              <button onClick={() => ask()} disabled={asking || !draft.trim()} style={{
                padding: '9px 14px', borderRadius: 'var(--radius-s)', fontWeight: 600, fontSize: 13,
                background: draft.trim() && !asking ? 'var(--accent)' : 'var(--track)',
                color: draft.trim() && !asking ? 'var(--surface-1)' : 'var(--text-3)',
                cursor: draft.trim() && !asking ? 'pointer' : 'not-allowed',
              }}>{asking ? '…' : 'إرسال'}</button>
            </div>

            {thread.length > 0 && (
              <div ref={threadRef} style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {thread.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-start' : 'stretch',
                    maxWidth: m.role === 'user' ? '85%' : '100%',
                    padding: '8px 11px', borderRadius: 'var(--radius-s)', fontSize: 12.5, lineHeight: 1.75,
                    whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? 'var(--accent-tint)' : m.refused ? 'var(--warn-bg)' : 'var(--raised)',
                    color: m.refused ? 'var(--warn-deep)' : 'var(--text)',
                  }}>{m.text}</div>
                ))}
                {asking && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>يفكّر مُرشد…</div>}
              </div>
            )}

            {help ? (
              <>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{help.title}</div>
                <div style={{ color: 'var(--text-2)', marginBottom: 12 }}>{help.intro}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 7 }}>أسئلة سريعة</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {help.actions.map((a) => (
                    <button key={a} onClick={() => ask(a)} className="ies-hover" style={{
                      textAlign: 'right', padding: '8px 11px', borderRadius: 'var(--radius-s)',
                      border: '1px solid var(--line)', background: 'var(--surface-1)',
                      color: 'var(--text)', fontSize: 12.5, lineHeight: 1.6,
                    }}>{a}</button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)' }}>لا يوجد دليل مخصص لهذه الشاشة بعد.</div>
            )}
          </>
        )}

        {tab === 'guide' && (
          <>
            {help && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{help.title}</div>
                <div style={{ color: 'var(--text-2)', marginBottom: 10 }}>{help.intro}</div>
                <ul style={{ margin: 0, paddingRight: 18, color: 'var(--text-2)' }}>
                  {help.steps.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
                </ul>
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', margin: '4px 0 8px' }}>أدلة الأدوات الميدانية</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FIELD_GUIDES.map((g) => (
                <div key={g.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', overflow: 'hidden' }}>
                  <button onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)} className="ies-hover" style={{
                    width: '100%', textAlign: 'right', padding: '9px 12px', background: 'var(--surface-1)',
                    fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                  }}>{g.title}</button>
                  {openGuide === g.id && (
                    <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--line-soft)' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '8px 0' }}>{g.where}</div>
                      <ul style={{ margin: 0, paddingRight: 18, color: 'var(--text-2)', fontSize: 12.5 }}>
                        {g.body.map((b, i) => <li key={i} style={{ marginBottom: 6 }}>{b}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'feedback' && (
          <>
            <div style={{ color: 'var(--text-2)', marginBottom: 12 }}>
              اقتراح، مشكلة، أو استفسار — تصل ملاحظتك إلى مكتب إدارة المشاريع مع اسم الشاشة التي أنت فيها.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setFbCat(c)} style={{
                  padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  background: fbCat === c ? 'var(--accent)' : 'var(--track)',
                  color: fbCat === c ? 'var(--surface-1)' : 'var(--text-2)',
                }}>{c}</button>
              ))}
            </div>
            <textarea
              value={fbMsg} onChange={(e) => { setFbMsg(e.target.value); setFbSent(false) }}
              rows={5} maxLength={4000} placeholder="اكتب ملاحظتك هنا…"
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 'var(--radius-s)',
                border: '1px solid var(--line-ctrl)', background: 'var(--surface-1)',
                color: 'var(--text)', fontSize: 13, lineHeight: 1.7, resize: 'vertical',
              }} />
            {screen && (
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '6px 0 10px' }}>
                سترفق مع الملاحظة الشاشة: <span dir="ltr">{screen}</span>
              </div>
            )}
            <button onClick={sendFeedback} disabled={fbBusy || !fbMsg.trim()} style={{
              padding: '9px 16px', borderRadius: 'var(--radius-s)', fontWeight: 600, fontSize: 13,
              background: fbMsg.trim() ? 'var(--accent)' : 'var(--track)',
              color: fbMsg.trim() ? 'var(--surface-1)' : 'var(--text-3)',
              cursor: fbMsg.trim() && !fbBusy ? 'pointer' : 'not-allowed',
              opacity: fbBusy ? 0.6 : 1,
            }}>{fbBusy ? 'جارٍ الإرسال…' : 'إرسال'}</button>
            {fbSent && (
              <div style={{
                marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius-s)',
                background: 'var(--ok-bg)', color: 'var(--ok-deep)', fontSize: 12.5,
              }}>تم إرسال ملاحظتك. يمكنك إرسال المزيد في أي وقت.</div>
            )}
          </>
        )}

        {tab === 'faq' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQ.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', overflow: 'hidden' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="ies-hover" style={{
                  width: '100%', textAlign: 'right', padding: '9px 12px', background: 'var(--surface-1)',
                  fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.6,
                }}>{f.q}</button>
                {openFaq === i && (
                  <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line-soft)', color: 'var(--text-2)', fontSize: 12.5 }}>{f.a}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
