import { useEffect, useState } from 'react'
import Icon from './Icon'
import { subscribeToasts } from '../lib/toast'
import { statusMeta } from '../lib/constants'
import { initials } from '../lib/format'

// Solid-circle avatar (design uses role color + white mono initials)
export function Avatar({ name, color = '#475569', size = 28, title }) {
  return (
    <span title={title || name} style={{
      width: size, height: size, borderRadius: '50%', background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
      fontFamily: 'var(--mono)', fontWeight: 700, fontSize: Math.round(size * 0.38),
    }}>{initials(name)}</span>
  )
}

// Status chip — colored soft pill (design statusMeta style)
export function Chip({ status, label, color, bg }) {
  const [c, b, l] = statusMeta(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6,
      fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
      color: color || c, background: bg || b, whiteSpace: 'nowrap',
    }}>{label || l}</span>
  )
}

export function Card({ children, style, pad = 16, ...rest }) {
  return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: pad, ...style }} {...rest}>{children}</div>
}

export function ProgressBar({ value = 0, max = 100, color = 'var(--accent)', height = 9 }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div style={{ height, borderRadius: 5, background: '#EFF2F6', overflow: 'hidden' }}><div style={{ height: '100%', width: w + '%', background: color }} /></div>
}

// SVG donut ring (KPI cards)
export function RingChart({ value = 0, max = 100, size = 72, color = '#2563EB', track = '#EFF2F6', stroke = 8 }) {
  const r = 26, circ = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(1, value / max) : 0
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, flex: 'none' }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(circ * frac).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 32 32)" />
    </svg>
  )
}

export function Spinner({ size = 18 }) {
  return <span className="ies-spin" style={{ width: size, height: size, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block' }} />
}

export function Loading({ label = 'Loading…' }) {
  return <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-3)', fontSize: 13 }}><Spinner /><span>{label}</span></div>
}

export function Empty({ icon = 'doc', children = 'Nothing here yet.' }) {
  return <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13 }}><span style={{ color: '#CBD5E1' }}><Icon name={icon} size={22} /></span><span>{children}</span></div>
}

// Section card header used across screens
export function CardHead({ title, meta, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {meta && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '.5px' }}>{meta}</div>}
      </div>
      {right}
    </div>
  )
}

export function PageTitle({ kicker, title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
      <div>
        {kicker && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '2px', color: 'var(--text-3)' }}>{kicker}</div>}
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>{title}</h1>
      </div>
      {right}
    </div>
  )
}

// Primary/secondary buttons matching the dc inline style
export function Btn({ variant = 'secondary', icon, children, style, ...rest }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }
  const variants = {
    primary: { background: 'var(--accent)', color: '#fff' },
    secondary: { background: '#fff', color: 'var(--text)', border: '1px solid var(--line)' },
    danger: { background: 'var(--bad)', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--line)' },
  }
  return <button className="ies-hover" style={{ ...base, ...variants[variant], ...style }} {...rest}>{icon && <Icon name={icon} size={15} />}{children}</button>
}

export function Modal({ open, title, onClose, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: width, background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,.3)', display: 'flex', flexDirection: 'column', maxHeight: '86vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button className="ies-hover" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, overflow: 'auto' }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 14 }}><span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>{label}</span>{children}</label>
}

export const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', fontSize: 14 }

export function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => subscribeToasts(setItems), [])
  if (!items.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {items.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 500, boxShadow: '0 12px 30px rgba(15,23,42,.3)', background: t.type === 'err' ? '#B91C1C' : '#0F172A', animation: 'iesToast .16s ease-out' }}>
          <Icon name={t.type === 'err' ? 'alert' : 'check'} size={15} />{t.message}
        </div>
      ))}
    </div>
  )
}
