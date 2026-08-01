import { useState } from 'react'
import Icon from '../Icon'
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
]

const card = {
  background: 'var(--surface-1)', borderRadius: 'var(--radius-l)',
  boxShadow: 'var(--shadow-2)', overflow: 'hidden',
}

export default function MurshidPanel({ screen, onClose }) {
  const [tab, setTab] = useState('ask')
  const [draft, setDraft] = useState('')
  const [openGuide, setOpenGuide] = useState(null)
  const [openFaq, setOpenFaq] = useState(null)
  const help = helpForScreen(screen)

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
                value={draft} onChange={(e) => setDraft(e.target.value)} disabled
                placeholder="اكتب سؤالك…"
                style={{
                  flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 'var(--radius-s)',
                  border: '1px solid var(--line-ctrl)', background: 'var(--raised)',
                  color: 'var(--text)', fontSize: 13,
                }} />
              <button disabled style={{
                padding: '9px 14px', borderRadius: 'var(--radius-s)', fontWeight: 600, fontSize: 13,
                background: 'var(--track)', color: 'var(--text-3)', cursor: 'not-allowed',
              }}>إرسال</button>
            </div>

            <div style={{
              padding: '9px 12px', borderRadius: 'var(--radius-s)', background: 'var(--info-bg)',
              color: 'var(--info)', fontSize: 12.5, marginBottom: 16,
            }}>
              المحادثة الذكية قادمة قريباً. حتى ذلك الحين، الأقسام المجاورة تغطي أغلب الأسئلة.
            </div>

            {help ? (
              <>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{help.title}</div>
                <div style={{ color: 'var(--text-2)', marginBottom: 12 }}>{help.intro}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 7 }}>أسئلة سريعة</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {help.actions.map((a) => (
                    <button key={a} onClick={() => { setDraft(a); setTab('ask') }} className="ies-hover" style={{
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
