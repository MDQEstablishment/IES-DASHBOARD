import { useState, useRef, useEffect } from 'react'

// Locale-proof date picker. Native <input type="date"> defers to the OS locale
// in Chromium (ignores lang/html-lang), so on an ar-SA machine it renders
// Arabic-Indic digits + an Arabic calendar. This is a plain text input plus a
// small popover calendar built in JSX with hard-coded English labels and
// String()-based (Latin) digits — identical across browsers and OS locales.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const pad = (n) => String(n).padStart(2, '0')
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime())

export default function DateInput({ value = '', onChange, style, placeholder = 'YYYY-MM-DD', ...rest }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value || '')
  const wrapRef = useRef(null)

  useEffect(() => { setText(value || '') }, [value])
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const base = isISO(text) ? new Date(text + 'T00:00:00') : new Date()
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  useEffect(() => {
    if (open) { const b = isISO(text) ? new Date(text + 'T00:00:00') : new Date(); setView({ y: b.getFullYear(), m: b.getMonth() }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // fire onChange only for a complete valid date or an empty value (native-like)
  const fire = (v) => onChange?.({ target: { value: v } })
  const onType = (e) => {
    const v = e.target.value
    setText(v)
    if (v === '') fire('')
    else if (isISO(v)) fire(v)
  }
  const pick = (d) => {
    const v = `${view.y}-${pad(view.m + 1)}-${pad(d)}`
    setText(v); fire(v); setOpen(false)
  }
  const shift = (delta) => setView((s) => {
    const m = s.m + delta
    return { y: s.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }
  })

  const firstDow = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const selected = isISO(text) ? text : null

  const navBtn = { width: 24, height: 24, borderRadius: 6, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: 'var(--text-3)' }

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'block' }}>
      <input
        {...rest}
        lang="en"
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={onType}
        onFocus={() => setOpen(true)}
        style={{ ...style, paddingRight: 30 }}
      />
      <button type="button" tabIndex={-1} aria-label="Open calendar" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, lineHeight: 1, padding: 2 }}>📅</button>
      {open && (
        <div onMouseDown={(e) => e.preventDefault()} style={{ position: 'absolute', zIndex: 400, top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 12px 30px rgba(15,23,42,.18)', padding: 10, width: 232 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" style={navBtn} onClick={() => shift(-1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 12.5 }}>{MONTHS[view.m]} {view.y}</span>
            <button type="button" style={navBtn} onClick={() => shift(1)}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, fontFamily: 'var(--mono)' }}>
            {DOW.map((d) => <span key={d} style={{ textAlign: 'center', fontSize: 9.5, color: 'var(--text-3)', fontWeight: 700, padding: '2px 0' }}>{d}</span>)}
            {cells.map((d, i) => {
              if (d == null) return <span key={`b${i}`} />
              const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`
              const isSel = iso === selected
              return (
                <button type="button" key={iso} onClick={() => pick(d)}
                  style={{ textAlign: 'center', fontSize: 11.5, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: isSel ? 'var(--accent)' : 'transparent', color: isSel ? '#fff' : 'var(--text)', fontWeight: isSel ? 700 : 500 }}>{d}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
            <button type="button" onClick={() => { setText(''); fire(''); setOpen(false) }} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>Clear</button>
            <button type="button" onClick={() => { const t = new Date(); const v = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; setText(v); fire(v); setOpen(false) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}>Today</button>
          </div>
        </div>
      )}
    </span>
  )
}
