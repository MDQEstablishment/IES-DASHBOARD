import { useEffect, useState } from 'react'
import Icon from './Icon'
import { subscribeToasts } from '../lib/toast'
import { pillClass, labelize } from '../lib/constants'
import { initials } from '../lib/format'

export function Spinner() { return <span className="spinner" /> }

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function Empty({ icon = 'Inbox', children = 'Nothing here yet.' }) {
  return (
    <div className="empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={20} color="var(--text-4)" />
      <span>{children}</span>
    </div>
  )
}

export function Pill({ status, label, className }) {
  return <span className={`pill ${className || pillClass(status)}`}>{label ?? labelize(status)}</span>
}

export function Dot({ color = 'gray' }) { return <span className={`dot dot-${color}`} /> }

export function Bar({ value = 0, max = 100, color = 'var(--green)' }) {
  const pctv = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return <div className="bar"><span style={{ width: pctv + '%', background: color }} /></div>
}

export function Avatar({ name, gradient, size = 24, title }) {
  return (
    <span className="avatar" title={title || name}
      style={{ width: size, height: size, background: gradient || 'var(--surface-3)', color: gradient ? '#0F172A' : 'var(--text-2)', border: gradient ? 'none' : '1px solid var(--border)' }}>
      {initials(name)}
    </span>
  )
}

export function Btn({ variant = '', icon, children, className = '', ...rest }) {
  const v = variant ? `btn-${variant}` : ''
  return (
    <button className={`btn ${v} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  )
}

export function PageHead({ kicker, title, sub, actions }) {
  return (
    <div className="page-head">
      <div>
        {kicker && <div className="kicker mb-2">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {actions && <div className="flex center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Card({ title, meta, actions, children, pad = true, style }) {
  return (
    <div className="card" style={style}>
      {(title || actions || meta) && (
        <div className="card-head">
          <div className="flex center gap-3">
            {title && <span className="card-title">{title}</span>}
            {meta && <span className="card-meta">{meta}</span>}
          </div>
          {actions && <div className="flex center gap-2">{actions}</div>}
        </div>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
    </div>
  )
}

export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

export function Modal({ open, title, onClose, children, footer, width }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <span className="card-title">{title}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="X" size={15} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => subscribeToasts(setItems), [])
  if (!items.length) return null
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'err' ? 'err' : ''}`}>
          <Icon name={t.type === 'err' ? 'AlertTriangle' : 'Check'} size={14} />
          {t.message}
        </div>
      ))}
    </div>
  )
}
